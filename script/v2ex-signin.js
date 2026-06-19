const sessionCookie = $persistentStore.read('v2ex-cookie') || '';
const v = '2026-06-19 00:00';
const BASE_URL = 'https://www.v2ex.com';
const DAILY_PATH = '/mission/daily';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const baseHeaders = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Cookie: sessionCookie,
};

function parseBalance(html) {
  const m = html.match(/<([a-z][\w:-]*)\b[^>]*class=["'][^"']*\bbalance_area\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i);
  if (!m) return null;
  const balanceHtml = m[2];
  const imgLabels = { G: '金', S: '银', B: '铜' };
  const imgPaired = [];
  let match;
  const imgRe = /(\d+)\s*<img\b[^>]*\balt=["']([GSB])["'][^>]*>/gi;
  while ((match = imgRe.exec(balanceHtml)) !== null) {
    imgPaired.push(`${match[1]} ${imgLabels[match[2].toUpperCase()]}`);
  }
  if (imgPaired.length) return imgPaired.join(' ');

  const text = balanceHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const paired = [];
  const textRe = /(\d+)\s*(金|银|铜)/g;
  while ((match = textRe.exec(text)) !== null) {
    paired.push(`${match[1]} ${match[2]}`);
  }
  if (paired.length) return paired.join(' ');
  const nums = text.match(/\d+/g);
  if (!nums) return null;
  const labels = ['金', '银', '铜'];
  const offset = Math.max(0, labels.length - nums.length);
  return nums.map((n, i) => `${n} ${labels[i + offset] || ''}`.trim()).join(' ');
}

function parseDays(html) {
  const m = html.match(/(?:已|已经)?连续(?:登录|签到)\s*(\d+)\s*天/);
  return m ? m[1] : null;
}

function isSignedToday(html) {
  return /每日登录奖励(?:已经)?已领取|今天(?:已经)?签到过了|今日(?:登录)?奖励(?:已经)?已领取/.test(html);
}

function isSignInPage(html) {
  return /You need to sign in first to view this page/.test(html)
    || /\bUsername\b/.test(html)
    || /\bPassword\b/.test(html)
    || /Are you robot\?/.test(html);
}

function findDailyRedeemPath(html) {
  const match = html.match(/(?:https?:\/\/www\.v2ex\.com)?(\/mission\/daily\/redeem\?[^"'<> \t\r\n]+)/i);
  return match ? match[1].replace(/&amp;/g, '&') : null;
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
  const daily = await httpGet(`${BASE_URL}${DAILY_PATH}`);
  if (daily.status !== 200) {
    notifyFail(`获取签到页失败: HTTP ${daily.status}`);
    return;
  }
  if (isSignInPage(daily.body)) {
    notifyFail('Cookie 已失效或未登录');
    return;
  }

  const redeemPath = findDailyRedeemPath(daily.body);
  const alreadySigned = isSignedToday(daily.body);

  if (alreadySigned) {
    console.log('今天已经签到过了');
  } else if (redeemPath) {
    console.log(`执行签到 (${redeemPath})...`);
    const redeem = await httpGet(`${BASE_URL}${redeemPath}`, {
      Referer: `${BASE_URL}${DAILY_PATH}`,
    });
    if (redeem.status !== 302 && redeem.status !== 200) {
      notifyFail(`签到接口返回异常: HTTP ${redeem.status}`);
      return;
    }
    console.log('签到请求已发送，正在验证结果...');
  } else {
    notifyFail('签到页未显示领取按钮，也没有已领取标记，未执行签到');
    return;
  }

  const after = alreadySigned
    ? daily
    : await httpGet(`${BASE_URL}${DAILY_PATH}`, {
      Referer: `${BASE_URL}${DAILY_PATH}`,
    });
  if (after.status !== 200 || !after.body) {
    notifyFail(`无法验证签到结果: HTTP ${after.status}`);
    return;
  }
  if (isSignInPage(after.body)) {
    notifyFail('验证签到结果时发现 Cookie 已失效或未登录');
    return;
  }
  if (!isSignedToday(after.body)) {
    const reason = findDailyRedeemPath(after.body)
      ? '领取按钮仍然存在'
      : '页面没有已领取标记';
    notifyFail(`签到未生效: ${reason}`);
    return;
  }

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
