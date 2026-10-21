// @file-type javascript
// update at 2026-10-21 12:13

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../script/hour-coupon-auto.js'), 'utf8');
const targetTime = new Date(2026, 9, 21, 11, 0, 0).getTime();

function createPage(start, options = {}) {
  let now = start;
  let nextId = 0;
  const timers = new Map();
  const handlers = new Map();
  const observers = [];
  const actions = [];
  const clicks = [];
  const ignoredClicks = [];
  const logs = [];
  const state = { text: options.locked ? '去解锁' : '立即抢', label: '11:00', display: 'block', dialog: null };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const data = { store: { list: [{
    key: 'DcCouponSpikesV5', componentId: 'test', store: { batchInfoList: [{
      batch_sn: 'target', current_session_time: targetTime / 1000,
      status: options.locked ? 2 : 0, feature: { hv_task: { status: options.locked ? 0 : 1, min_points: 1 } }
    }], score: 2 }
  }] } };
  let response;
  vm.runInNewContext(source, {
    Date: ClockDate,
    console: { log() {} },
    $request: { url: 'https://m.pinduoduo.net/attendance.html?id=197270' },
    $response: { body: '<body><script id="NEXT_DATA">window.__NEXT_DATA__ = ' +
      JSON.stringify(data) + ';</script></body>' },
    $done(value) { response = value.body; }
  });
  const injected = response.match(/<script>(\(function runInPage[\s\S]*?)<\/script>/)[1];
  function mutate(changes) {
    Object.assign(state, changes);
    observers.filter(observer => observer.active).forEach(observer => observer.callback());
  }
  let unlockBusy = false;
  let resolveUnlock;
  let rejectUnlock;
  const unlockPromise = new Promise((resolve, reject) => { resolveUnlock = resolve; rejectUnlock = reject; });
  const instance = {
    store: options.observableList ? {
      batchInfoList: { find(predicate) { return data.store.list[0].store.batchInfoList.find(predicate); } }
    } : data.store.list[0].store,
    onClickCouponItem(batch) {
      assert.equal(batch.batch_sn, 'target');
      if (unlockBusy) return Promise.resolve();
      unlockBusy = true;
      actions.push({ kind: 'unlock', time: now });
      return unlockPromise;
    }
  };
  class Observer {
    constructor(callback) { this.callback = callback; this.active = false; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  const rect = () => ({ width: 100, height: 40 });
  const button = {
    get textContent() { return state.text; },
    get display() { return state.display; },
    getBoundingClientRect: rect,
    click() {
      const kind = state.text === '去解锁' ? 'unlock' : 'claim';
      if (kind === 'unlock') { instance.onClickCouponItem(data.store.list[0].store.batchInfoList[0]); return; }
      if (unlockBusy) { ignoredClicks.push(now); return; }
      actions.push({ kind, time: now });
      if (kind === 'claim') clicks.push(now);
    }
  };
  if (!options.noFiber) {
    button[options.legacyFiber ? '__reactInternalInstance$test' : '__reactFiber$test'] = {
      memoizedProps: { trackingInfo: { page_el_sn: 'test' } },
      return: { stateNode: instance, return: null }
    };
  }
  function dialogs() {
    if (!state.dialog) return [];
    const modal = state.dialog;
    const confirm = {
      textContent: '', display: modal.buttonDisplay || 'block', getBoundingClientRect: rect,
      click() { actions.push({ kind: 'confirm', time: now }); mutate({ dialog: null }); }
    };
    return [{
      display: modal.display || 'block', getBoundingClientRect: rect,
      querySelector(selector) {
        return {
          '.G4TOG23F': { textContent: modal.title || '确定解锁5折神券' },
          '.con92xrh': { textContent: modal.content || '11:00场次吗' },
          '.jV2RSBJA': { textContent: modal.tip || '解锁将消耗1张' },
          '.LIAWcJR3': confirm
        }[selector] || null;
      }
    }];
  }
  vm.runInNewContext(injected, {
    Date: ClockDate,
    console: { log(message) { logs.push(message); } },
    MutationObserver: options.observer === false ? undefined : Observer,
    window: {
      addEventListener(name, callback) { handlers.set(name, callback); },
      removeEventListener(name, callback) {
        if (handlers.get(name) === callback) handlers.delete(name);
      },
      getComputedStyle(element) { return { display: element.display || 'block', visibility: 'visible', opacity: '1' }; }
    },
    document: {
      documentElement: {},
      querySelector(selector) {
        return selector.includes('zBQNqdA3') ? { textContent: state.label } : button;
      },
      querySelectorAll(selector) {
        return selector === '.HMO6QNyo .StG_xOJG' ? dialogs() : [];
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
    assert.ok(observers.every(observer => !observer.active));
  }
  function finishUnlock() { unlockBusy = false; resolveUnlock(); return unlockPromise; }
  async function failUnlock() { unlockBusy = false; rejectUnlock(new Error('test failure')); await Promise.resolve(); }
  function updateCoupon(status, unlockStatus) {
    const batch = data.store.list[0].store.batchInfoList[0];
    batch.status = status;
    batch.feature.hv_task.status = unlockStatus;
    mutate({ text: unlockStatus === 0 ? '去解锁' : status === 0 ? '立即抢' : '待开始' });
  }
  return { timers, handlers, observers, actions, clicks, ignoredClicks, logs, mutate, advance,
    assertStopped, response, finishUnlock, failUnlock, updateCoupon };
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

test('未解锁场次到点后依次触发去解锁、图片确认按钮和立即抢，各一次', async () => {
  const page = createPage(targetTime - 600000, { locked: true });
  const data = JSON.parse(page.response.match(/window\.__NEXT_DATA__ = ([\s\S]*?);<\/script>/)[1]);
  const batch = data.store.list[0].store.batchInfoList[0];
  assert.equal(batch.status, 2, '页面初始券状态必须保持原样');
  assert.equal(batch.feature.hv_task.status, 0, '不能伪造解锁成功');
  page.advance(targetTime - 1);
  assert.equal(page.actions.length, 0);
  assert.equal(page.observers.length, 0, '主动解锁前不监听页面变化');
  page.advance(targetTime);
  assert.deepEqual(page.actions, [{ kind: 'unlock', time: targetTime }]);
  page.advance(targetTime + 100);
  assert.equal(page.actions.length, 1, '等待弹窗时不能重复点击去解锁');
  page.mutate({ dialog: {} });
  assert.deepEqual(page.actions.map(action => action.kind), ['unlock', 'confirm']);
  page.advance(targetTime + 201);
  assert.equal(page.clicks.length, 0, '确认后必须等待页面实际解锁');
  page.mutate({ text: '立即抢' });
  assert.equal(page.clicks.length, 0, '按钮已更新也必须等页面异步锁释放');
  await page.finishUnlock();
  assert.deepEqual(page.actions.map(action => action.kind), ['unlock', 'confirm', 'claim']);
  assert.deepEqual(page.clicks, [targetTime + 201]);
  page.mutate({ dialog: {}, text: '去解锁' });
  page.advance(targetTime + 1000);
  assert.equal(page.actions.length, 3);
  page.assertStopped();
});

test('其他标题、场次、卡数或不可见的弹窗不自动确认', () => {
  const page = createPage(targetTime - 1500, { locked: true });
  page.advance(targetTime);
  for (const dialog of [
    { title: '确定兑换' }, { content: '11:30场次吗' }, { content: '111:00场次吗' },
    { tip: '解锁将消耗2张' }, { display: 'none' }, { buttonDisplay: 'none' }
  ]) {
    page.mutate({ dialog });
    assert.equal(page.actions.length, 1);
  }
  page.mutate({ dialog: {} });
  assert.deepEqual(page.actions.map(action => action.kind), ['unlock', 'confirm']);
  page.handlers.get('pagehide')();
  page.assertStopped();
});

test('没有页面变化监听时，轮询也能完成解锁确认和抢券', async () => {
  const page = createPage(targetTime - 1500, { locked: true, observer: false });
  page.advance(targetTime);
  page.mutate({ dialog: {} });
  page.advance(targetTime + 4);
  page.mutate({ text: '立即抢' });
  await page.finishUnlock();
  page.advance(targetTime + 8);
  assert.deepEqual(page.actions.map(action => action.kind), ['unlock', 'confirm', 'claim']);
  page.assertStopped();
});

test('按钮先显示立即抢、解锁事件仍被异步锁占用时，等待结束后只抢一次', async () => {
  const page = createPage(targetTime - 1500, { locked: true });
  page.advance(targetTime);
  page.mutate({ dialog: {} });
  page.advance(targetTime + 1);
  page.mutate({ text: '立即抢' });
  page.advance(targetTime + 250);
  assert.deepEqual(page.ignoredClicks, [], '不能把唯一一次抢券点击用在异步锁释放前');
  assert.deepEqual(page.actions.map(action => action.kind), ['unlock', 'confirm']);
  await page.finishUnlock();
  assert.deepEqual(page.clicks, [targetTime + 250]);
  assert.deepEqual(page.ignoredClicks, []);
  page.assertStopped();
});

test('页面解锁事件结束后按钮才更新，也能继续抢券', async () => {
  const page = createPage(targetTime - 1500, { locked: true, legacyFiber: true, observableList: true });
  page.advance(targetTime);
  page.mutate({ dialog: {} });
  await page.finishUnlock();
  assert.equal(page.clicks.length, 0);
  page.advance(targetTime + 100);
  page.mutate({ text: '立即抢' });
  assert.deepEqual(page.clicks, [targetTime + 100]);
  page.assertStopped();
});

test('无法定位原页面解锁事件或事件失败时停止，不能误报已经抢券', async () => {
  const missing = createPage(targetTime - 1500, { locked: true, noFiber: true });
  missing.advance(targetTime);
  assert.equal(missing.actions.length, 0);
  missing.assertStopped();
  const failed = createPage(targetTime - 1500, { locked: true });
  failed.advance(targetTime);
  failed.mutate({ dialog: {} });
  await failed.failUnlock();
  failed.mutate({ text: '立即抢' });
  assert.equal(failed.clicks.length, 0);
  failed.assertStopped();
});

test('超时或离开页面后，迟到的解锁完成回调不能再点击', async () => {
  for (const leavePage of [false, true]) {
    const page = createPage(targetTime - 1500, { locked: true });
    page.advance(targetTime);
    page.mutate({ dialog: {} });
    if (leavePage) page.handlers.get('pagehide')();
    else page.advance(targetTime + 60021);
    page.mutate({ text: '立即抢' });
    await page.finishUnlock();
    assert.equal(page.clicks.length, 0);
    page.assertStopped();
  }
});

test('解锁失败或弹窗未出现时不重复消耗卡，到期或离开页面后停止', () => {
  for (const confirmed of [false, true]) {
    const page = createPage(targetTime - 1500, { locked: true });
    page.advance(targetTime);
    if (confirmed) page.mutate({ dialog: {} });
    page.advance(targetTime + 60021);
    page.mutate({ dialog: {}, text: '立即抢' });
    assert.deepEqual(page.actions.map(action => action.kind), confirmed ? ['unlock', 'confirm'] : ['unlock']);
    assert.equal(page.clicks.length, 0);
    page.assertStopped();
  }
  const page = createPage(targetTime - 1500, { locked: true });
  page.advance(targetTime);
  page.handlers.get('pagehide')();
  page.mutate({ dialog: {}, text: '立即抢' });
  assert.equal(page.actions.length, 1);
  page.assertStopped();
});

function processResponse(url, body) {
  const now = targetTime - 600000;
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  let result;
  vm.runInNewContext(source, {
    Date: ClockDate, console: { log() {} }, $request: { url }, $response: { body },
    $done(value) { result = value.body; }
  });
  return result;
}

test('券列表接口响应原样返回，不改写任何券状态', () => {
  const url = 'https://m.pinduoduo.net/api/carnival/hour_coupon/v2/coupon_info_list';
  for (const [unlockStatus, status] of [[0, 0], [0, 2], [1, 0], [1, 2]]) {
    const data = { result: { batch_info_list: [{
      batch_sn: 'target', current_session_time: targetTime / 1000,
      status, feature: { hv_task: { status: unlockStatus, min_points: 1 } }
    }, {
      batch_sn: 'other', current_session_time: targetTime / 1000,
      status: 2, feature: { hv_task: { status: 1 } }
    }, {
      batch_sn: 'target', current_session_time: targetTime / 1000 + 1800,
      status: 2, feature: { hv_task: { status: 1 } }
    }] } };
    const body = JSON.stringify(data, null, 2);
    assert.equal(processResponse(url, body), body);
  }
});

test('卡数不足、查询异常或状态不可处理时不注入解锁流程', () => {
  for (const extra of [
    { score: 0 }, { score: undefined }, { taskApiError: true }, { unlockStatus: 9 }, { batchStatus: 1 }
  ]) {
    const store = Object.assign({ score: 2, batchInfoList: [{
      batch_sn: 'target', current_session_time: targetTime / 1000,
      status: extra.batchStatus ?? 2,
      feature: { hv_task: { status: extra.unlockStatus ?? 0, min_points: 1 } }
    }] }, extra);
    const data = { store: { list: [{ key: 'DcCouponSpikesV5', componentId: 'test', store }] } };
    const body = '<body><script id="NEXT_DATA">window.__NEXT_DATA__ = ' + JSON.stringify(data) + ';</script></body>';
    assert.equal(processResponse('https://m.pinduoduo.net/attendance.html?id=197270', body), body);
  }
});

test('解锁后仍待开始时不点击，接口状态变为可抢后再点击', async () => {
  const page = createPage(targetTime - 1500, { locked: true });
  page.advance(targetTime);
  page.mutate({ dialog: {} });
  page.updateCoupon(2, 1);
  await page.finishUnlock();
  page.advance(targetTime + 100);
  assert.equal(page.clicks.length, 0);
  page.updateCoupon(0, 1);
  assert.deepEqual(page.clicks, [targetTime + 100]);
  page.assertStopped();
});

test('页面初始数据逐字保留，仅添加自动操作脚本', () => {
  const data = { store: { list: [{ key: 'DcCouponSpikesV5', componentId: 'test', store: {
    batchInfoList: [{ batch_sn: 'target', current_session_time: targetTime / 1000,
      status: 2, feature: { hv_task: { status: 1 } } }], extra: '<span>优惠券</span>'
  } }] } };
  const initialScript = '<script id="NEXT_DATA">window.__NEXT_DATA__ = ' + JSON.stringify(data, null, 2) + ';</script>';
  const body = '<body>' + initialScript + '</body>';
  const output = processResponse('https://m.pinduoduo.net/attendance.html?id=197270', body);
  assert.ok(output.includes(initialScript));
  assert.ok(output.includes('function runInPage'));
});
