const sessionCookie = $persistentStore.read('v2ex-cookie') || '';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const baseHeaders = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Cookie: sessionCookie,
};

function parseBalance(html) {
  const m = html.match(/class="balance_area[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (!m) return null;
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const nums = text.match(/\d+/g);
  if (!nums) return null;
  const labels = ['金', '银', '铜'];
  const offset = labels.length - nums.length;
  return nums.map((n, i) => `${n} ${labels[i + offset]}`).join(' ');
}

function parseDays(html) {
  const m = html.match(/已连续登录\s*(\d+)\s*天/);
  return m ? m[1] : null;
}

function isLoggedIn(html) {
  return /href="\/signout\?once=/.test(html) || /href="\/settings"/.test(html);
}

function httpGet(url, extraHeaders) {
  return new Promise((resolve, reject) => {
    $httpClient.get(
      {
        url,
        headers: { ...baseHeaders, ...(extraHeaders || {}) },
      },
      (error, response, data) => {
        if (error) return reject(error);
        resolve({ status: response.status, body: data || '' });
      },
    );
  });
}

function notifyFail(message) {
  console.log(`V2EX签到失败: ${message}`);
  $notification.post('V2EX 签到失败', '', message);
}

function notifyResult(title, days, balance) {
  const subtitle = `连续签到: ${days || '未知'} 天`;
  const body = `账户余额: ${balance || '未知'}`;
  console.log(`${title} | ${subtitle} | ${body}`);
  $notification.post(title, subtitle, body);
}

async function main() {
  console.log('获取 V2EX 签到页...');
  const daily = await httpGet('https://v2ex.com/mission/daily');
  if (daily.status !== 200) {
    notifyFail(`获取签到页失败: HTTP ${daily.status}`);
    return;
  }
  if (!isLoggedIn(daily.body)) {
    notifyFail('Cookie 已失效或未登录');
    return;
  }

  const onceMatch = daily.body.match(/\/mission\/daily\/redeem\?once=(\d+)/);
  let alreadySigned = false;

  if (!onceMatch) {
    console.log('今天已经签到过了');
    alreadySigned = true;
  } else {
    const once = onceMatch[1];
    console.log(`执行签到 (once=${once})...`);
    const redeem = await httpGet(
      `https://v2ex.com/mission/daily/redeem?once=${once}`,
      { Referer: 'https://v2ex.com/mission/daily' },
    );
    if (redeem.status !== 302 && redeem.status !== 200) {
      notifyFail(`签到接口返回异常: HTTP ${redeem.status}`);
      return;
    }
    console.log('签到成功');
  }

  const after = await httpGet('https://v2ex.com/mission/daily');
  const days = parseDays(after.body);
  const balance = parseBalance(after.body);
  if (days) console.log(`已连续登录: ${days} 天`);
  if (balance) console.log(`当前余额: ${balance}`);

  if (!days && !balance) {
    console.log('未能解析连续天数 / 余额，页面结构可能已变化');
  }

  notifyResult(
    alreadySigned ? 'V2EX 今日已经签到过了' : 'V2EX 签到成功',
    days,
    balance,
  );
}

if (!sessionCookie) {
  console.log('V2EX签到失败: 未配置 Cookie');
  $notification.post(
    'V2EX 签到失败',
    '',
    '未配置 Cookie，请在持久化存储中写入 v2ex-cookie',
  );
  $done();
} else {
  main()
    .catch((e) => {
      notifyFail(String(e && e.message ? e.message : e));
    })
    .finally(() => {
      $done();
    });
}
