import 'mocha';
import { expect } from 'chai';
import sync from '../src/index';
// import sinon from 'sinon';
import bodyParser from 'body-parser';
import express from 'express';
import teamline from 'teamline';
import teamlineConfig from './config';
import { USER, USERS, BOARDS, LISTS, CARDS } from './fixtures';

describe('trello sync', function main() {
  // ******************** \\
  // ** INITIALIZATION ** \\
  // ******************** \\
  const LONG_DELAY = 10000;

  const config = {
    _test: true,

    sync: {
      trello: {
        app: 'TEST_APP_TOKEN',
        user: 'TEST_USER_TOKEN'
      }
    }
  };

  let trello;
  let server;
  let db;
  let temp;
  let models;
  const listeners = [];
  before(async function before() {
    this.timeout(0);

    if (listeners[0]) listeners[0].close();
    if (listeners[1]) listeners[1].close();

    trello = express();
    trello.use(bodyParser.json());
    trello.use(bodyParser.urlencoded({ extended: true }));

    listeners[0] = trello.listen(8088);
    config._host = 'http://127.0.0.1:8088';

    server = express();
    listeners[1] = server.listen(8089);

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
      console.log(request._parsedUrl.pathname);
      const id = request.params.id === 'me' ? USER.id : request.params.id;
      response.json(BOARDS.filter(a => a.idMembers.includes(id)));
      next();
    });

    trello.get('/1/boards?/:board/members', (request, response, next) => {
      console.log(request._parsedUrl.pathname);
      const b = BOARDS.find(a => a.id === request.params.board);
      const boardMembers = USERS.filter(a => b.idMembers.includes(a.id));
      response.json(boardMembers);
      next();
    });

    trello.get('/1/boards?/:board/lists', (request, response, next) => {
      console.log(request._parsedUrl.pathname);
      const boardLists = LISTS.filter(a => a.idBoard === request.params.board);
      response.json(boardLists);
      next();
    });

    trello.get('/1/boards?/:board/cards', (request, response, next) => {
      console.log(request._parsedUrl.pathname);
      const boardLists = LISTS.filter(a => a.idBoard === request.params.board);
      const cards = boardLists.reduce((a, b) => a.concat(b.cards), []);

      response.json(cards);
      next();
    });

    if (temp) temp.destroy();
    temp = await teamline(teamlineConfig);
    db = temp.db;

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

    try {
      await sync(server, db, config);
    } catch (e) {
      console.error('e');
    }
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
        const memberBoards = BOARDS.filter(a => a.idMembers.includes(USER.id));

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
          const memberBoards = BOARDS.filter(a => a.idMembers.includes(user.id));
          const teams = await employee.getTeams();
          const et = teams.map(a => a.name);
          const bt = memberBoards.map(a => a.name);

          return expect(et).to.eql(bt);
        }));
      });

      it('should assign managers to teams correctly', async () => {
        const board = BOARDS[1];

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
        );

        const cards = CARDS.map(({ name, desc }) => {
          const list = LISTS.find(a => a.cards.some(b => b.name === name));

          return { name, description: desc, state: list.name };
        });

        await Promise.all(CARDS.map(async card => {
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
          const board = BOARDS.find(a => {
            const lists = LISTS.filter(b => b.idBoard === a.id);

            return lists.some(b => b.cards.some(c => c.name === project.name));
          });

          return expect(project.Team.name).to.equal(board.name);
        });
      });

      it('should assign employees to projects', async () => {
        const projects = await models.Project.findAll({ where: {}, include: [models.Employee] });

        projects.map(project => {
          const employeeNames = project.Employees.map(a => a.username);
          const card = CARDS.find(a => a.name === project.name);
          const validation = USERS.filter(a => card.idMembers.includes(a.id));
          const validationNames = validation.map(a => a.username);

          return expect(validationNames).to.eql(employeeNames);
        });
      });
    });
  });

  describe('edge cases', () => {
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

      // update projects
      CARDS[0].name = 'something_renamed';
      CARDS[0].desc = 'more_cool';

      // move card to another list, must update state
      LISTS[1].cards.push(LISTS[0].cards.pop());
      // move list to another team, should update projects
      LISTS[1].idBoard = BOARDS[1].id;

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
        const project = await models.Project.findOne({
          where: {
            name: CARDS[0].name
          },
          include: [models.Team]
        });

        expect(project).to.be.ok;
        expect(project.state).to.equal(LISTS[1].name);
        expect(project.description).to.equal(CARDS[0].desc);
        expect(project.Team.name).to.equal(BOARDS[1].name);
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
  });

  /**
   * CLEAR DATABASE
   */
  after(async function after() {
    this.timeout(0);

    for (const key of Object.keys(models)) {
      const model = models[key];

      await model.destroy({ where: {} });
    }
  });
});
