const UPSTREAM = "https://anyrouter.top";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";
const XOR_KEY = "3000176000856006061501533003690027800375";
const UNSBOX_TABLE = [
  15, 35, 29, 24, 33, 16, 1, 38, 10, 9,
  19, 31, 40, 27, 22, 23, 25, 13, 6, 11,
  39, 18, 20, 8, 14, 21, 32, 26, 2, 30,
  7, 4, 17, 5, 3, 28, 34, 37, 12, 36,
];
let doneCalled = false;

function notify(title, subtitle, message) {
  console.log(
    `[notify] title=${JSON.stringify(title || "")} subtitle=${JSON.stringify(
      subtitle || ""
    )} message=${JSON.stringify(message || "")}`
  );
  $notification.post(title, subtitle || "", message || "");
}

function finish(title, subtitle, message) {
  if (title) {
    notify(title, subtitle, message);
  }

  if (doneCalled) {
    console.log("anyrouter finish skipped: $done already called");
    return;
  }

  doneCalled = true;
  $done();
}

function normalizeAccount(account, index) {
  const item = account || {};
  const name = String(item.name || `账号${index + 1}`).trim();
  let cookie = String(item.cookie || "").trim().replace(/^cookie:\s*/i, "");
  const id = String(item.id ?? "").trim();

  if (cookie && !/^session=/.test(cookie) && !/[=;]/.test(cookie)) {
    cookie = `session=${cookie}`;
  }

  return {
    name,
    cookie,
    id,
  };
}

function parseAccountConfig(raw) {
  try {
    return JSON.parse(raw);
  } catch (jsonError) {
    const relaxed = String(raw || "")
      .replace(/("(?:\\.|[^"\\])*"|[-]?\d+(?:\.\d+)?|true|false|null|\]|\})\s+(?=("?[A-Za-z_$][\w$]*"?\s*:))/g, "$1, ")
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');

    try {
      return JSON.parse(relaxed);
    } catch (relaxedError) {
      throw jsonError;
    }
  }
}

