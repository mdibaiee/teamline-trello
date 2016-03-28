import promisify from 'pify';
import _ from 'lodash';

export function wait(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

export function log(...args) {
  if (this.silent) return false;

  console.log(...args);
}

export function error(...args) {
  if (this.silent) return false;

  console.error(...args);
}

export function logger(config = {}) {
  const cfg = _.get(config, 'sync.trello');
  if (typeof cfg.silent === 'undefined') cfg.silent = false;

  return {
    log: log.bind(cfg),
    error: error.bind(cfg)
  };
}

const WAIT_TIME = 500;
let c = 0;
export function request(trello) {
  const get = promisify(trello.get.bind(trello));
  const post = promisify(trello.post.bind(trello));
  const put = promisify(trello.put.bind(trello));
  const del = promisify(trello.del.bind(trello));

  return {
    async get(...args) {
      c++;
      const result = await get(...args);
      await wait(WAIT_TIME);
      return result;
    },
    async post(...args) {
      c++;
      const result = await post(...args);
      await wait(WAIT_TIME);
      return result;
    },
    async put(...args) {
      c++;
      const result = await put(...args);
      await wait(WAIT_TIME);
      return result;
    },
    async del(...args) {
      c++;
      const result = await del(...args);
      await wait(WAIT_TIME);
      return result;
    }
  };
}

/* istanbul ignore next */
setInterval(() => {
  log(c, 'requests in last minute');
  c = 0;
}, 60 * 1000);
