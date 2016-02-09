import promisify from 'pify';

export function wait(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
export function debounce(func, delay, immediate) {
  let timeout;
  return function () {
    const context = this;
    const args = arguments;
    const later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, delay);
    if (callNow) func.apply(context, args);
  };
}

const WAIT_TIME = 2000;
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

let t = 0;
setInterval(() => {
  t++;
  console.log('on average, ', c / t, 'requests per minute');
}, 60 * 1000);
