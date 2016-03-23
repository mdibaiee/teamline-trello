import 'mocha';
import chai from 'chai';
import sync from '../src/index';
// import sinon from 'sinon';
import express from 'express';
import teamline from 'teamline';

chai.should();

// const DELAY = 10;
const LONG_DELAY = 3000;

const config = {
  sync: {
    trello: {
      app: 'TEST_APP_TOKEN',
      user: 'TEST_USER_TOKEN'
    }
  }
};
const USER = {
  id: 'test_id',
  idBoards: ['test_board_id']
};

let trello;
let server;
let db;
const listeners = [];
beforeEach(async () => {
  if (listeners[0]) listeners[0].close();
  if (listeners[1]) listeners[1].close();

  trello = express();
  listeners[0] = trello.listen(8088);
  config._host = 'http://127.0.0.1:8088/';

  server = express();
  listeners[1] = server.listen(8089);

  trello.get('*', (request, response) => {
    response.json(USER);
  });

  db = (await teamline(require('../test-config'))).db;
});

describe('trello sync', function main() {
  this.timeout(LONG_DELAY);

  describe('initialization', () => {
    it('should set config.trello to response of /1/members/me', async done => {
      await sync(server, db, config);

      setImmediate(() => {
        config.trello.user.should.deep.equal(USER);
        done();
      });
    });
  });
});
