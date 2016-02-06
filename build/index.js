'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _this = this;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _nodeTrello = require('node-trello');

var _nodeTrello2 = _interopRequireDefault(_nodeTrello);

var _pify = require('pify');

var _pify2 = _interopRequireDefault(_pify);

var _commentActions = require('./comment-actions');

var _commentActions2 = _interopRequireDefault(_commentActions);

var _debounce = require('./debounce');

var _debounce2 = _interopRequireDefault(_debounce);

var _sync = require('./sync');

var _sync2 = _interopRequireDefault(_sync);

var DEBOUNCE_INTERVAL = 10000;
var DEFAULTS = {
  lists: ['todo', 'doing', 'done', 'homeless']
};

exports['default'] = function callee$0$0(db) {
  var config = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

  var
  // try {
  sequelize, Sequelize, APP, USER, trello, get, _db$sequelize$models, Company, Team, Employee, Project, syncing;

  return regeneratorRuntime.async(function callee$0$0$(context$1$0) {
    while (1) switch (context$1$0.prev = context$1$0.next) {
      case 0:
        sequelize = db.sequelize;
        Sequelize = db.Sequelize;
        APP = config.sync.trello.app;
        USER = config.sync.trello.user;

        if (!(!APP || !USER)) {
          context$1$0.next = 6;
          break;
        }

        throw new Error('Please set sync.trello.app and user.');

      case 6:
        trello = new _nodeTrello2['default'](APP, USER);
        get = (0, _pify2['default'])(trello.get.bind(trello));
        context$1$0.t0 = Object;
        context$1$0.next = 11;
        return regeneratorRuntime.awrap(get('/1/members/me'));

      case 11:
        context$1$0.t1 = context$1$0.sent;
        context$1$0.t2 = {
          user: context$1$0.t1
        };
        context$1$0.t3 = DEFAULTS;
        config.trello = context$1$0.t0.assign.call(context$1$0.t0, context$1$0.t2, context$1$0.t3);
        _db$sequelize$models = db.sequelize.models;
        Company = _db$sequelize$models.Company;
        Team = _db$sequelize$models.Team;
        Employee = _db$sequelize$models.Employee;
        Project = _db$sequelize$models.Project;
        // eslint-disable-line

        sequelize.define('Trello', {
          trelloId: Sequelize.STRING,
          modelId: Sequelize.STRING,
          type: Sequelize.ENUM('team', 'employee', 'project', 'role') // eslint-disable-line
        });

        context$1$0.next = 23;
        return regeneratorRuntime.awrap(db.sequelize.sync());

      case 23:

        (0, _commentActions2['default'])(trello, db, config);
        syncing = true;

        (0, _sync2['default'])(trello, db, config).then(function () {
          setTimeout(function () {
            syncing = false;
          }, DEBOUNCE_INTERVAL);
        });

        ['afterCreate', 'afterDestroy', 'afterUpdate', 'afterBulkCreate', 'afterBulkDestroy', 'afterBulkUpdate'].forEach(function (ev) {
          sequelize.addHook(ev, (0, _debounce2['default'])(function () {
            if (syncing) return;
            (0, _commentActions2['default'])(trello, db, config);
            (0, _sync2['default'])(trello, db, config);
          }, DEBOUNCE_INTERVAL));
        });

      case 27:
      case 'end':
        return context$1$0.stop();
    }
  }, null, _this);
};

module.exports = exports['default'];
