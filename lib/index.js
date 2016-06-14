/* eslint-disable no-var, func-names, global-require */
var path = require('path');
module.exports.loadTasks = function (options) {
  require(path.resolve(__dirname, './tasks/tasks'))(options);
};
