import Trello from 'node-trello';
import commentActions from './comment-actions';
import { request } from './utils';
import sync from './sync';
import hooks from './hooks';

const DEFAULTS = {
  lists: ['todo', 'doing', 'done', 'homeless']
};
export default async (server, db, config = {}) => {
  try {
    const { sequelize, Sequelize } = db;

    const APP = config.sync && config.sync.trello ? config.sync.trello.app : null;
    const USER = config.sync && config.sync.trello ? config.sync.trello.user : null;

    if (!APP || !USER) {
      throw new Error('Please set sync.trello.app and user.');
    }

    const trello = new Trello(APP, USER);
    const { get } = request(trello);
    if (config._host) {
      trello.host = config._host;
    }

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
      syncing = true;
      try {
        await sync(trello, db, config);
      } catch (e) {
        console.error('Trello synchronisation error', e, e.stack);
      }
      if (config.comment === false) {
        try {
          await commentActions(trello, db, config);
        } catch (e) {
          console.error('Trello commenting error', e, e.stack);
        }
      }
      syncing = false;
    };

    server.on('refresh', resync);

    if (config._test) await resync();
    else resync();

    hooks(trello, server, db, config);

    // const INTERVAL = 10000;
    // setInterval(resync, INTERVAL);

    return { resync, hooks };
  } catch (e) {
    console.error(e);
  }
};
