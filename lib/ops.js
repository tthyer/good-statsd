'use strict';
var Aggregate = require('./aggregation');
var Metrics = require('./metrics');
var _ = require('lodash');

var internals = {};

internals.getKey = function(event, key) {
  return _.pick(event, key);
};

module.exports = internals.Ops = function(events) {
  var metrics = new Metrics();
  if(events.length > 1) {
    metrics.addMetric('load_requests_mean', Aggregate.mean(events, 'load.requests'), 'gauge');
  } else {
    metrics.addMetric('load_requests_mean', _.pick(events, 'load.requests'), 'gauge');
  }
  return metrics.metrics;
};
