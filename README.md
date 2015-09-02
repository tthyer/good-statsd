# good-statsd

A reporter that facilitates sending Good Process Monitor metrics to Statsd. This is derivative of [good-udp](https://github.com/hapijs/good-udp), from which it was originally forked.

[![Build Status](https://travis-ci.org/tthyer/good-statsd.svg?branch=master)](https://travis-ci.org/tthyer/good-statsd)
[![Coverage Status](https://coveralls.io/repos/tthyer/good-statsd/badge.svg)](https://coveralls.io/r/tthyer/good-statsd)

## Usage

`good-statsd` implements the reporter interface for [good process monitor](https://github.com/hapijs/good). It allows a formatter function to be defined for a log type that will have access to a [node-statsd client](https://github.com/sivy/node-statsd).

`good-statsd` closes the node-statsd client when it receives a 'stop' event from the [hapi](https://github.com/hapijs/hapi) server.

## good-statsd
### GoodStatsd (events, config)

The constructor creates a new GoodStatsd object with the following arguments
- `events` - A required object specifying which events the reporter will handle.
    - `key` - One of the supported [good events](https://github.com/hapijs/good) indicating the hapi event to subscribe to. * NOTE: currently only the `ops` event is supported *
    - `value` - A single string or an array of strings to filter incoming events. "\*" indicates no filtering. `null` and `undefined` are assumed to be "\*"
- `config` - A required configuration object.
  - `endpoint` - The full path to remote server to transmit logs. Required.
  - `interval` - The period of time in milliseconds to hold events before transmission. Defaults to 0. Set to `0` to have every event start transmission instantly. In the case of an interval, data aggregation will be performed on metrics before submission. Optional.

  ## good-statsd Methods
  ### `goodstatsd.init(stream, emitter, callback)`
  Initializes the reporter with the following arguments:

  - `stream` - A Node readable [stream](https://nodejs.org/api/stream.html) that will be the source of data for this reporter. It is assumed that `stream` is in `objectMode`.
  - `emitter` - An [event emitter](https://nodejs.org/api/events.html) object.
  - `callback` - A callback to execute when the start function has complete all the necessary set up steps and is ready to receive data.

  When `stream` emits an "end" event, `good-statsd` will transmit any events remaining in its internal buffer to attempt to prevent data loss. When a "stop" event is emitted by the event emitter, `good-statsd` will likewise tranmit any remaining events and close the node-statsd client.

## Example configuration for hapi
```javascript
var Hapi = require('hapi');
var Good = require('good');
var GoodStatsd = require('good-statsd');

var server = new Hapi.Server();
server.connection();
server.register([{
  register: Good,
  options: {
    reporters: [{
      reporter: GoodStatsd,
      events: { ops: '*' },
      config: {
        endpoint: 'udp://localhost:8125'
      }
    }]
  }}],
  function(err) {
    console.log('Error registering plugins: %s', err);
  }
);
```
