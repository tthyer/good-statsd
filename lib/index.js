// Load modules

var Dgram = require('dgram');
var Os = require('os');
var Url = require('url');

var GoodReporter = require('good-reporter');
var Hoek = require('hoek');
var Stringify = require('json-stringify-safe');


var internals = {
	defaults: {
		threshold: 20,
		schema: 'good-udp',
		udpType: 'udp4'
	},
	host: Os.hostname()
};


internals.createEventMap = function (events) {

	var eventTypes = ['error', 'ops', 'request', 'log'];
	var result = {};

	eventTypes.forEach(function (event) {
		var filter = events.filter(function (item) {
			return item.event === event;
		});

		// Sort the events oldest > newest
		filter.sort(function (a, b) {

			return a.timestamp - b.timestamp;
		});

		if(filter.length) {
			result[event] = filter;
		}
	});

	return result;
};


module.exports = internals.GoodUdp = function (endpoint, options) {

	Hoek.assert(this.constructor === internals.GoodUdp, 'GoodUdp must be created with new');
	Hoek.assert(typeof endpoint === 'string', 'endpoint must be a string');
	Hoek.assert(typeof options.udpType === 'string', 'udpType must be a string')

	var settings = Hoek.clone(options);
	settings = Hoek.applyToDefaults(internals.defaults, settings);
	settings.endpoint = Url.parse(endpoint);

	this._udpClient = Dgram.createSocket(options.udpType);

	GoodReporter.call(this, settings);
};


Hoek.inherits(internals.GoodUdp, GoodReporter);


internals.GoodUdp.prototype.start = function (emitter, callback) {

	emitter.on('report', this._handleEvent.bind(this));
	return callback(null);
};


internals.GoodUdp.prototype.stop = function () {

	this._sendMessages();
};


internals.GoodUdp.prototype._report = function (event, eventData) {

	this._eventQueue.push(eventData);
	if (this._eventQueue.length >= this._settings.threshold) {
		this._sendMessages();
		this._eventQueue.length = 0;
	}
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