function readAccounts() {
  const raw = String($persistentStore.read("any-cookie") || "").trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = parseAccountConfig(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeAccount).filter((item) => item.cookie && item.id);
    }

    if (parsed && typeof parsed === "object") {
      const single = normalizeAccount(parsed, 0);
      return single.cookie && single.id ? [single] : [];
    }
  } catch (e) {
    if (/^[\[{]/.test(raw)) {
      console.log(`anyrouter account config parse failed: ${String(e)}`);
      return [];
    }

    // 兼容旧格式：any-cookie 仍然是单个 session 值，any-user 仍然单独保存
    const legacyUserId = String($persistentStore.read("any-user") || "").trim();
    if (raw && legacyUserId) {
      return [
        {
          name: "账号1",
          cookie: raw,
          id: legacyUserId,
        },
      ];
    }
  }

  return [];
}

function getBalanceKey(account) {
  const suffix = account.id || account.name || "default";
  return `any-balance-${suffix}`;
}

function extractMessage(json, fallback) {
  return (
    json?.message ||
    json?.msg ||
    json?.data?.message ||
    json?.data?.msg ||
    fallback
  );
}

function removeDynamicCookie(accountCookie) {
  return String(accountCookie || "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item && !/^acw_sc__v2=/i.test(item))
    .join("; ");
}

function buildSignedCookie(dynamicCookie, accountCookie) {
  if (!dynamicCookie && accountCookie) {
    return String(accountCookie || "").trim();
  }

  const staticCookie = removeDynamicCookie(accountCookie);

  return [dynamicCookie, staticCookie].filter(Boolean).join("; ");
}

function computeAcwCookie(arg1) {
  const unsboxed = UNSBOX_TABLE.map((index) => arg1[index - 1]).join("");
  let value = "";

  for (let i = 0; i < 40; i += 2) {
    const a = parseInt(unsboxed.slice(i, i + 2), 16);
    const b = parseInt(XOR_KEY.slice(i, i + 2), 16);
    value += ((a ^ b).toString(16)).padStart(2, "0");
  }

  return `acw_sc__v2=${value}`;
}

function getArg1(account, callback) {
  $httpClient.get(
    {
      url: `${UPSTREAM}/api/user/self`,
      headers: {
        Host: "anyrouter.top",
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: account.cookie,
        "New-API-User": account.id,
      },
    },
    function (error, response, data) {
      if (error) {
        callback(error);
        return;
      }

      console.log(`anyrouter self status: ${response?.status || "未知"}`);
      const match = String(data || "").match(
        /var\s+arg1\s*=\s*['"]([0-9a-fA-F]{40})['"]/
      );
      if (!match) {
        const preview = String(data || "").slice(0, 200);
        callback(
          new Error(
            `arg1 not found, HTTP ${response?.status || "未知"}, body=${preview || "<empty>"}`
          )
        );
        return;
      }

      console.log(`anyrouter arg1: ${match[1]}`);
      callback(null, match[1]);
    }
  );
}

function getDynamicCookie(account, callback) {
  getArg1(account, function (error, arg1) {
    if (error) {
      callback(error);
      return;
    }

    const dynamicCookie = computeAcwCookie(arg1);
    console.log(`anyrouter dynamic cookie: ${dynamicCookie}`);
    callback(null, dynamicCookie);
  });
}

function parseQuota(json) {
  const rawQuota = json?.quota ?? json?.data?.quota;
  if (rawQuota == null) {
    return null;
  }

  const quota =
    typeof rawQuota === "string"
      ? Number(rawQuota.replace(/,/g, ""))
      : Number(rawQuota);

  if (!Number.isFinite(quota)) {
    return null;
  }

  return quota;
}

function fetchAccountBalance(account, dynamicCookie, callback) {
  $httpClient.get(
    {
      url: `${UPSTREAM}/api/user/self`,
      headers: {
        Host: "anyrouter.top",
        Connection: "keep-alive",
        "New-API-User": account.id,
        "Cache-Control": "no-store",
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        Origin: UPSTREAM,
        Referer: `${UPSTREAM}/`,
        "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
        Cookie: buildSignedCookie(dynamicCookie, account.cookie),
      },
    },
    function (error, response, data) {
      if (error) {
        callback(error);
        return;
      }

      console.log(`anyrouter balance self status: ${response?.status || "未知"}`);

      let json;
      try {
        json = JSON.parse(data);
      } catch (e) {
        const preview = String(data || "").slice(0, 200);
        callback(
          new Error(
            `balance response parse failed, HTTP ${response?.status || "未知"}, body=${preview || "<empty>"}`
          )
        );
        return;
      }

      const quota = parseQuota(json);
      if (quota === null) {
        callback(new Error("quota not found in self response"));
        return;
      }

      const balance = quota / 500000;
      callback(null, balance.toFixed(2));
    }
  );
}

function fetchAccountBalanceAsync(account, dynamicCookie) {
  return new Promise((resolve, reject) => {
    fetchAccountBalance(account, dynamicCookie, function (error, balance) {
      if (error) {
        reject(error);
        return;
      }

      resolve(balance);
    });
  });
}

function getDynamicCookieAsync(account) {
  return new Promise((resolve, reject) => {
    getDynamicCookie(account, function (error, dynamicCookie) {
      if (error) {
        reject(error);
        return;
      }

      resolve(dynamicCookie);
    });
  });
}

function signIn(account, dynamicCookie, callback) {
  const params = {
    url: `${UPSTREAM}/api/user/sign_in`,
    headers: {
      Host: "anyrouter.top",
      Connection: "keep-alive",
      "New-API-User": account.id,
      "Cache-Control": "no-store",
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Origin: UPSTREAM,
      Referer: `${UPSTREAM}/`,
      "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
      Cookie: buildSignedCookie(dynamicCookie, account.cookie),
    },
  };

  $httpClient.post(params, function (error, response, data) {
    console.log(`[${account.name}] anyrouter sign in finished`);
    console.log(`[${account.name}] anyrouter sign in raw body: ${String(data || "")}`);

    if (error) {
      callback(error);
      return;
    }

    let json;
    try {
      json = JSON.parse(data);
    } catch (e) {
      const preview = String(data || "").slice(0, 200);
      callback(
        new Error(
          `sign in response parse failed, HTTP ${response?.status || "未知"}, body=${preview || "<empty>"}`
        )
      );
      return;
    }

    callback(null, {
      status: response?.status || response?.statusCode || "未知",
      success: Boolean(json?.success),
      message: extractMessage(json, ""),
      raw: json,
    });
  });
}

function signInAsync(account, dynamicCookie) {
  return new Promise((resolve, reject) => {
    signIn(account, dynamicCookie, function (error, result) {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

async function runAccount(account) {
  console.log(`[${account.name}] start`);

  let dynamicCookie = "";
  try {
    dynamicCookie = await getDynamicCookieAsync(account);
    console.log(`[${account.name}] anyrouter dynamic cookie: ${dynamicCookie}`);
  } catch (error) {
    console.log(`[${account.name}] anyrouter dynamic cookie refresh failed: ${String(error)}`);
  }

  const signResult = await signInAsync(account, dynamicCookie);
  const status = signResult.status;
  const message = signResult.message;

  if (!signResult.success) {
    return {
      name: account.name,
      ok: false,
      summary:
        typeof message === "string" && message.trim()
          ? `签到失败 HTTP ${status} ${message.trim()}`
          : `签到失败 HTTP ${status}`,
    };
  }

  const signText =
    typeof message === "string" && message.trim()
      ? message.trim()
      : "今天已经签到过了";

  const previousBalance = String($persistentStore.read(getBalanceKey(account)) || "").trim();

  try {
    const balance = await fetchAccountBalanceAsync(account, dynamicCookie);
    $persistentStore.write(balance, getBalanceKey(account));

    const balanceText = previousBalance
      ? `当前账户余额：$${balance}，上次余额：$${previousBalance}`
      : `当前账户余额：$${balance}`;

    return {
      name: account.name,
      ok: true,
      summary: `${signText}；${balanceText}`,
    };
  } catch (error) {
    console.log(`[${account.name}] anyrouter balance fetch failed: ${String(error)}`);
    return {
      name: account.name,
      ok: true,
      summary: `${signText}；获取账户余额失败`,
    };
  }
}

function formatSummary(results) {
  return results
    .map((item) => `${item.name}: ${item.summary}`)
    .join("\n");
}

async function main() {
  const accounts = readAccounts();
  if (!accounts.length) {
    finish("AnyRouter 签到错误", "", "any-cookie 需保存为 JSON 数组");
    return;
  }

  const results = [];

  for (const account of accounts) {
    try {
      results.push(await runAccount(account));
    } catch (error) {
      console.log(`[${account.name}] anyrouter run failed: ${String(error)}`);
      results.push({
        name: account.name,
        ok: false,
        summary: String(error),
      });
    }
  }

  const successCount = results.filter((item) => item.ok).length;
  const subtitle = `${successCount}/${accounts.length} 成功`;
  const message = formatSummary(results);
  finish("AnyRouter 签到完成", subtitle, message);
}

main().catch((error) => {
  console.log(`anyrouter main failed: ${String(error)}`);
  if (!doneCalled) {
    finish("AnyRouter 签到错误", "", String(error));
  }
});
