import Trello from 'node-trello';
import promisify from 'pify';
import commentActions from './comment-actions';
import debounce from './debounce';
import sync from './sync';

const DEBOUNCE_INTERVAL = 10000;
export default async (db, config = {}) => {
  // try {
  const { sequelize, Sequelize } = db;

  const APP = config.sync.trello.app;
  const USER = config.sync.trello.user;

  if (!APP || !USER) {
    throw new Error('Please set sync.trello.app and user.');
  }

  const trello = new Trello(APP, USER);
  const get = promisify(trello.get.bind(trello));

  config.trello = {
    user: await get('/1/members/me')
  };

  const { Company, Team, Employee, Project } = db.sequelize.models; // eslint-disable-line

  sequelize.define('Trello', {
    trelloId: Sequelize.STRING,
    modelId: Sequelize.STRING,
    type: Sequelize.ENUM('team', 'employee', 'project', 'role') // eslint-disable-line
  });

  await db.sequelize.sync();


  commentActions(trello, db, config);
  let syncing = true;
  sync(trello, db, config).then(() => syncing = false);

  ['afterCreate', 'afterDestroy', 'afterUpdate',
  'afterBulkCreate', 'afterBulkDestroy', 'afterBulkUpdate'].forEach(ev => {
    sequelize.addHook(ev, debounce(() => {
      if (syncing) return;
      commentActions(trello, db, config);
      sync(trello, db, config);
    }, DEBOUNCE_INTERVAL));
  });
};
