import 'mocha';
import { expect } from 'chai';
import sync from '../src/index';
import bodyParser from 'body-parser';
import express from 'express';
import teamline from 'teamline';
import teamlineConfig from './config';
import { USER, USERS, BOARDS, LISTS, CARDS } from './fixtures';
import _ from 'lodash';

describe('trello sync', function main() {
  // ******************** \\
  // ** INITIALIZATION ** \\
  // ******************** \\
  const LONG_DELAY = 10000;
  const TEAM_BOARDS = BOARDS.filter(b => !b.name.toLowerCase().includes('roles'));
  const ROLE_BOARDS = BOARDS.filter(b => b.name.toLowerCase().includes('roles'));
  const TEAM_LISTS = LISTS.filter(a => _.find(TEAM_BOARDS, { id: a.idBoard }));
  const ROLE_LISTS = LISTS.filter(a => _.find(ROLE_BOARDS, { id: a.idBoard }));
  const TEAM_CARDS = CARDS.filter(a => TEAM_LISTS.some(b => b.cards.includes(a)));
  const ROLE_CARDS = CARDS.filter(a => ROLE_LISTS.some(b => b.cards.includes(a)));

  const config = {
    sync: {
      trello: {
        _test: true,
        app: 'TEST_APP_TOKEN',
        user: 'TEST_USER_TOKEN',
        silent: true,
        // silent: false,
        webhook: false
      },
    },
  };

  let trello;
  let server;
  let db;
  let temp;
  let models;
  let listener;
  before(async function before() {
    this.timeout(0);

    trello = express();
    trello.use(bodyParser.json());
    trello.use(bodyParser.urlencoded({ extended: true }));

    if (listener) listener.close();
    listener = trello.listen(8088);
    config._host = 'http://127.0.0.1:8088';

    trello.get('/1/members?/:id?', (request, response, next) => {
      if (!request.params.id) {
        response.json(USERS);
      } else if (request.params.id === 'me') {
        response.json(USER);
      } else {
        response.json(USER.find(a => a.id === request.params.id));
      }

      next();
    });

    trello.get('/1/boards?/:id?', (request, response, next) => {
      if (!request.params.id) {
        response.json(BOARDS);
      } else {
        const board = BOARDS.find(a => a.id === request.params.id);
        response.json(board);
      }

      next();
    });

    trello.get('/1/cards?/:id?', (request, response, next) => {
      if (!request.params.id) {
        response.json(CARDS);
      } else {
        const card = CARDS.find(a => a.id === request.params.id);
        response.json(card);
      }

      next();
    });

    trello.get('/1/lists?/:id?', (request, response, next) => {
      if (!request.params.id) {
        response.json(CARDS);
      } else {
        const list = LISTS.find(a => a.id === request.params.id);
        response.json(list);
      }
      next();
    });

    trello.get('/1/members?/:id/boards', (request, response, next) => {
      const id = request.params.id === 'me' ? USER.id : request.params.id;
      response.json(BOARDS.filter(a => a.idMembers.includes(id)));
      next();
    });

    trello.get('/1/boards?/:board/members', (request, response, next) => {
      const b = BOARDS.find(a => a.id === request.params.board);
      const boardMembers = USERS.filter(a => b.idMembers.includes(a.id));
      response.json(boardMembers);
      next();
    });

    trello.get('/1/boards?/:board/lists', (request, response, next) => {
      const boardLists = LISTS.filter(a => a.idBoard === request.params.board);
      response.json(boardLists);
      next();
    });

    trello.get('/1/boards?/:board/cards', (request, response, next) => {
      const boardLists = LISTS.filter(a => a.idBoard === request.params.board);
      const cards = boardLists.reduce((a, b) => a.concat(b.cards), []);

      response.json(cards);
      next();
    });

    if (temp) temp.destroy();
    temp = await teamline({
      pass: false,
      database: 'teamline_test',
      ...teamlineConfig
    });
    db = temp.db;
    server = temp.server;
    server.register(require('inject-then'), err => {
      if (err) throw err;
    });

    models = db.sequelize.models;
    for (const key of Object.keys(models)) {
      const model = models[key];

      await model.destroy({ where: {} });
    }

    await models.Employee.bulkCreate([{
      username: USER.username,
      firstname: USER.fullName.split(' ')[0],
      lastname: USER.fullName.split(' ')[1]
    }, {
      username: USERS[1].username,
      firstname: USERS[1].fullName.split(' ')[0],
      lastname: USERS[1].fullName.split(' ')[1]
    }]);

    await sync(server, db, config);
  });

  // ******************** \\
  // ****** TESTS ******* \\
  // ******************** \\

  this.timeout(LONG_DELAY);
  describe('initialization', () => {
    it('should set config.trello to response of /1/members/me', async () => {
      expect(config.trello.user).to.deep.equal(USER);
    });
  });

  describe('simple sync', () => {
    config.sync.trello.comment = false;

    context('teams', () => {
      it('should create a team for each board', async () => {
        const memberBoards = TEAM_BOARDS.filter(a => a.idMembers.includes(USER.id));

        const teams = await models.Team.findAll({
          where: {
            name: {
              $or: memberBoards.map(a => a.name)
            }
          }
        });

        await Promise.all(memberBoards.map(async board => {
          const t = await models.Trello.findOne({
            where: {
              trelloId: board.id,
              type: 'team'
            }
          });

          expect(+t.modelId).to.be.oneOf(teams.map(a => a.id));
        }));

        expect(teams.map(a => a.name)).to.eql(memberBoards.map(a => a.name));
      });

      it('should fetch board\'s members and set them as employees of team', async () => {
        const employees = await models.Employee.findAll({ where: {} });
        await Promise.all(employees.map(async employee => {
          const user = USERS.find(a => a.username === employee.username);
          const memberBoards = TEAM_BOARDS.filter(a => a.idMembers.includes(user.id));
          const teams = await employee.getTeams();
          const et = teams.map(a => a.name);
          const bt = memberBoards.map(a => a.name);

          return expect(et).to.eql(bt);
        }));
      });

      it('should assign managers to teams correctly', async () => {
        const board = TEAM_BOARDS[1];

        const team = await models.Team.findOne({
          where: {
            name: board.name
          }
        });

        const managers = await team.getManagers();

        expect(managers.map(a => a.name)).to.eql([USER.name]);
      });
    });

    context('projects', () => {
      it('should create projects and set it\'s properties', async () => {
        const projects = await models.Project.findAll({ where: {} });

        const properties = projects.map(({ name, state, description }) =>
          ({ name, state, description })
        ).sort((a, b) => a.name.length - b.name.length);

        const cards = TEAM_CARDS.map(({ name, desc }) => {
          const list = TEAM_LISTS.find(a => a.cards.some(b => b.name === name));

          return { name, description: desc, state: list.name };
        }).sort((a, b) => a.name.length - b.name.length);

        await Promise.all(TEAM_CARDS.map(async card => {
          const t = await models.Trello.findOne({
            where: {
              trelloId: card.id,
              type: 'project'
            }
          });

          expect(+t.modelId).to.be.oneOf(projects.map(a => a.id));
        }));

        expect(properties).to.eql(cards);
      });

      it('should assign projects to their team', async () => {
        const projects = await models.Project.findAll({ where: {}, include: [models.Team] });

        projects.map(project => {
          const board = TEAM_BOARDS.find(a => {
            const lists = LISTS.filter(b => b.idBoard === a.id);

            return lists.some(b => b.cards.some(c => c.name === project.name));
          });

          return expect(project.Team.name).to.equal(board.name);
        });
      });

      it('should assign employees to projects', async () => {
        const projects = await models.Project.findAll({ where: {}, include: [models.Employee] });

        projects.forEach(project => {
          const employeeNames = project.Employees.map(a => a.username);
          const card = _.find(CARDS, { name: project.name });
          const validation = USERS.filter(a => card.idMembers.includes(a.id));
          const validationNames = validation.map(a => a.username);

          return expect(validationNames).to.eql(employeeNames);
        });
      });
    });

    context('roles', () => {
      it('should create a role for each card and assign it to it\'s team (list name)', async () => {
        const roles = await models.Role.findAll({ where: {}, include: [models.Team] });

        roles.forEach(role => {
          const card = _.find(ROLE_CARDS, { name: role.name });
          const list = ROLE_LISTS.find(a => a.cards.includes(card));

          return expect(role.Teams[0]).to.be.ok &&
                 expect(role.Teams[0].name).to.equal(list.name) &&
                 expect(role.name).to.equal(card.name) &&
                 expect(role.description).to.equal(card.desc);
        });

        await Promise.all(ROLE_CARDS.map(async role => {
          const t = await models.Trello.findOne({
            where: {
              trelloId: role.id,
              type: 'role'
            }
          });

          expect(t).to.be.ok;
          expect(+t.modelId).to.be.oneOf(roles.map(a => a.id));
        }));
      });
    });
  });

  describe('updates', () => {
    const closedBoards = [];
    const homelessTest = {};
    let homeless;
    before(async function beforeEdge() {
      // Create a Team without a Trello board, should close the team
      closedBoards.push(await models.Team.create({
        name: 'a_team_without_board'
      }));
      closedBoards.push(await models.Team.create({
        name: 'another_team_without_a_board_with_trello_model'
      }));
      await models.Trello.create({
        modelId: closedBoards[1].id,
        trelloId: 'nonsene',
        type: 'team'
      });

      closedBoards.push(await models.Team.create({
        name: 'test_3',
        closed: false
      }));
      await models.Trello.create({
        modelId: closedBoards[2].id,
        trelloId: BOARDS[2].id,
        type: 'team'
      });

      // update teams
      BOARDS[0].name = 'test_renamed';
      ROLE_LISTS[0].name = 'test_renamed';

      // update projects
      CARDS[0].name = 'something_renamed';
      CARDS[0].desc = 'more_cool';

      // update employees
      CARDS[0].idMembers.push(CARDS[1].idMembers.pop());

      // move card to another list, must update state
      LISTS[1].cards.push(LISTS[0].cards.pop());
      // move list to another team, should update projects
      LISTS[1].idBoard = BOARDS[1].id;

      // update roles
      ROLE_CARDS[0].name = 'some renamed role';
      ROLE_CARDS[0].desc = 'something else';

      // update employees
      ROLE_CARDS[0].idMembers.push(ROLE_CARDS[1].idMembers.pop());

      // move card to another list, must update team
      ROLE_LISTS[1].cards.push(ROLE_LISTS[0].cards.shift());

      // Homeless Projects
      homeless = await models.Project.create({
        name: 'homeless_project'
      });

      homeless.setTeam(await models.Team.findOne({ where: { name: BOARDS[1].name } }));
      const user = await models.Employee.findOne({ where: { username: USER.username } });
      homeless.setEmployees([user]); // eslint-disable-line
      homeless.Employees = [user];

      trello.post('/1/boards?/:id/lists?', (request, response, next) => {
        homelessTest.list = {
          idBoard: request.params.id,
          body: request.body,
          id: 0
        };

        response.send(homelessTest.list);
        next();
      });

      trello.post('/1/lists?/:id/cards?', (request, response, next) => {
        homelessTest.card = {
          idList: request.params.id,
          body: request.body,
          id: 0
        };

        response.send(homelessTest.card);
        next();
      });

      await sync(server, db, config);
    });

    context('teams', async () => {
      it('should close teams without a trello board', async () => {
        await Promise.all(closedBoards.map(async board => {
          const team = await models.Team.findOne({
            where: {
              name: board.name
            }
          });

          expect(team.closed).to.equal(true);
        }));
      });

      it('should update team names', async () => {
        const team = await models.Team.findOne({
          where: {
            name: BOARDS[0].name
          }
        });

        expect(team).to.be.ok;
      });
    });

    context('projects', async () => {
      it('should update projects', async () => {
        { // CARD 0
          const project = await models.Project.findOne({
            where: {
              name: CARDS[0].name
            },
            include: [models.Team, models.Employee]
          });

          expect(project).to.be.ok;
          expect(project.state).to.equal(LISTS[1].name);
          expect(project.description).to.equal(CARDS[0].desc);
          expect(project.Team).to.be.ok;
          expect(project.Team.name).to.equal(BOARDS[1].name);

          const employees = project.Employees.map(a => a.name);
          const users = USERS.filter(a => CARDS[0].idMembers.includes(a.id)).map(a => a.name);

          expect(employees).to.eql(users);
        }
        { // CARD 1
          const project = await models.Project.findOne({
            where: {
              name: CARDS[1].name
            },
            include: [models.Team, models.Employee]
          });

          const employees = project.Employees.map(a => a.name);
          const users = USERS.filter(a => CARDS[1].idMembers.includes(a.id)).map(a => a.name);
          expect(employees).to.eql(users);
        }
      });

      it('should create cards for Homeless Projects', async () => {
        expect(homelessTest.list.idBoard).to.equal(BOARDS[1].id);
        expect(homelessTest.list.body.name).to.equal('Homeless Projects');

        expect(+homelessTest.card.idList).to.equal(homelessTest.list.id);
        expect(homelessTest.card.body.name).to.equal(homeless.name);
        const employeeTrello = USERS.find(a => a.username === homeless.Employees[0].username);
        expect(homelessTest.card.body.idMembers[0]).to.equal(employeeTrello.id);
      });
    });

    context('roles', () => {
      it('should update roles', async () => {
        { // ROLE_CARDS 0
          const card = ROLE_CARDS[0];
          const role = await models.Role.findOne({
            where: {
              name: card.name
            },
            include: [models.Employee, models.Team]
          });

          expect(role).to.be.ok;
          expect(role.name).to.equal(card.name);
          expect(role.description).to.equal(card.desc);
          expect(role.Teams[0]).to.be.ok;
          expect(role.Teams[0].name).to.equal(BOARDS[1].name);

          const employees = role.Employees.map(a => a.name);
          const users = USERS.filter(a => card.idMembers.includes(a.id)).map(a => a.name);

          expect(employees).to.eql(users);
        }
        { // ROLE_CARDS 1
          const card = ROLE_CARDS[1];
          const role = await models.Role.findOne({
            where: {
              name: card.name
            },
            include: [models.Employee]
          });

          const employees = role.Employees.map(a => a.name);
          const users = USERS.filter(a => card.idMembers.includes(a.id)).map(a => a.name);

          expect(employees).to.eql(users);
        }
      });
    });
  });

  describe('destruction!', () => {
    let removedCard;
    before(async () => {
      // should destroy the `Trello` instance if the model is removed
      await models.Role.destroy({
        where: {
          name: ROLE_CARDS[0].name
        }
      });

      // should close the instance if trello is closed
      CARDS[0].closed = true;

      // should close the instance and destroy trello instance if it's removed from trello
      removedCard = CARDS.splice(1, 1)[0];

      await sync(server, db, config);
    });

    it('should destroy the `Trello` instance if model is destroyed', async () => {
      const t = await models.Trello.findOne({
        where: {
          trelloId: ROLE_CARDS[0].name
        }
      });

      expect(t).not.to.be.ok;
    });

    it('should close the model instance if trello is closed', async () => {
      const p = await models.Project.findOne({
        where: {
          name: CARDS[0].name
        }
      });

      expect(p).to.be.ok;
      expect(p.state).to.equal('closed');
    });

    it('should destroy model instance and trello instance if remote is removed', async () => {
      const p = await models.Project.findOne({
        where: {
          name: removedCard.name
        }
      });

      expect(p).not.to.be.ok;

      const t = await models.Trello.findOne({
        where: {
          trelloId: removedCard.name
        }
      });

      expect(t).not.to.be.ok;
    });

    after(async () => {
      CARDS[0].closed = false;
      CARDS.splice(1, 0, removedCard);

      const project = await models.Project.findOne({
        name: removedCard.name
      });

      await project.update({
        state: LISTS[1].name
      });
    });
  });

  describe('comments', () => {
    const test = {};
    before(async () => {
      const action = await models.Action.create({
        name: 'test_action'
      });

      const project = await models.Project.findOne({
        where: {
          name: CARDS[0].name
        }
      });

      const employee = await models.Employee.findOne({
        where: {
          username: USER.username
        }
      });

      project.addAction(action);
      action.setProject(project);
      action.setEmployee(employee);
      employee.addAction(action);

      trello.post('/1/cards?/:id/actions?/comments?', (request, response, next) => {
        test.card = {
          id: request.params.id
        };

        test.action = {
          id: 0,
          data: {
            text: request.body.text
          },
          idMemberCreator: config.trello.user.id,
          date: new Date()
        };
        CARDS[0].actions.push(test.action);

        response.send(test.action);
        next();
      });

      trello.delete('/1/actions?/:id', (request, response, next) => {
        test.del = {
          id: request.params.id
        };

        response.send(test.action);
        next();
      });

      config.sync.trello.sync = false;
      config.sync.trello.comment = true;
      await sync(server, db, config);
    });

    it('should post a comment on card', async () => {
      expect(test.card.id).to.equal(CARDS[0].id);
    });

    it('should remove the comment if there is no more action there', async () => {
      await models.Action.destroy({ where: {} });

      await sync(server, db, config);

      expect(test.del).to.be.ok;
      expect(+test.del.id).to.equal(+test.action.id);
    });

    after(() => {
      config.sync.trello.sync = true;
      config.sync.trello.comment = false;
    });
  });

  describe('hooks', () => {
    const path = '/trello-webhook';
    before(async () => {
      await sync(server, db, config);

      config.sync.trello.webhook = { path };
      config.sync.trello.sync = false;
      config.sync.trello.comment = false;

      await sync(server, db, config);
    });

    context('webhooks', () => {
      context('createCard', () => {
        it('should create a project on `createCard`', async () => {
          const index = CARDS.push({
            id: 'test_hook_card',
            name: 'hook card',
            desc: 'createCard description',
            idMembers: [],
            closed: false
          }) - 1;
          const card = CARDS[index];
          const list = LISTS[0];
          const board = BOARDS[0];
          list.cards.push(card);

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'createCard',
                data: { board, list, card }
              }
            }
          });

          const project = await models.Project.findOne({
            where: {
              name: card.name
            },
            include: [models.Team]
          });

          expect(project).to.be.ok;
          expect(project.name).to.equal(card.name);
          expect(project.description).to.equal(card.desc);
          expect(project.Team).to.be.ok;
          expect(project.Team.name).to.equal(board.name);
          CARDS.pop();
          list.cards.pop();
        });

        it('should create a role on `createCard`', async () => {
          const index = CARDS.push({
            name: 'hook role',
            id: 'test_hook_role',
            desc: 'hook role description',
            idMembers: [],
            closed: false
          }) - 1;

          const card = CARDS[index];
          const list = ROLE_LISTS[0];
          const board = ROLE_BOARDS[0];
          list.cards.push(card);

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'createCard',
                data: { board, list, card }
              }
            }
          });

          const role = await models.Role.findOne({
            where: {
              name: card.name
            },
            include: [models.Team]
          });

          expect(role).to.be.ok;
          expect(role.name).to.equal(card.name);
          expect(role.description).to.equal(card.desc);
          expect(role.Teams[0]).to.be.ok;
          expect(role.Teams[0].name).to.equal(list.name);
          CARDS.pop();
          list.cards.pop();
        });
      });

      context('updateCard', () => {
        it('should update project information', async () => {
          const card = CARDS[0];
          const list = LISTS[0];
          const board = BOARDS[0];
          card.name = 'new name';
          card.desc = 'new description';

          const updatedList = LISTS[1];
          list.cards.push(card);

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'updateCard',
                data: {
                  board, card,
                  listBefore: list,
                  listAfter: updatedList
                }
              }
            }
          });

          const project = await models.Project.findOne({
            where: {
              name: card.name
            }
          });

          expect(project).to.be.ok;
          expect(project.name).to.equal(card.name);
          expect(project.description).to.equal(card.desc);
          expect(project.state).to.equal(updatedList.name);

          card.closed = true;
          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'updateCard',
                data: {
                  board, card
                }
              }
            }
          });

          const closed = await models.Project.findOne({
            where: {
              name: card.name
            }
          });

          expect(closed).to.be.ok;
          expect(closed.state).to.equal('closed');
        });

        it('should update role information', async () => {
          const card = ROLE_CARDS[0];
          card.name = 'new role name';
          card.desc = 'new role description';
          const list = ROLE_LISTS[0];
          const updatedList = ROLE_LISTS[1];
          const board = ROLE_BOARDS[0];

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'updateCard',
                data: {
                  card, board,
                  listBefore: list,
                  listAfter: updatedList
                }
              }
            }
          });

          const role = await models.Role.findOne({
            where: {
              name: card.name
            },
            include: [models.Team]
          });

          expect(role).to.be.ok;
          expect(role.name).to.equal(card.name);
          expect(role.description).to.equal(card.desc);
          expect(role.Teams[0]).to.be.ok;
          expect(role.Teams[0].name).to.equal(updatedList.name);
        });
      });

      context('deleteCard', () => {
        it('should close project', async () => {
          const card = CARDS[0];
          const list = LISTS[0];
          const board = BOARDS[0];

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'deleteCard',
                data: {
                  card, list, board
                }
              }
            }
          });

          const project = await models.Project.findOne({
            where: {
              name: card.name
            }
          });

          expect(project).to.be.ok;
          expect(project.state).to.equal('closed');
        });

        it('should close role', async () => {
          const card = ROLE_CARDS[0];
          const list = ROLE_LISTS[0];
          const board = ROLE_BOARDS[0];

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'deleteCard',
                data: {
                  card, list, board
                }
              }
            }
          });

          const role = await models.Role.findOne({
            where: {
              name: card.name
            }
          });

          expect(role).to.be.ok;
          expect(role.closed).to.be.true;
        });
      });

      context('addMemberToCard', () => {
        it('should add member to project', async () => {
          const card = CARDS[0];
          const board = BOARDS[0];
          const user = USERS[1];

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'addMemberToCard',
                data: {
                  card, board,
                  idMember: user.id
                }
              }
            }
          });

          const project = await models.Project.findOne({
            where: {
              name: card.name
            },
            include: [models.Employee]
          });

          expect(project).to.be.ok;
          expect(project.Employees.map(a => a.username)).to.include.members([user.username]);
        });

        it('should add member to role', async () => {
          const card = ROLE_CARDS[0];
          const board = ROLE_BOARDS[0];
          const user = USERS[1];

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'addMemberToCard',
                data: {
                  card, board,
                  idMember: user.id
                }
              }
            }
          });

          const role = await models.Role.findOne({
            where: {
              name: card.name
            },
            include: [models.Employee]
          });

          expect(role).to.be.ok;
          expect(role.Employees.map(a => a.username)).to.include.members([user.username]);
        });
      });

      context('removeMemberFromCard', () => {
        it('should remove employee from project', async () => {
          const card = CARDS[0];
          const board = BOARDS[0];
          const user = USERS[1];

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'removeMemberFromCard',
                data: {
                  card, board,
                  idMember: user.id
                }
              }
            }
          });

          const project = await models.Project.findOne({
            where: {
              name: card.name
            },
            include: [models.Employee]
          });

          expect(project).to.be.ok;
          expect(project.Employees.map(a => a.username)).not.to.include.members([user.username]);
        });

        it('should add member to role', async () => {
          const card = ROLE_CARDS[0];
          const board = ROLE_BOARDS[0];
          const user = USERS[1];

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'removeMemberFromCard',
                data: {
                  card, board,
                  idMember: user.id
                }
              }
            }
          });

          const role = await models.Role.findOne({
            where: {
              name: card.name
            },
            include: [models.Employee]
          });

          expect(role).to.be.ok;
          expect(role.Employees.map(a => a.username)).not.to.include.members([user.username]);
        });
      });

      context('addMemberToBoard', () => {
        it('should add the member to team', async () => {
          const board = BOARDS[0];
          const user = USERS[1];

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'addMemberToBoard',
                data: {
                  board,
                  idMemberAdded: user.id
                }
              }
            }
          });

          const team = await models.Team.findOne({
            where: {
              name: board.name
            },
            include: [models.Employee]
          });

          expect(team).to.be.ok;
          expect(team.Employees).to.be.ok;
          expect(team.Employees.map(a => a.username)).to.include.members([user.username]);
        });
      });

      context('removeMemberFromBoard', () => {
        it('should remove the member from team', async () => {
          const board = BOARDS[0];
          const user = USERS[1];

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'removeMemberFromBoard',
                data: {
                  board,
                  idMember: user.id
                }
              }
            }
          });

          const team = await models.Team.findOne({
            where: {
              name: board.name
            },
            include: [models.Employee]
          });

          expect(team).to.be.ok;
          expect(team.Employees).to.be.ok;
          expect(team.Employees.map(a => a.username)).not.to.include.members([user.username]);
        });
      });

      context('makeAdminOfBoard', () => {
        it('should set the member as manager of team', async () => {
          const board = BOARDS[0];
          const user = USERS[1];

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'makeAdminOfBoard',
                data: {
                  board,
                  idMember: user.id
                }
              }
            }
          });

          const team = await models.Team.findOne({
            where: {
              name: board.name
            }
          });

          const managers = await team.getManagers();

          expect(team).to.be.ok;
          expect(managers).to.be.ok;
          expect(managers.map(a => a.username)).to.include.members([user.username]);
        });
      });

      context('makeNormalMemberOfBoard', () => {
        it('should demote the member to a normal employee', async () => {
          const board = BOARDS[0];
          const user = USERS[1];

          await server.injectThen({
            method: 'POST',
            url: path,
            payload: {
              action: {
                type: 'makeNormalMemberOfBoard',
                data: {
                  board,
                  idMember: user.id
                }
              }
            }
          });

          const team = await models.Team.findOne({
            where: {
              name: board.name
            }
          });

          const managers = await team.getManagers();

          expect(team).to.be.ok;
          expect(managers).to.be.ok;
          expect(managers.map(a => a.username)).not.to.include.members([user.username]);
        });
      });
    });

    context('database hooks', () => {
      context('actions', () => {
        it('should run comments', async (done) => {
          trello.post('/1/cards?/:id/actions?/comments?', (request) => {
            expect(request.params.id).to.equal(CARDS[1].id);
            done();
          });

          const action = await models.Action.create({
            name: 'test database hooks'
          });
          const project = await models.Project.findOne({
            where: {
              name: CARDS[1].name
            }
          });
          const emp = await models.Employee.findOne({
            where: {
              username: USER.username
            }
          });
          action.setProject(project);
          action.setEmployee(emp);
          project.addAction(action);
        });
      });

      context('projects', () => {
        it('should post a homeless project and assign the employee', async (done) => {
          const project = await models.Project.create({
            name: 'some new project db hook',
            description: 'something!'
          });

          const emp = await models.Employee.findOne({
            where: {
              username: USER.username
            }
          });

          const team = await models.Team.findOne({
            where: {
              name: BOARDS[0].name
            }
          });

          project.addEmployee(emp);
          project.setTeam(team);
          team.addProject(project);
          emp.addProject(project);

          // create homeless projects list
          trello.get('/1/lists?/:id/cards?', (request, response, next) => {
            expect(request.params.id).to.equal('0');

            response.json([]);
            next();
          });
          trello.post('/1/lists?/:id/cards?', (request, response, next) => {
            expect(request.params.id).to.equal('0');
            expect(request.body.name).to.equal(project.name);
            expect(request.body.desc).to.equal(project.description);
            next();
            done();
          });
        });
      });
    });
  });

  /**
   * CLEAR DATABASE
   */
  after(async function after() {
    this.timeout(0);

    for (const key of Object.keys(models)) {
      const model = models[key];

      await model.destroy({ where: {}, hooks: false });
    }
  });
});
