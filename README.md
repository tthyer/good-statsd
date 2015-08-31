# good-statsd

A reporter that facilitates sending Good Process Monitor metrics to Statsd. This is derivative of [good-udp](https://github.com/hapijs/good-udp), from which it was originally forked.

## Usage

`good-statsd` implements the reporter interface for [good process monitor](https://github.com/hapijs/good). It allows a formatter function to be defined for a log type that will have access to a [node-statsd client](https://github.com/sivy/node-statsd).

`good-statsd` closes the node-statsd client when it receives a 'stop' event from the [hapi](https://github.com/hapijs/hapi) server.

## good-statsd
### GoodStatsd (events, config)

The constructor creates a new GoodStatsd object with the following arguments
- `events` - A required object specifying which events the reporter will handle.
    - `key` - One of the supported [good events](https://github.com/hapijs/good) indicating the hapi event to subscribe to
    - `value` - A single string or an array of strings to filter incoming events. "\*" indicates no filtering. `null` and `undefined` are assumed to be "\*"
- `config` - A required configuration object.
  - `endpoint` - The full path to remote server to transmit logs. Required.
  - `threshold` - The number of events to hold before transmission. Defaults to `20`. Set to `0` to have every event start transmission instantly. It is strongly suggested to have a set threshold to make data transmission more efficient. Optional.  *Note: the threshold concept will be changed to a timeInterval, which makes more sense for statsd's realtime metrics aggregation.*
  - `formatters` - An object that has functions to handle each type of event.
    - `key` - One of the good events specified in events above.
    - `value` - A function that will receive that event type. It has access to the node-statsd client in its scope through `this.client`.


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
        endpoint: 'udp://localhost:8125',
        formatters: {
          ops: function(event) {
            this.client.gauge('requests', event.load.requests);
          }
        }
      }
    }]
  }}],
  function(err) {
    console.log('Error registering plugins: %s', err);
  }
);
```
