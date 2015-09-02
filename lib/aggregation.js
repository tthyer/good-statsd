'use strict';
var _ = require('lodash');
// var Metrics = require('./metrics');

var internals = {};

internals.sum = function(events, key) {
 return _.chain(events).pluck(key).sum().value();
};

internals.mean = function(events, key) {
  return Math.round(internals.sum(events, key) / events.length);
};

// internals.Aggregate = function(name, value, type) {
//   this.name = name;
//   this.value = value;
//   this.type = type;
// };

// module.exports = internals.Aggregation = function() {
//   // var self = this;
//   this.sum = internals._sum;
//   this.mean = internals._mean;
//   // this.aggregates = [];
//   // this.addGauge = function(key, value) {
//   //   self.aggregates.push(new internals.Aggregate(key, value, 'gauge'));
//   // };
//   // this.addTiming = function(key, value) {
//   //   self.aggregates.push(new internals.Aggregate(key, value, 'timing'));
//   // };
//   return this;
// };
module.exports = internals;