'use strict';

var internals = {};

internals.Metric = function(name, value, type) {
  this.name = name;
  this.value = value;
  this.type = type;
};

module.exports = internals.Metrics = function() {
  var self = this;
  this.metrics = [];
  this.addMetric = function(name, value, type) {
    self.metrics.push(new internals.Metric(name, value, type));
  };
};