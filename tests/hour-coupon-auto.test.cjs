// @file-type javascript
// update at 2026-10-21 11:08

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../script/hour-coupon-auto.js'), 'utf8');
const targetTime = new Date(2026, 9, 21, 11, 0, 0).getTime();

function createPage(start) {
  let now = start;
  let nextId = 0;
  const timers = new Map();
  const handlers = new Map();
  const clicks = [];
  const logs = [];
  const state = { text: '立即抢', label: '11:00', display: 'block' };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const data = { store: { list: [{
    key: 'DcCouponSpikesV5', componentId: 'test', store: { batchInfoList: [{
      batch_sn: 'target', current_session_time: targetTime / 1000,
      status: 2, feature: { hv_task: { status: 1 } }
    }] }
  }] } };
  let response;
  vm.runInNewContext(source, {
    Date: ClockDate,
    console: { log() {} },
    $request: { url: 'https://m.pinduoduo.net/attendance.html?id=197270' },
    $response: { body: '<body><script id="NEXT_DATA">window.__NEXT_DATA__ = ' +
      JSON.stringify(data) + ';</script></body>' },
    $persistentStore: { write() { return true; } },
    $done(value) { response = value.body; }
  });
  const injected = response.match(/<script>(\(function runInPage[\s\S]*?)<\/script>/)[1];
  function mutate(changes) {
    Object.assign(state, changes);
  }
  const button = {
    get textContent() { return state.text; },
    getBoundingClientRect() { return { width: 100, height: 40 }; },
    click() { clicks.push(now); }
  };
  vm.runInNewContext(injected, {
    Date: ClockDate,
    console: { log(message) { logs.push(message); } },
    window: {
      addEventListener(name, callback) { handlers.set(name, callback); },
      removeEventListener(name, callback) {
        if (handlers.get(name) === callback) handlers.delete(name);
      },
      getComputedStyle() { return { display: state.display, visibility: 'visible', opacity: '1' }; }
    },
    document: {
      documentElement: {},
      querySelector(selector) {
        return selector.includes('zBQNqdA3') ? { textContent: state.label } : button;
      }
    },
    setTimeout(callback, delay) {
      assert.ok(delay >= 0);
      const id = ++nextId;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  });
  function advance(until) {
    let count = 0;
    while (timers.size) {
      const [id, timer] = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
      if (timer.due > until) break;
      timers.delete(id);
      now = timer.due;
      timer.callback();
      assert.ok(++count < 10000, '定时任务应能正常结束');
    }
    now = until;
  }
  function assertStopped() {
    assert.equal(timers.size, 0);
    assert.equal(handlers.size, 0);
  }
  return { timers, handlers, clicks, logs, mutate, advance, assertStopped };
}

test('按钮文字始终不变时，提前1.5秒启动检测，到点只点击一次', () => {
  const page = createPage(targetTime - 600000);
  assert.equal([...page.timers.values()][0].due, targetTime - 1500);
  page.advance(targetTime - 1500);
  page.advance(targetTime - 1);
  assert.equal(page.clicks.length, 0);
  page.advance(targetTime);
  page.advance(targetTime + 1000);
  assert.deepEqual(page.clicks, [targetTime]);
  page.assertStopped();
});

test('提前1.5秒内进入页面时，到点检查仍能点击静态按钮', () => {
  const page = createPage(targetTime - 1493);
  page.advance(targetTime);
  assert.deepEqual(page.clicks, [targetTime]);
  assert.ok(page.logs.some(message => message.includes('晚于目标：0毫秒')));
  page.assertStopped();
});

test('到点后按钮稍晚就绪时，由4毫秒轮询发现', () => {
  const page = createPage(targetTime - 1500);
  page.mutate({ text: '待开抢' });
  page.advance(targetTime + 1);
  page.mutate({ text: '立即抢' });
  page.advance(targetTime + 4);
  assert.deepEqual(page.clicks, [targetTime + 4]);
  page.assertStopped();
});

test('场次不匹配或按钮不可见时不点击，满足条件后才点击', () => {
  const page = createPage(targetTime - 1500);
  page.mutate({ label: '10:30', display: 'none' });
  page.advance(targetTime);
  page.mutate({ label: '11:00' });
  assert.equal(page.clicks.length, 0);
  page.mutate({ display: 'block' });
  page.advance(targetTime + 4);
  assert.deepEqual(page.clicks, [targetTime + 4]);
  page.assertStopped();
});

test('超过60秒仍未就绪时清理定时器和监听，不再点击', () => {
  const page = createPage(targetTime - 1500);
  page.mutate({ text: '待开抢' });
  page.advance(targetTime + 60021);
  page.mutate({ text: '立即抢' });
  assert.equal(page.clicks.length, 0);
  page.assertStopped();
});

test('离开页面时清理预备定时器或正在进行的检测', () => {
  for (const start of [targetTime - 600000, targetTime - 1500]) {
    const page = createPage(start);
    page.handlers.get('pagehide')();
    page.advance(targetTime + 1000);
    page.mutate({ text: '立即抢' });
    assert.equal(page.clicks.length, 0);
    page.assertStopped();
  }
});
