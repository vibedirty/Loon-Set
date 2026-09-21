// @file-type javascript
// update at 2026-09-21 09:59

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../script/v2ex-signin.js'), 'utf8');
const dailyUrl = 'https://v2ex.com/mission/daily';
const redeemUrl = `${dailyUrl}/redeem?once=1234`;
const ready = '<input onclick="location.href=\'/mission/daily/redeem?once=1234\'" />';
const signed = '每日登录奖励已领取 已连续登录 8 天 <a class="balance_area">2 银 10 铜</a>';

async function run(responses, storage = { 'v2ex-cookie': 'session=original' }) {
  const requests = [];
  const notifications = [];
  const logs = [];
  let doneCount = 0;
  let finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  vm.runInNewContext(source, {
    $persistentStore: { read: (key) => storage[key] || null },
    $httpClient: {
      get(options, callback) {
        requests.push(options);
        const response = responses[requests.length - 1];
        if (!response) throw new Error(`未预期的请求: ${options.url}`);
        callback(response.error || null, {
          status: response.status === undefined ? 200 : response.status,
          headers: response.headers || {},
        }, response.body || '');
      },
    },
    $notification: { post: (...args) => notifications.push(args) },
    $done: () => { doneCount += 1; finish(); },
    console: { log: (message) => logs.push(message) },
    setTimeout: (callback) => callback(),
  });
  await completed;
  assert.equal(doneCount, 1);
  assert.equal(notifications.length, 1);
  assert.equal(requests.length, responses.length);
  return { requests, notification: notifications[0], logs };
}

test('直接请求签到页；已经签到时不访问首页或重复领取', async () => {
  const result = await run([{ status: '200', body: signed }]);
  assert.equal(result.requests[0].url, dailyUrl);
  assert.equal(result.requests[0].headers.Referer, 'https://v2ex.com/');
  assert.match(result.requests[0].headers['User-Agent'], /Chrome\/151\.0\.0\.0/);
  assert.equal(result.notification[0], 'V2EX 今日已经签到过了');
  assert.equal(result.notification[1], '连续签到: 8 天');
  assert.equal(result.notification[2], '账户余额: 2 银 10 铜');
});

test('使用指定 User-Agent，并携带签到页更新的 Cookie 领取和验证', async () => {
  const result = await run([
    { body: ready, headers: { 'Set-Cookie': ['session=renewed; Path=/', 'nonce=xyz; Path=/'] } },
    { status: 302 },
    { body: signed },
  ], { 'v2ex-cookie': 'session=old; cf_clearance=clearance', 'v2ex-user-agent': 'Browser/Test' });
  assert.equal(result.requests[1].url, redeemUrl);
  assert.equal(result.requests[1].headers.Referer, dailyUrl);
  assert.match(result.requests[2].url, /\/mission\/daily\?_=/);
  for (const request of result.requests) {
    assert.equal(new URL(request.url).origin, 'https://v2ex.com');
    assert.equal(request.headers['User-Agent'], 'Browser/Test');
    assert.match(request.headers.Cookie, /cf_clearance=clearance/);
  }
  assert.match(result.requests[1].headers.Cookie, /session=renewed/);
  assert.match(result.requests[2].headers.Cookie, /nonce=xyz/);
  assert.equal(result.notification[0], 'V2EX 签到成功');
});

for (const status of [200, 403, 503]) {
  test(`通过响应头识别 HTTP ${status} 的浏览器验证，不报告 Cookie 失效`, async () => {
    const result = await run([{ status, headers: { 'CF-Mitigated': 'challenge' }, body: 'Password' }]);
    assert.equal(result.notification[0], 'V2EX 签到失败');
    assert.match(result.notification[2], /Cloudflare 浏览器验证/);
    assert.doesNotMatch(result.notification[2], /Cookie 已失效/);
  });
}

