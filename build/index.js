'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _this3 = this;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _trello = require('trello');

var _trello2 = _interopRequireDefault(_trello);

exports['default'] = function callee$0$0(db) {
  var config = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

  var APP, USER, trello, boards, _db$sequelize$models, Company, Team, Employee, Project, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, board, lists;

  return regeneratorRuntime.async(function callee$0$0$(context$1$0) {
    var _this2 = this;

    while (1) switch (context$1$0.prev = context$1$0.next) {
      case 0:
        APP = config.sync.trello.app;
        USER = config.sync.trello.user;

        if (!(!APP || !USER)) {
          context$1$0.next = 4;
          break;
        }

        throw new Error('Please set sync.trello.app and user.');

      case 4:
        trello = new _trello2['default'](APP, USER);
        context$1$0.next = 7;
        return regeneratorRuntime.awrap(trello.getBoards('me'));

      case 7:
        boards = context$1$0.sent;
        _db$sequelize$models = db.sequelize.models;
        Company = _db$sequelize$models.Company;
        Team = _db$sequelize$models.Team;
        Employee = _db$sequelize$models.Employee;
        Project = _db$sequelize$models.Project;
        _iteratorNormalCompletion = true;
        _didIteratorError = false;
        _iteratorError = undefined;
        context$1$0.prev = 16;
        _iterator = boards[Symbol.iterator]();

      case 18:
        if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
          context$1$0.next = 35;
          break;
        }

        board = _step.value;

        Team.findOrCreate({
          where: {
            name: board.name
          }
        });

        context$1$0.prev = 21;
        context$1$0.next = 24;
        return regeneratorRuntime.awrap(trello.getListsOnBoard(board.id));

      case 24:
        lists = context$1$0.sent;
        context$1$0.next = 27;
        return regeneratorRuntime.awrap(Promise.all(lists.map(function callee$1$0(list) {
          var cards;
          return regeneratorRuntime.async(function callee$1$0$(context$2$0) {
            var _this = this;

            while (1) switch (context$2$0.prev = context$2$0.next) {
              case 0:
                context$2$0.next = 2;
                return regeneratorRuntime.awrap(trello.getCardsOnList(list.id));

              case 2:
                cards = context$2$0.sent;

                cards.forEach(function callee$2$0(card) {
                  return regeneratorRuntime.async(function callee$2$0$(context$3$0) {
                    while (1) switch (context$3$0.prev = context$3$0.next) {
                      case 0:
                        Project.findOrCreate({
                          where: {
                            name: card.name
                          }
                        });

                      case 1:
                      case 'end':
                        return context$3$0.stop();
                    }
                  }, null, _this);
                });

              case 4:
              case 'end':
                return context$2$0.stop();
            }
          }, null, _this2);
        })));

      case 27:
        context$1$0.next = 32;
        break;

      case 29:
        context$1$0.prev = 29;
        context$1$0.t0 = context$1$0['catch'](21);

        console.error('E', context$1$0.t0);

      case 32:
        _iteratorNormalCompletion = true;
        context$1$0.next = 18;
        break;

      case 35:
        context$1$0.next = 41;
        break;

      case 37:
        context$1$0.prev = 37;
        context$1$0.t1 = context$1$0['catch'](16);
        _didIteratorError = true;
        _iteratorError = context$1$0.t1;

      case 41:
        context$1$0.prev = 41;
        context$1$0.prev = 42;

        if (!_iteratorNormalCompletion && _iterator['return']) {
          _iterator['return']();
        }

      case 44:
        context$1$0.prev = 44;

        if (!_didIteratorError) {
          context$1$0.next = 47;
          break;
        }

        throw _iteratorError;

      case 47:
        return context$1$0.finish(44);

      case 48:
        return context$1$0.finish(41);

      case 49:
      case 'end':
        return context$1$0.stop();
    }
  }, null, _this3, [[16, 37, 41, 49], [21, 29], [42,, 44, 48]]);
};

module.exports = exports['default'];
// eslint-disable-line

// eslint-disable-line
