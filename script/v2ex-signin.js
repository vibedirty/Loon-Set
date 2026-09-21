// @file-type javascript
// update at 2026-09-21 09:59

const sessionCookie = $persistentStore.read('v2ex-cookie') || '';
const BASE_URL = 'https://v2ex.com';
const DAILY_PATH = '/mission/daily';

const USER_AGENT =
  $persistentStore.read('v2ex-user-agent') ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const cookieJar = {};

sessionCookie.split(/;\s*/).forEach((item) => {
  const separator = item.indexOf('=');
  if (separator > 0) {
    cookieJar[item.slice(0, separator).trim()] = item.slice(separator + 1).trim();
  }
});

function cookieHeader() {
  return Object.keys(cookieJar)
    .map((name) => `${name}=${cookieJar[name]}`)
    .join('; ');
}

function updateCookies(headers) {
  if (!headers) return;
  const key = Object.keys(headers).find((name) => name.toLowerCase() === 'set-cookie');
  if (!key) return;
  const values = Array.isArray(headers[key]) ? headers[key] : [headers[key]];
  values.forEach((value) => {
    String(value)
      .split(/,\s*(?=[^;,=\s]+=[^;,]*)/)
      .forEach((cookie) => {
        const pair = cookie.split(';', 1)[0];
        const separator = pair.indexOf('=');
        if (separator <= 0) return;
        const name = pair.slice(0, separator).trim();
        const content = pair.slice(separator + 1).trim();
        if (content) cookieJar[name] = content;
        else delete cookieJar[name];
      });
  });
}

function dailyUrl(cacheBust) {
  return cacheBust
    ? `${BASE_URL}${DAILY_PATH}?_=${Date.now()}`
    : `${BASE_URL}${DAILY_PATH}`;
}

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
  const match = html.match(/(?:https?:\/\/(?:www\.)?v2ex\.com)?(\/mission\/daily\/redeem\?[^"'<> \t\r\n]+)/i);
  return match ? match[1].replace(/&amp;/g, '&') : null;
}

function pageSummary(html) {
  if (!html) return '空响应';
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 160) || '无法提取响应文字';
}

function responseHeader(headers, name) {
  const key = Object.keys(headers || {}).find((key) => key.toLowerCase() === name);
  return key ? String(headers[key]) : '';
}

function responseProblem(response, acceptedStatuses) {
  const status = response.status || '未知';
  const challenged = responseHeader(response.headers, 'cf-mitigated').toLowerCase() === 'challenge'
    || /\b_cf_chl_opt\b|<script\b[^>]*\bsrc=["'][^"']*\/cdn-cgi\/challenge-platform\//i.test(response.body);
  if (challenged) {
    return `HTTP ${status}，遇到 Cloudflare 浏览器验证；请在与 Loon 使用相同网络出口的浏览器中访问 ${BASE_URL}${DAILY_PATH}，完成验证后更新 v2ex-cookie，并将该浏览器的 User-Agent 保存为 v2ex-user-agent。脚本无法执行浏览器验证`;
  }
  if (response.status === 403) {
    return `HTTP 403，服务器拒绝访问，尚不能确定具体原因；请先用相同网络出口的浏览器打开 ${BASE_URL}${DAILY_PATH}，确认能够访问并已登录，再更新完整 Cookie 和 v2ex-user-agent`;
  }
  if (!acceptedStatuses.includes(response.status)) return `HTTP ${status}`;
  return '';
}

function httpGet(url, extraHeaders) {
  return new Promise((resolve, reject) => {
    $httpClient.get(
      {
        url,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Cookie: cookieHeader(),
          ...(extraHeaders || {}),
        },
      },
      (error, response, data) => {
        if (error) return reject(error);
        updateCookies(response && response.headers);
        resolve({
          status: Number(response && (response.status || response.statusCode)),
          headers: (response && response.headers) || {},
          body: data || '',
        });
      },
    );
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  // 直接使用已保存的 Cookie，首页访问失败不应阻止获取签到页。
  console.log('获取 V2EX 签到页...');
  const daily = await httpGet(dailyUrl(false), {
    Referer: `${BASE_URL}/`,
  });
  const dailyProblem = responseProblem(daily, [200]);
  if (dailyProblem) {
    notifyFail(`获取签到页失败: ${dailyProblem}`);
    return;
  }
  if (isSignInPage(daily.body)) {
    notifyFail('Cookie 已失效或未登录');
    return;
  }

  const redeemPath = findDailyRedeemPath(daily.body);
  const alreadySigned = isSignedToday(daily.body);
  let verifiedBody = alreadySigned ? daily.body : '';
  let redeemDiagnostic = '';

  if (alreadySigned) {
    console.log('今天已经签到过了');
  } else if (redeemPath) {
    console.log('执行 V2EX 签到...');
    const redeem = await httpGet(`${BASE_URL}${redeemPath}`, {
      Referer: `${BASE_URL}${DAILY_PATH}`,
    });
    const redeemProblem = responseProblem(redeem, [200, 302]);
    if (redeemProblem) {
      notifyFail(`签到接口返回异常: ${redeemProblem}`);
      return;
    }
    if (isSignedToday(redeem.body)) {
      console.log('领取接口返回已领取状态');
      verifiedBody = redeem.body;
    } else {
      redeemDiagnostic = `HTTP ${redeem.status}，${pageSummary(redeem.body)}`;
      console.log(`领取接口响应: ${redeemDiagnostic}`);
      console.log('签到请求已发送，正在刷新页面验证结果...');
    }
  } else {
    notifyFail('签到页未显示领取按钮，也没有已领取标记，未执行签到');
    return;
  }

  let after = daily;
  if (!verifiedBody) {
    await wait(800);
    after = await httpGet(dailyUrl(true), {
      Referer: `${BASE_URL}${DAILY_PATH}`,
    });
    const afterProblem = responseProblem(after, [200]);
    if (afterProblem || !after.body) {
      notifyFail(`无法验证签到结果: ${afterProblem || '空响应'}`);
      return;
    }
    verifiedBody = after.body;
  }
  if (isSignInPage(verifiedBody)) {
    notifyFail('验证签到结果时发现 Cookie 已失效或未登录');
    return;
  }
  if (!isSignedToday(verifiedBody)) {
    const reason = findDailyRedeemPath(verifiedBody)
      ? '领取按钮仍然存在'
      : '页面没有已领取标记';
    const detail = redeemDiagnostic ? `；领取响应：${redeemDiagnostic}` : '';
    notifyFail(`签到未生效: ${reason}${detail}`);
    return;
  }

  const days = parseDays(verifiedBody);
  const balance = parseBalance(verifiedBody);
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
