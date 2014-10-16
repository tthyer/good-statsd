//Load modules

var Dgram = require('dgram');
var EventEmitter = require('events').EventEmitter;
var GoodUdp = require('..');
var Lab = require('lab');
var lab = exports.lab = Lab.script();

// Declare internals

var internals = {};


internals.isSorted = function (elements) {

	var i = 0;
	var li = elements.length;

	while (i < li && elements[i+1]) {

		if (elements[i].timestamp > elements[i+1].timestamp) {
			return false;
		}
		++i;
	}

	return true;
};


internals.makeServer = function (handler) {

	var server = Dgram.createSocket('udp4');

	server.info = {
		uri: 'udp://127.0.0.1:33333'
	};

	server.on('message', function (message, remote) {

		handler(message, remote);
	});

	server.start = function (callback) {

		server.bind(33333, '127.0.0.1');
		callback();
	};

	server.stop = function (callback) {

		server.close();
		callback();
	};

	return server;
};

// Test shortcuts

var describe = lab.describe;
var it = lab.it;
var expect = Lab.expect;


it('throws an error without using new', function (done) {

	expect(function () {

		var reporter = GoodUdp('www.github.com');
	}).to.throw('GoodUdp must be created with new');

	done();
});

it('throws an error if missing endpoint', function (done) {

	expect(function () {

		var reporter = new GoodUdp(null);
	}).to.throw('endpoint must be a string');

	done();
});

it('does not report if the event que is empty', function (done) {

	var reporter = new GoodUdp('udp://localhost:33333', {
		udpType: 'udp4',
		threshold: 5,
		events: {
			log: '*'
		}
	});

	var result = reporter._sendMessages();
	expect(result).to.not.exist;
	done();
});

describe('_report()', function () {

	it('honors the threshold setting and sends the event in a batch', function (done) {

		var hitCount = 0;
		var ee = new EventEmitter();
		var server = internals.makeServer(function (message, remote) {

			hitCount++;
			var payload = JSON.parse(message.toString());
			var events = payload.events.log;

			expect(payload.schema).to.equal('good-udp');
			expect(events.length).to.equal(5);

			if (hitCount === 1) {
				expect(events[4].id).to.equal(4);
				expect(events[4].event).to.equal('log');
			}

			if (hitCount === 2) {
				expect(events[4].id).to.equal(9);
				expect(events[4].event).to.equal('log');
				server.stop(function () {
					done();
				});
			}
		});

		server.start(function () {

			var reporter = new GoodUdp(server.info.uri, {
				udpType: 'udp4',
				threshold: 5,
				events: {
					log: '*'
				}
			});

			reporter.start(ee, function (err) {

				expect(err).to.not.exist;

				for (var i = 0; i < 10; ++i) {
					ee.emit('report', 'log', {
						id: i,
						value: 'this is data for item ' + i,
						event: 'log'
					});
				}
			});
		});
	});

	it('sends each event individually if threshold is 0', function (done) {

		var hitCount = 0;
		var ee = new EventEmitter();
		var server = internals.makeServer(function (message, remote) {

			hitCount++;
			var payload = JSON.parse(message.toString());

			expect(payload.events).to.exist;
			expect(payload.events.log).to.exist;
			expect(payload.events.log.length).to.equal(1);
			expect(payload.events.log[0].id).to.equal(hitCount - 1);

			if (hitCount === 10) {
				server.stop(function () {
					done();
				});
			}
		});

		server.start(function () {

			var reporter = new GoodUdp(server.info.uri, {
				udpType: 'udp4',
				threshold: 0,
				events: {
					log: '*'
				}
			});

			reporter.start(ee, function (err) {

				expect(err).to.not.exist;

				for (var i = 0; i < 10; ++i) {
					ee.emit('report', 'log', {
						id: i,
						value: 'this is data for item ' + i,
						event: 'log'
					});
				}
			});
		});
	});

	it('sends the events in an envelop grouped by type and ordered by timestamp', function(done) {

		var hitCount = 0;
		var ee = new EventEmitter();
		var server = internals.makeServer(function (message, remote) {

			hitCount++;
			var payload = JSON.parse(message.toString());
			var events = payload.events;

			expect(payload.schema).to.equal('good-udp');

			expect(events.log).to.exist;
			expect(events.request).to.exist;

			expect(internals.isSorted(events.log)).to.equal(true);
			expect(internals.isSorted(events.request)).to.equal(true);

			if (hitCount === 1) {
				expect(events.log.length).to.equal(3);
				expect(events.request.length).to.equal(2);
			}
			else if (hitCount === 2) {
				expect(events.log.length).to.equal(2);
				expect(events.request.length).to.equal(3);
				server.stop(function () {
					done();
				});
			}
		});

		server.start(function () {

			var reporter = new GoodUdp(server.info.uri, {
				udpType: 'udp4',
				threshold: 5,
				events: {
					log: '*',
					request: '*'
				}
			});

			reporter.start(ee, function (err) {

				expect(err).to.not.exist;

				for (var i = 0; i < 10; ++i) {

					var eventType = i % 2 === 0 ? 'log' : 'request';

					ee.emit('report', eventType, {
						id: i,
						value: 'this is data for item ' + 1,
						timestamp: Math.floor(Date.now() + (Math.random() * 10000000000)),
						event: eventType
					});
				}
			});
		});
	});

	it('handles circular object references correctly', function (done) {

		var hitCount = 0;
		var ee = new EventEmitter();
		var server = internals.makeServer(function (message, remote) {

			hitCount++;
			var payload = JSON.parse(message.toString());
			var events = payload.events;

			expect(events).to.exist;
			expect(events.log).to.exist;
			expect(events.log.length).to.equal(5);
			expect(events.log[0]._data).to.equal('[Circular ~.events.log.0]');


			expect(hitCount).to.equal(1);
			server.stop(function () {
				done();
			});
		});

		server.start(function () {

			var reporter = new GoodUdp(server.info.uri, {
				udpType: 'udp4',
				threshold: 5,
				events: {
					log: '*'
				}
			});

			reporter.start(ee, function (err) {

				expect(err).to.not.exist;

				for (var i = 0; i < 5; ++i) {

					var data = {
						event: 'log',
						timestamp: Date.now(),
						id: i
					};

					data._data = data;

					ee.emit('report', 'log', data);
				}
			});
		});
	});
});

describe('stop()', function () {

	it('makes a last attempt to send any remaining log entries', function (done) {

		var hitCount = 0;
		var ee = new EventEmitter();
		var server = internals.makeServer(function (message, remote) {

			hitCount++;
			var payload = JSON.parse(message.toString());
			var events = payload.events;

			expect(events.log).to.exist;
			expect(events.log.length).to.equal(2);

			server.stop(function () {
				done();
			});
		});

		server.start(function () {

			var reporter = new GoodUdp(server.info.uri, {
				udpType: 'udp4',
				threshold: 3,
				events: {
					log: '*'
				}
			});

			reporter.start(ee, function (err) {

				expect(err).to.not.exist;

				ee.emit('report', 'log', {
					event: 'log',
					timestamp: Date.now(),
					id: 1
				});
				ee.emit('report', 'log', {
					event: 'log',
					timestamp: Date.now(),
					id: 2
				});
			});

			reporter.stop();
		});
	});
});

