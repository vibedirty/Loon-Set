// @file-type javascript
// update at 2026-07-26 10:29
// 单账号：持久化键 arkapi-cookie、arkapi-user
// 多账号：arkapi-cookie 填写 [{"name":"账号1","cookie":"...","userId":"..."}]

const UPSTREAM = "https://api.ark717.com";
const ACCOUNT_KEY = "arkapi-cookie";
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 " +
  "Mobile/15E148 Safari/604.1";
const QUOTA_PER_DOLLAR = 500000;

let doneCalled = false;
let credentialError = "";

function finish(title, subtitle, message) {
  if (doneCalled) return;

  if (title) {
    console.log(
      `[ArkApi] ${title} | ${subtitle || ""} | ${message || ""}`
    );
    $notification.post(title, subtitle || "", message || "");
  }

  doneCalled = true;
  $done();
}

function normalizeCookie(rawCookie) {
  const cookie = String(rawCookie || "")
    .trim()
    .replace(/^cookie:\s*/i, "");
  if (!cookie) return "";

  const pairs = cookie
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  const required = pairs.filter((item) =>
    /^(?:session|cf_clearance)=/i.test(item)
  );

  return required.length ? required.join("; ") : cookie;
}

function normalizeAccount(account, index) {
  if (typeof account === "string") {
    account = {
      cookie: account,
      userId: $persistentStore.read("arkapi-user"),
    };
  }
  if (!account || typeof account !== "object") return null;

  const userId = String(
    account.userId ||
      account.user_id ||
      account.user ||
      account.id ||
      account["New-Api-User"] ||
      account["New-API-User"] ||
      ""
  ).trim();
  const cookie = normalizeCookie(
    account.cookie || account.Cookie || account.ck || ""
  );
  if (!userId || !cookie) return null;

  return {
    name:
      String(account.name || account.remark || `账号${index + 1}`).trim() ||
      `账号${index + 1}`,
    userId,
    cookie,
  };
}

function parseAccountConfig(raw) {
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (jsonError) {
    const relaxed = raw
      .replace(
        /("(?:\\.|[^"\\])*"|[-]?\d+(?:\.\d+)?|true|false|null|\]|\})\s+(?=("?[A-Za-z_$][\w$-]*"?\s*:))/g,
        "$1, "
      )
      .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)\s*:/g, '$1"$2":')
      .replace(/,\s*([}\]])/g, "$1");

    try {
      parsed = JSON.parse(relaxed);
    } catch (relaxedError) {
      throw jsonError;
    }
  }

  if (
    typeof parsed === "string" &&
    /^[\[{]/.test(parsed.trim())
  ) {
    parsed = JSON.parse(parsed);
  }

  return parsed;
}

function readAccounts() {
  const stored = $persistentStore.read(ACCOUNT_KEY);
  const raw =
    typeof stored === "string"
      ? stored.trim()
      : stored
        ? JSON.stringify(stored)
        : "";

  if (!raw) {
    credentialError = "持久化存储中没有读取到 arkapi-cookie";
    return [];
  }

  console.log(`[ArkApi] 已读取 arkapi-cookie（${raw.length} 个字符）`);

  if (/^[\[{\"]/.test(raw)) {
    try {
      const parsed = parseAccountConfig(raw);
      const source =
        parsed && Array.isArray(parsed.accounts) ? parsed.accounts : parsed;
      const list = Array.isArray(source) ? source : [source];
      const accounts = list.map(normalizeAccount).filter(Boolean);

      console.log(
        `[ArkApi] arkapi-cookie 共 ${list.length} 项，有效账号 ${accounts.length} 个`
      );
      if (!accounts.length) {
        credentialError =
          "arkapi-cookie 已读取，但账号缺少 cookie 或 userId";
      }
      return accounts;
    } catch (error) {
      console.log(`[ArkApi] ${ACCOUNT_KEY} 解析失败: ${String(error)}`);
      credentialError = "arkapi-cookie 不是有效的账号 JSON 数组";
      return [];
    }
  }

  const legacy = normalizeAccount(
    {
      name: "账号1",
      userId: $persistentStore.read("arkapi-user"),
      cookie: raw,
    },
    0
  );
  if (!legacy) {
    credentialError =
      "已读取 arkapi-cookie，但单账号配置还需要 arkapi-user";
  }
  return legacy ? [legacy] : [];
}

function request(options, method) {
  return new Promise((resolve, reject) => {
    $httpClient[method](options, (error, response, data) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        status: response && (response.status || response.statusCode),
        body: String(data || ""),
      });
    });
  });
}

function accountHeaders(account) {
  return {
    Host: "api.ark717.com",
    "New-Api-User": account.userId,
    "Cache-Control": "no-store",
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    Origin: UPSTREAM,
    Referer: `${UPSTREAM}/profile`,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Cookie: account.cookie,
  };
}

function parseJson(result, action) {
  try {
    return JSON.parse(result.body);
  } catch (error) {
    const isHtml = /^\s*</.test(result.body);
    throw new Error(
      `${action}响应不是 JSON（HTTP ${result.status || "未知"}）` +
        (isHtml ? "，可能被 Cloudflare 拦截或 Cookie 已失效" : "")
    );
  }
}

function responseMessage(json, fallback) {
  return String(
    json?.message ||
      json?.msg ||
      json?.data?.message ||
      json?.data?.msg ||
      fallback ||
      ""
  ).trim();
}

function isAlreadyCheckedIn(message) {
  return /已签到|已经签到|签到过|重复签到|checked[\s_-]*in/i.test(
    String(message || "")
  );
}

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return {
    day: `${year}-${month}-${day}`,
    month: `${year}-${month}`,
  };
}