test('缺少验证响应头时识别验证页面脚本', async () => {
  const result = await run([{ status: 403, body: '<script>window._cf_chl_opt = {};</script>' }]);
  assert.match(result.notification[2], /Cloudflare 浏览器验证/);
});

test('普通 403 保留原因不确定的提示', async () => {
  const result = await run([{ status: 403, body: 'Forbidden' }]);
  assert.match(result.notification[2], /HTTP 403.*尚不能确定具体原因/);
  assert.doesNotMatch(result.notification[2], /Cloudflare|Cookie 已失效/);
  assert.ok(result.notification[2].includes(dailyUrl));
});

test('按实际页面结构解析领取按钮、已领取标记及图标形式的余额', async () => {
  // 保留抓包中的页面结构，使用测试专用的参数和账户数值。
  const before = `<input type="button" class="super normal button" value="领取 X 铜币"
    onclick="location.href = '/mission/daily/redeem?once=1234'" />
    <span>已连续登录 7 天</span>`;
  const after = `<div class="message">已成功领取每日登录奖励 8 铜币</div>
    <span class="gray"><li class="fa fa-ok-sign"></li> &nbsp;每日登录奖励已领取</span>
    <span>已连续登录 8 天</span>
    <a href="/balance" class="balance_area">1 <img src="/static/img/gold@2x.png" alt="G" />
    2 <img src="/static/img/silver@2x.png" alt="S" />
    10 <img src="/static/img/bronze@2x.png" alt="B" /></a>`;
  const result = await run([{ body: before }, { status: 302 }, { body: after }]);
  assert.equal(result.requests[1].url, redeemUrl);
  assert.deepEqual(result.notification, ['V2EX 签到成功', '连续签到: 8 天', '账户余额: 1 金 2 银 10 铜']);
});

for (const origin of ['https://v2ex.com', 'https://www.v2ex.com']) {
  test(`识别 ${origin} 的完整领取链接并统一使用签到域名`, async () => {
    const result = await run([
      { body: `<a href="${origin}/mission/daily/redeem?once=1234&amp;test=1">领取</a>` },
      { body: signed },
    ]);
    assert.equal(result.requests[1].url, `${redeemUrl}&test=1`);
    assert.equal(result.requests[1].headers.Referer, dailyUrl);
    assert.equal(result.notification[0], 'V2EX 签到成功');
  });
}

test('登录页面仍提示 Cookie 失效', async () => {
  const result = await run([{ body: 'You need to sign in first to view this page' }]);
  assert.match(result.notification[2], /Cookie 已失效或未登录/);
});

test('领取接口遇到验证时停止后续请求', async () => {
  const result = await run([
    { body: ready },
    { status: 403, headers: { 'cf-mitigated': 'challenge' } },
  ]);
  assert.match(result.notification[2], /签到接口返回异常.*Cloudflare/);
});

test('结果验证遇到验证页面时不报告签到成功', async () => {
  const result = await run([
    { body: ready },
    { status: 302 },
    { body: '<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script>' },
  ]);
  assert.equal(result.notification[0], 'V2EX 签到失败');
  assert.match(result.notification[2], /无法验证签到结果.*Cloudflare/);
});

test('领取后仍有按钮时不报告签到成功', async () => {
  const result = await run([{ body: ready }, { status: 302 }, { body: ready }]);
  assert.match(result.notification[2], /签到未生效: 领取按钮仍然存在/);
});

test('领取响应已确认成功时无需再次请求', async () => {
  const result = await run([{ body: ready }, { body: signed }]);
  assert.equal(result.notification[0], 'V2EX 签到成功');
});

test('缺少 Cookie 时不发送请求', async () => {
  const result = await run([], {});
  assert.match(result.notification[2], /未配置 Cookie/);
});

test('网络异常时通知错误并完成任务', async () => {
  const result = await run([{ error: '连接超时' }]);
  assert.equal(result.notification[0], 'V2EX 签到失败');
  assert.match(result.notification[2], /连接超时/);
});
