'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

exports['default'] = function (bot) {
  // read configurations from bot.data, users set bot.data in initialize.js
  var data = bot.data.template;

  // add a help record for your plugin's commands
  bot.help('example', 'shows an example', 'example <name>');
};

module.exports = exports['default'];