function formatQuota(value) {
  const quota = Number(value);
  if (!Number.isFinite(quota)) return "未知";
  return `$${(quota / QUOTA_PER_DOLLAR).toFixed(2)}`;
}

async function fetchHistory(account) {
  const date = localDate();
  const result = await request(
    {
      url: `${UPSTREAM}/api/user/checkin?month=${date.month}`,
      headers: accountHeaders(account),
    },
    "get"
  );
  const json = parseJson(result, "签到记录");

  if (result.status !== 200 || json?.success !== true) {
    throw new Error(
      responseMessage(json, `获取签到记录失败（HTTP ${result.status || "未知"}）`)
    );
  }

  const stats = json?.data?.stats || {};
  const records = Array.isArray(stats.records) ? stats.records : [];
  return {
    checkedInToday: Boolean(stats.checked_in_today),
    record: records.find((item) => item?.checkin_date === date.day) || null,
    totalCheckins: stats.total_checkins ?? stats.checkin_count ?? null,
  };
}

async function fetchBalance(account) {
  const result = await request(
    {
      url: `${UPSTREAM}/api/user/self`,
      headers: accountHeaders(account),
    },
    "get"
  );
  const json = parseJson(result, "账户信息");

  if (result.status !== 200 || json?.success !== true) {
    throw new Error(
      responseMessage(json, `获取账户信息失败（HTTP ${result.status || "未知"}）`)
    );
  }

  const quota = Number(json?.data?.quota);
  if (!Number.isFinite(quota)) {
    throw new Error("账户信息中没有有效的 quota");
  }
  return quota;
}

async function runAccount(account) {
  let history = null;
  try {
    history = await fetchHistory(account);
  } catch (error) {
    console.log(`[ArkApi] ${account.name}签到预检查失败: ${String(error)}`);
  }

  let repeated = Boolean(history?.checkedInToday);
  let signData = null;

  if (repeated) {
    console.log(`[ArkApi] ${account.name}今日已签到，跳过签到请求`);
  } else {
    const result = await request(
      {
        url: `${UPSTREAM}/api/user/checkin`,
        headers: accountHeaders(account),
      },
      "post"
    );
    const json = parseJson(result, "签到");
    const message = responseMessage(json, "");
    const succeeded = result.status === 200 && json?.success === true;
    repeated = isAlreadyCheckedIn(message);

    if (!succeeded && !repeated) {
      throw new Error(
        message || `签到失败（HTTP ${result.status || "未知"}）`
      );
    }

    signData = json?.data || null;
    try {
      history = await fetchHistory(account);
    } catch (error) {
      console.log(`[ArkApi] ${account.name}签到记录验证失败: ${String(error)}`);
    }
  }

  let balance = null;
  try {
    balance = await fetchBalance(account);
  } catch (error) {
    console.log(`[ArkApi] ${account.name}账户余额获取失败: ${String(error)}`);
  }

  const record =
    signData?.quota_awarded != null ? signData : history?.record;
  const statusText =
    repeated ? `${account.name}今日已签到` : `${account.name}签到成功`;
  const details = [
    `奖励额度：${formatQuota(record?.quota_awarded)}`,
    `账户余额：${balance == null ? "获取失败" : formatQuota(balance)}`,
    history?.totalCheckins != null
      ? `累计签到：${history.totalCheckins} 次`
      : "",
  ].filter(Boolean);

  return {
    ok: true,
    statusText,
    detail: `${account.name}：${details.join("，")}`,
  };
}

async function main() {
  const accounts = readAccounts();
  if (!accounts.length) {
    finish(
      "ArkApi 签到失败",
      "",
      credentialError || "未找到有效账号凭证"
    );
    return;
  }

  const results = [];
  for (const account of accounts) {
    try {
      results.push(await runAccount(account));
    } catch (error) {
      const message = String(error?.message || error);
      console.log(`[ArkApi] ${account.name}签到失败: ${message}`);
      results.push({
        ok: false,
        statusText: `${account.name}签到失败`,
        detail: `${account.name}：${message}`,
      });
    }
  }

  const successCount = results.filter((item) => item.ok).length;
  finish(
    successCount === results.length ? "ArkApi 签到完成" : "ArkApi 签到有失败",
    results.map((item) => item.statusText).join("；"),
    results.map((item) => item.detail).join("\n")
  );
}

main().catch((error) => {
  finish("ArkApi 签到失败", "", String(error?.message || error));
});
