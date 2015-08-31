'use strict';
var Dgram = require('dgram');
var EventEmitter = require('events').EventEmitter;
var GoodStatsd = require('..');
var Hoek = require('hoek');
var Stream = require('stream');
var test = require('tape');

var internals = {};

internals.readStream = function (done) {
  var result = new Stream.Readable({ objectMode: true });
  result._read = Hoek.ignore;
  if (typeof done === 'function') {
    result.once('end', done);
  }
  return result;
};

internals.makeServer = function (handler) {
  var server = Dgram.createSocket('udp4');
  server.info = {
    uri: 'udp://127.0.0.1:8125'
  };
  server.on('message', function (message, remote) {
    handler(message, remote);
  });
  server.start = function (callback) {
    server.bind(8125, '127.0.0.1');
    callback();
  };
  server.stop = function (callback) {
    server.unref();
    server.close();
    callback();
  };
  return server;
};

test('a valid configuration contains an endpoint and at least one formatter', function(t) {
  var config = {
    endpoint: 'udp://localhost:8125',
    formatters: { ops: function() {} }
  };

  t.doesNotThrow(function () {
    new GoodStatsd({ ops: '*' }, config);
  }, 'Reporter starts without error with a valid config');
  t.end();
});

test('configuration fails validation when endpoint is missing', function(t) {
  var config = {
    formatters: { ops: function() {} }
  };

  t.throws(function () {
    new GoodStatsd({ ops: '*' }, config);
  }, 'An error is thrown when the endoint is missing');
  t.end();
});

test('configuration fails validation when no formatters are defined', function(t) {
  var config = {
    endpoint: 'udp://localhost:8125',
    formatters: {}
  };

  t.throws(function () {
    new GoodStatsd({ ops: '*' }, config);
  }, 'An error is thrown when no formatters are defined');
  t.end();
});

test('invokes formatter', function(t) {
  var stream = internals.readStream();

  var config = {
    endpoint: 'udp://localhost:8125',
    threshold: 0,
    formatters: { log: function(event) {
      t.equal(event.value, 'this is data', 'formatter invoked with expected event');
      t.end();
    } }
  };

  var reporter = new GoodStatsd({ log: '*' }, config);
  reporter.init(stream, new EventEmitter(), function (err) {
    if(err) {
      t.fail('Reporter failed to initialize: ' + err);
      t.end();
    }

    stream.push({
      value: 'this is data',
      event: 'log'
    });
  });
});

test('remains silent when event queue empty', function(t) {
  var config = { endpoint: 'udp://localhost:8125', threshold: 5, formatters: { log: function() {}} };
  var reporter = new GoodStatsd({ log: '*' }, config);
  var result = reporter._sendMessages();
  t.notOk(result, 'result should be falsy');
  t.end();
});

test('groups events and invokes event formatters for event types', function(t) {
  var stream = internals.readStream();

  var config = {
    endpoint: 'udp://localhost:8125',
    threshold: 0,
    formatters: {
      request: function(event) {
        t.equal(event.data.responseTime, 123, 'request event sent to request formatter');
      },
      ops: function(event) {
        t.equal(event.os.uptime, 90, 'ops event sent to ops formatter');
      }
    }
  };

  var reporter = new GoodStatsd({ request: '*', ops: '*' }, config);
  reporter.init(stream, new EventEmitter(), function (err) {
    if(err) {
      t.fail('Reporter failed to initialize: ' + err);
      t.end();
    }
    var length = 2;
    t.plan(length);
    stream.push({
      event: 'request',
      timestamp: Date.now(),
      tags: ['request', 'proxyResponse'],
      data: {
        proxyHost: 'example.com',
        proxyPath: '/foo/bar',
        responseTime: 123
      },
      pid: 12345
    });
    stream.push({
      event: 'ops',
      timestamp: Date.now(),
      host: '127.0.0.1', 
      os: {
        uptime: 90,
        mem: {
          total: 16375000000,
          free: 9577000000
        }
      }
    });
  });
});

test('a formatter can send a message through this.client', function(t) {
  var stream = internals.readStream();
  var emit = new EventEmitter();
  var messageHandler = function (message) {
    t.equal(message.toString(), 'log:42|g', 'expected message was received');
    server.stop(function () {
      emit.emit('stop');
      t.end();
    });
  };
  var server = internals.makeServer(messageHandler);

  var reporter;
  var reportSetup = function() {
    reporter = new GoodStatsd({ log: '*' }, {
      endpoint: 'udp://localhost:8125',
      threshold: 0,
      formatters: {
        log: function(event) {
          this.client.gauge(event.event, event.value);
        }
      }
    });
    reporter.init(stream, emit, function (err) {
      t.error(err, 'Server started without error');
      stream.push({
        value: 42,
        event: 'log'
      });
    });
  };
  server.start(reportSetup);
});

test('remaining message are sent when the stream end event occurs', function(t) {
  var stream = internals.readStream();
  var emitter = new EventEmitter();

  t.plan(2);
  var config = {
    endpoint: 'udp://localhost:8125',
    threshold: 3,
    formatters: {
      log: function(event) {
        t.ok(event, 'an event reached the formatter');
      }
    } 
  };

  var reporter = new GoodStatsd({ log: '*' }, config);
  reporter.init(stream, emitter, function (err) {
    if(err) {
      t.fail('Reporter failed to initialize: ' + err);
      t.end();
    }

    stream.push({ event: 'log', value: 'this is data'});
    stream.push({ event: 'log', value: 'this is more data'});
    stream.push(null);
  });
});

test('remaining message are sent when the emitter stop event occurs', function(t) {
  var stream = internals.readStream();
  var emitter = new EventEmitter();

  t.plan(2);
  var config = {
    endpoint: 'udp://localhost:8125',
    threshold: 3,
    formatters: {
      log: function(event) {
        t.ok(event, 'an event reached the formatter');
      }
    } 
  };

  var reporter = new GoodStatsd({ log: '*' }, config);
  reporter.init(stream, emitter, function (err) {
    if(err) {
      t.fail('Reporter failed to initialize: ' + err);
      t.end();
    }

    var count = 0;
    stream.on('data', function() {
      if(++count == 2) {
        emitter.emit('stop');
      }
    });
    stream.push({ event: 'log', value: 'this is data'});
    stream.push({ event: 'log', value: 'this is more data'});
  });
});
