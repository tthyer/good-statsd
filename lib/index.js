'use strict';
var Hoek = require('hoek');
var Joi = require('joi');
var Os = require('os');
var Squeeze = require('good-squeeze').Squeeze;
var StatsdClient = require('node-statsd');
var Url = require('url');

var groupBy = require('lodash').groupBy;
var each = require('lodash').forEach;
var forOwn = require('lodash').forOwn;

// TODO: replace the threshold concept with a time interval
var internals = {
  defaults: {
    threshold: 20,
    schema: 'good-statsd',
    host: Os.hostname(),
    formatters: {}
  }
};

internals._schema = Joi.object({
  endpoint: Joi.string().required(),
  threshold: Joi.number().integer().min(0),
  formatters: Joi.object()
    .pattern(/ops|response|log|error|request|wreck/, Joi.func())
    .min(1)
    .required()
    .notes('At least one formatter must be included in the configuration')
});

module.exports = internals.GoodStatsd = function (events, config) {

  if (!(this instanceof internals.GoodStatsd)) {
    return new internals.GoodStatsd(events, config);
  }

  config = config || {};
  Joi.assert(config, internals._schema, 'Reporter configuration fails validation');
  // TODO: Error if formatters are missing for the specific registered events

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

  this._streams.squeeze.on('data', function (data) {
    self._eventQueue.push(data);
    if (self._eventQueue.length >= self._settings.threshold) {
      self._sendMessages();
      self._eventQueue.length = 0;
    }
  });

  this._streams.squeeze.on('end', function () {
    self._sendMessages();
  });

  stream.pipe(this._streams.squeeze);

  emitter.on('stop', function() {
    self._sendMessages();
    self.exit();
  });

  callback();
};

internals.GoodStatsd.prototype.exit = function() {
  this._client.close();
};

internals.GoodStatsd.prototype._sendMessages = function () {
  var self = this;
  if (!this._eventQueue.length) { return; }
  var eventMap = groupBy(this._eventQueue, 'event');
  forOwn(eventMap, function(value, key) {
    if(self._settings.formatters[key]) {
      var collection = eventMap[key];
      var formatter = self._settings.formatters[key];
      each(collection, function(item) {
        formatter.call({ client: self._client }, item);
      });
    }
  });
};
