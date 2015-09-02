'use strict';
var Async = require('async');
var Hoek = require('hoek');
var Joi = require('joi');
var Ops = require('./ops');
var Os = require('os');
var Squeeze = require('good-squeeze').Squeeze;
var StatsdClient = require('node-statsd');
var Url = require('url');
var _ = require('lodash');

var internals = {
  defaults: {
    interval: 0,
    schema: 'good-statsd',
    host: Os.hostname()
  }
};

internals._schema = Joi.object({
  endpoint: Joi.string().required(),
  interval: Joi.number().integer().min(0)
});

internals._createEventMap = function(events) {
  return _.groupBy(events, 'event');
};

module.exports = internals.GoodStatsd = function (events, config) {

  if (!(this instanceof internals.GoodStatsd)) {
    return new internals.GoodStatsd(events, config);
  }

  config = config || {};
  Joi.assert(config, internals._schema, 'Reporter configuration fails validation');

  var settings = Hoek.applyToDefaults(internals.defaults, config);
  settings.endpoint = Url.parse(settings.endpoint);

  this._streams = { squeeze: new Squeeze(events) };
  this._eventQueue = [];
  this._settings = settings;

  this._client = new StatsdClient({
    host: this._settings.endpoint.hostname,
    port: this._settings.endpoint.port, 
    prefix: this._settings.prefix
  });
};

internals.GoodStatsd.prototype.init = function (stream, emitter, callback) {
  var self = this;

  var onData;
  if(this._settings.interval > 0) {
    this._timeout = setInterval(this._sendMessages, this._settings.interval);
    onData = function(data) {
      self._eventQueue.push(data);
    };
  } else {
    onData = function(data) {
      self._sendMessages(data);
    };
  }
  this._streams.squeeze.on('data', onData);
  this._streams.squeeze.on('end', this._cleanup.bind(self));

  emitter.on('stop', this._cleanup.bind(self));

  stream.pipe(this._streams.squeeze);

  callback();
};

internals.GoodStatsd.prototype._clearInterval = function() {
  if(this._timeout) {
    clearInterval(this._timeout);
  }
};

internals.GoodStatsd.prototype._cleanup = function() {
  var self = this;
  this._clearInterval();
  this._settings.interval > 0 ? this._sendMessages(null, function() {
    self._client.close();
  }) : self._client.close();
};

internals.GoodStatsd.prototype._formatMetrics = function(events) {
  var eventMap = internals._createEventMap(events);
  var ops = new Ops(eventMap.ops);
  // will there be other custom aggregations, or is this just for ops?
  // if so merge their contents, pass back to sendMessages
  // which will send the data through the node-statsd client
  return ops;
};

internals.GoodStatsd.prototype._sendMessages = function (event, sendMessagesCallback) {
  var self = this;
  var events = event ? [event] : this._eventQueue;
  if (!events.length) { return; }
  var metrics = this._formatMetrics(events);
  var iterator = function(item, callback) {
    var clientCallback = function(err) {
      if(err) {
        console.log('Problem sending message through node-statsd client:', err);
      }
      callback();
    };
    var func = self._client[item.type];
    func.call(self._client, item.name, item.value, clientCallback);
  };
  var done = function() {
    self._eventQueue.length = 0;
    if(sendMessagesCallback) { sendMessagesCallback(); }
  };
  Async.each(metrics, iterator, done);
};
