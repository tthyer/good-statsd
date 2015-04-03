// Load modules

var Dgram = require('dgram');
var Os = require('os');
var Url = require('url');
var GroupBy = require('lodash.groupby');
var Hoek = require('hoek');
var Stringify = require('json-stringify-safe');
var Squeeze = require('good-squeeze').Squeeze;


var internals = {
	defaults: {
		threshold: 20,
		schema: 'good-udp',
		udpType: 'udp4'
	},
	host: Os.hostname()
};


internals.createEventMap = function (events) {

	var result = GroupBy(events, 'event');

	var keys = Object.keys(result);
	var predicate = function (a, b) {

		return a.timestamp - b.timestamp;
	};

	for (var i = 0, il = keys.length; i < il; ++i) {
		var key = keys[i];
		var eventCollection = result[key];
		eventCollection.sort(predicate);
	}

	return result;
};


module.exports = internals.GoodUdp = function (events, config) {

	if (!(this instanceof internals.GoodUdp)) {
		return new internals.GoodUdp(events, config);
	}

	config = config || {};
	Hoek.assert(config.endpoint, 'config.endpoint must be a string');

	var settings = Hoek.applyToDefaults(internals.defaults, config);
	settings.endpoint = Url.parse(settings.endpoint);

	this._udpClient = Dgram.createSocket(settings.udpType);
	this._streams = {
		squeeze: Squeeze(events)
	};
	this._eventQueue = [];
	this._settings = settings;
};


internals.GoodUdp.prototype.init = function (stream, emitter, callback) {

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

	callback();
};


internals.GoodUdp.prototype._sendMessages = function () {

	if (!this._eventQueue.length) { return; }

	var envelope = {
		host: internals.host,
		schema: this._settings.schema,
		timeStamp: Date.now()
	};

	envelope.events = internals.createEventMap(this._eventQueue);

	var payload = Stringify(envelope);
	payload = new Buffer(payload);

	this._udpClient.send(payload, 0, payload.length, this._settings.endpoint.port, this._settings.endpoint.hostname);
};
