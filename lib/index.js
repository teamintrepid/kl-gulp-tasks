/* eslint-disable no-var, func-names */
var path = require('path');
module.exports.loadTasks = function () {
  require(path.resolve(__dirname, './tasks/tasks'));
};
