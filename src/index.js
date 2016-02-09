import Trello from 'node-trello';
import commentActions from './comment-actions';
import { debounce, request } from './utils';
import sync from './sync';

const DEBOUNCE_INTERVAL = 5000;
const DEFAULTS = {
  lists: ['todo', 'doing', 'done', 'homeless']
};
export default async (server, db, config = {}) => {
  // try {
  const { sequelize, Sequelize } = db;

  const APP = config.sync.trello.app;
  const USER = config.sync.trello.user;

  if (!APP || !USER) {
    throw new Error('Please set sync.trello.app and user.');
  }

  const trello = new Trello(APP, USER);
  const { get, post } = request(trello);

  config.trello = Object.assign({
    user: await get('/1/members/me')
  }, DEFAULTS);

  const { Company, Team, Employee, Project } = db.sequelize.models; // eslint-disable-line

  sequelize.define('Trello', {
    trelloId: Sequelize.STRING,
    modelId: Sequelize.STRING,
    type: Sequelize.ENUM('team', 'employee', 'project', 'role') // eslint-disable-line
  });

  await db.sequelize.sync();

  let syncing = false;

  const resync = async () => {
    if (syncing) return;
    try {
      await commentActions(trello, db, config);
      await sync(trello, db, config);
    } catch (e) {
      console.error('Trello synchronisation error', e, e.stack);
    }
    syncing = false;
  };

  resync();

  server.on('refresh', resync);

  ['afterCreate', 'afterDestroy', 'afterUpdate',
  'afterBulkCreate', 'afterBulkDestroy', 'afterBulkUpdate'].forEach(ev => {
    sequelize.addHook(ev, debounce(resync, DEBOUNCE_INTERVAL));
  });

  const callbackURL = '/trello-webhook';
  server.route({
    method: 'GET',
    path: callbackURL,
    handler(req, reply) {
      resync();
      reply();
    }
  });

  const idModel = config.trello.user.idOrganizations[0];

  await post('/1/webhooks/', {
    callbackURL: server.info.uri + callbackURL,
    idModel
  });
};
