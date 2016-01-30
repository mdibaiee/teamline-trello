'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _this4 = this;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _trello = require('trello');

var _trello2 = _interopRequireDefault(_trello);

var notClosed = function notClosed(a) {
  return !a.closed;
};

exports['default'] = function callee$0$0(db) {
  var config = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

  var APP, USER, trello, boards, _db$sequelize$models, Company, Team, Employee, Project, users, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, board, lists;

  return regeneratorRuntime.async(function callee$0$0$(context$1$0) {
    var _this3 = this;

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
        context$1$0.t0 = notClosed;
        boards = context$1$0.sent.filter(context$1$0.t0);
        _db$sequelize$models = db.sequelize.models;
        Company = _db$sequelize$models.Company;
        Team = _db$sequelize$models.Team;
        Employee = _db$sequelize$models.Employee;
        Project = _db$sequelize$models.Project;
        users = [];
        _iteratorNormalCompletion = true;
        _didIteratorError = false;
        _iteratorError = undefined;
        context$1$0.prev = 18;
        _iterator = boards[Symbol.iterator]();

      case 20:
        if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
          context$1$0.next = 43;
          break;
        }

        board = _step.value;

        Team.findOrCreate({
          where: {
            name: board.name
          }
        });

        context$1$0.t1 = users;
        context$1$0.next = 26;
        return regeneratorRuntime.awrap(trello.getBoardMembers(board.id));

      case 26:
        context$1$0.t2 = context$1$0.sent;
        users = context$1$0.t1.concat.call(context$1$0.t1, context$1$0.t2);
        context$1$0.prev = 28;
        context$1$0.next = 31;
        return regeneratorRuntime.awrap(trello.getListsOnBoard(board.id));

      case 31:
        context$1$0.t3 = notClosed;
        lists = context$1$0.sent.filter(context$1$0.t3);
        context$1$0.next = 35;
        return regeneratorRuntime.awrap(Promise.all(lists.map(function callee$1$0(list) {
          var cards;
          return regeneratorRuntime.async(function callee$1$0$(context$2$0) {
            var _this2 = this;

            while (1) switch (context$2$0.prev = context$2$0.next) {
              case 0:
                context$2$0.next = 2;
                return regeneratorRuntime.awrap(trello.getCardsOnList(list.id));

              case 2:
                context$2$0.t0 = notClosed;
                cards = context$2$0.sent.filter(context$2$0.t0);

                cards.forEach(function callee$2$0(card) {
                  return regeneratorRuntime.async(function callee$2$0$(context$3$0) {
                    var _this = this;

                    while (1) switch (context$3$0.prev = context$3$0.next) {
                      case 0:
                        context$3$0.next = 2;
                        return regeneratorRuntime.awrap(Project.findOrCreate({
                          where: {
                            name: card.name
                          }
                        }));

                      case 2:

                        card.idMembers.forEach(function callee$3$0(id) {
                          var user;
                          return regeneratorRuntime.async(function callee$3$0$(context$4$0) {
                            while (1) switch (context$4$0.prev = context$4$0.next) {
                              case 0:
                                user = users.find(function (a) {
                                  return a.id === id;
                                });
                                context$4$0.next = 3;
                                return regeneratorRuntime.awrap(Employee.findOne({
                                  where: {
                                    username: user.username
                                  }
                                }));

                              case 3:
                              case 'end':
                                return context$4$0.stop();
                            }
                          }, null, _this);
                        });

                      case 3:
                      case 'end':
                        return context$3$0.stop();
                    }
                  }, null, _this2);
                });

              case 5:
              case 'end':
                return context$2$0.stop();
            }
          }, null, _this3);
        })));

      case 35:
        context$1$0.next = 40;
        break;

      case 37:
        context$1$0.prev = 37;
        context$1$0.t4 = context$1$0['catch'](28);

        console.error('E', context$1$0.t4);

      case 40:
        _iteratorNormalCompletion = true;
        context$1$0.next = 20;
        break;

      case 43:
        context$1$0.next = 49;
        break;

      case 45:
        context$1$0.prev = 45;
        context$1$0.t5 = context$1$0['catch'](18);
        _didIteratorError = true;
        _iteratorError = context$1$0.t5;

      case 49:
        context$1$0.prev = 49;
        context$1$0.prev = 50;

        if (!_iteratorNormalCompletion && _iterator['return']) {
          _iterator['return']();
        }

      case 52:
        context$1$0.prev = 52;

        if (!_didIteratorError) {
          context$1$0.next = 55;
          break;
        }

        throw _iteratorError;

      case 55:
        return context$1$0.finish(52);

      case 56:
        return context$1$0.finish(49);

      case 57:
      case 'end':
        return context$1$0.stop();
    }
  }, null, _this4, [[18, 45, 49, 57], [28, 37], [50,, 52, 56]]);
};

module.exports = exports['default'];
// eslint-disable-line
// eslint-disable-line
