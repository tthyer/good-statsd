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
    server.close();
    callback();
  };
  return server;
};

test('the configuration must contain an endpoint', function(t) {

  t.doesNotThrow(function () {
    new GoodStatsd({ ops: '*' }, { endpoint: 'udp://localhost:8125'});
  }, 'Reporter starts without error with a valid config');

  t.throws(function () {
    new GoodStatsd({ ops: '*' }, {});
  }, 'An error is thrown when the endoint is missing');
  
  t.end();
});

test('allows creating without using new', function (t) {
  var reporter = GoodStatsd({ log: '*' }, { endpoint: 'udp://localhost:8125' });
  t.ok(reporter, 'report was created');
  t.end();
});

test('remains silent when event queue empty', function(t) {
  var reporter = new GoodStatsd({ log: '*' }, { endpoint: 'udp://localhost:8125' });
  var result = reporter._sendMessages();
  t.notOk(result, 'result should be falsy');
  t.end();
});

test('sends messages individually when interval is 0', function(t) {
  var stream = internals.readStream();
  var emitter = new EventEmitter();
  var count = 0;

  var done = function() {
    server.stop(function () {
      t.end();
    });
  };

  var messageHandler = function (message) {
    if(message.toString().indexOf('load_requests_mean') !== 0) {
      t.fail('Unexpected message received: ' + message.toString());
    }
    if(++count === 3) {
      emitter.emit('stop');
      t.pass('message handler called three times');
      done();
    }
  };

  var server = internals.makeServer(messageHandler);

  server.start(function() {
    var config = {
      endpoint: 'udp://localhost:8125',
      interval: 0
    };
    var reporter = new GoodStatsd({ ops: '*' }, config);
    reporter.init(stream, emitter, function (err) {
      if(err) {
        t.fail('Reporter failed to initialize: ' + err);
        t.end();
      }
      var time = Date.now();

      stream.push({event: 'ops', timestamp: time - 2000, load: { requests: 4 }});
      stream.push({event: 'ops', timestamp: time - 1000, load: { requests: 8 }});
      stream.push({event: 'ops', timestamp: time, load: { requests: 10 }});
    });
  });
});

test('remaining messages are sent when the stream end event occurs', function(t) {
  var stream = internals.readStream();
  var emitter = new EventEmitter();

  var done = function() {
    server.stop(function () {
      t.end();
    });
  };

  var messageHandler = function (message) {
    t.equal(message.toString(), 'load_requests_mean:7|g', 'expected message was received');
    done();
  };

  var server = internals.makeServer(messageHandler);

  server.start(function() {
    var config = {
      endpoint: 'udp://localhost:8125',
      interval: 10000
    };
    var reporter = new GoodStatsd({ ops: '*' }, config);
    reporter.init(stream, emitter, function (err) {
      if(err) {
        t.fail('Reporter failed to initialize: ' + err);
        t.end();
      }
      var time = Date.now();
      stream.push({event: 'ops', timestamp: time - 2000, load: { requests: 4 }});
      stream.push({event: 'ops', timestamp: time - 1000, load: { requests: 8 }});
      stream.push({event: 'ops', timestamp: time, load: { requests: 10 }});
      stream.push(null);
    });
  });
});

test('remaining messages are sent when the emitter stop event occurs', function(t) {
  var stream = internals.readStream();
  var emitter = new EventEmitter();
  var count = 0;

  var done = function() {
    server.stop(function () {
      t.end();
    });
  };

  var messageHandler = function (message) {
    t.equal(message.toString(), 'load_requests_mean:7|g', 'expected message was received');
    done();
  };

  var server = internals.makeServer(messageHandler);

  server.start(function() {
    var config = {
      endpoint: 'udp://localhost:8125',
      interval: 10000
    };
    var reporter = new GoodStatsd({ ops: '*' }, config);
    reporter.init(stream, emitter, function (err) {
      if(err) {
        t.fail('Reporter failed to initialize: ' + err);
        t.end();
      }
      var time = Date.now();
      stream.on('data', function() {
        if(++count === 3) {
          emitter.emit('stop');
        }
      });
      stream.push({event: 'ops', timestamp: time - 2000, load: { requests: 4 }});
      stream.push({event: 'ops', timestamp: time - 1000, load: { requests: 8 }});
      stream.push({event: 'ops', timestamp: time, load: { requests: 10 }});
    });
  });
});
