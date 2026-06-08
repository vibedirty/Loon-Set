const storedCookieValue = String($persistentStore.read("li7-cookie") || "").trim();

const UPSTREAM = "https://store.7li7li.com";
const DEFAULT_ACTIONS = {
  checkIn: "4077eba853e0b56c5d8abc047340e43496b908092f",
  getUserPoints: "0018fdf61f514c204617088e7bccf36616433f33de",
};
const ROUTER_STATE =
  "%5B%22%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/148.0.0.0 Safari/537.36";

let doneCalled = false;

function notify(title, subtitle, message) {
  console.log(
    [
      "7li store notification:",
      `title: ${title || ""}`,
      `subtitle: ${subtitle || ""}`,
      `message: ${message || ""}`,
    ].join("\n")
  );
  $notification.post(title, subtitle || "", message || "");
}

function finish(title, subtitle, message) {
  if (doneCalled) {
    console.log("7li store finish skipped: $done already called");
    return;
  }

  if (title) {
    notify(title, subtitle, message);
  }

  doneCalled = true;
  $done();
}

function normalizeAccount(account, index) {
  if (!account || typeof account !== "object") {
    return null;
  }

  const cookie = String(account.cookie || "").trim();
  if (!cookie) {
    return null;
  }

  return {
    name: String(account.name || `账号${index + 1}`).trim() || `账号${index + 1}`,
    cookie,
  };
}

function parseLooseAccounts(raw) {
  const accounts = [];
  const objectMatches = String(raw || "").match(/\{[\s\S]*?\}/g) || [];

  for (let i = 0; i < objectMatches.length; i++) {
    const text = objectMatches[i];
    const nameMatch = text.match(/(?:^|[,{]\s*)"?name"?\s*:\s*["']([^"']+)["']/);
    const cookieMatch = text.match(
      /(?:^|[,{]\s*)"?cookie"?\s*:\s*["']([^"']+)["']/
    );

    const account = normalizeAccount(
      {
        name: nameMatch ? nameMatch[1] : "",
        cookie: cookieMatch ? cookieMatch[1] : "",
      },
      i
    );

    if (account) {
      accounts.push(account);
    }
  }

  return accounts;
}

function parseAccounts(raw) {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map(function (account, index) {
          return normalizeAccount(account, index);
        })
        .filter(Boolean);
    }

    if (parsed && typeof parsed === "object" && parsed.cookie) {
      const account = normalizeAccount(parsed, 0);
      return account ? [account] : [];
    }

    if (typeof parsed === "string" && parsed.trim()) {
      return [{ name: "账号1", cookie: parsed.trim() }];
    }
  } catch (e) {
    const looseAccounts = parseLooseAccounts(raw);
    if (looseAccounts.length) {
      return looseAccounts;
    }
  }

  return [{ name: "账号1", cookie: raw }];
}

function extractActionValues(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const values = [];

  for (const line of lines) {
    const match = line.match(/^\d+:(.*)$/);
    if (!match) {
      continue;
    }

    let value;
    try {
      value = JSON.parse(match[1]);
    } catch (e) {
      continue;
    }

    values.push(value);
  }

  return values;
}

function extractSignInResult(text) {
  const result = extractActionValues(text).find(
    (value) =>
      value &&
      typeof value === "object" &&
      ("success" in value || "error" in value || "points" in value)
  );

  if (result) {
    return result;
  }

  throw new Error("未找到签到结果记录");
}

function extractUserPoints(text) {
  const result = extractActionValues(text).find(
    (value) =>
      typeof value === "number" ||
      (typeof value === "string" &&
        value.trim() &&
        !Number.isNaN(Number(value))) ||
      (value && typeof value === "object" && value.points != null)
  );

  if (result && typeof result === "object") {
    return result.points;
  }

  if (result != null) {
    return result;
  }

  throw new Error("未找到积分余额记录");
}

function formatMessage(earnedPoints, userPoints) {
  const earned = earnedPoints == null ? "未知" : earnedPoints;
  const total = userPoints == null || userPoints === "" ? "未知" : userPoints;

  return `本次签到获得${earned}积分，账户总积分${total}`;
}

function formatAccountMessage(result) {
  const earned = result.earnedPoints == null ? "未知" : result.earnedPoints;
  const total =
    result.userPoints == null || result.userPoints === ""
      ? "未知"
      : result.userPoints;

  return `${result.name}本次获得${earned}积分，总积分${total}`;
}

function formatConsecutiveDays(days) {
  return days == null ? "" : `连续签到${days}天`;
}

function parseActionReferences(scriptText) {
  const actions = {};
  const re =
    /createServerReference\)\("([0-9a-f]+)",[^)]*?,"(checkIn|getUserPoints)"\)/g;
  let match;

  while ((match = re.exec(String(scriptText || "")))) {
    actions[match[2]] = match[1];
  }

  return actions;
}

function extractChunkPaths(html) {
  const matches = String(html || "").match(
    /\/_next\/static\/chunks\/(?:app\/)?[^"'\\]+\.js/g
  );
  const paths = [];

  for (const path of matches || []) {
    if (paths.indexOf(path) === -1) {
      paths.push(path);
    }
  }

  paths.sort(function (a, b) {
    const aIsAppPage = /\/app\/page-/.test(a);
    const bIsAppPage = /\/app\/page-/.test(b);

    if (aIsAppPage === bIsAppPage) {
      return 0;
    }

    return aIsAppPage ? -1 : 1;
  });

  return paths;
}

function scanActionChunks(cookie, chunkPaths, index, actions, callback) {
  if (actions.checkIn && actions.getUserPoints) {
    callback(null, actions);
    return;
  }

  if (index >= chunkPaths.length) {
    callback(
      actions.checkIn || actions.getUserPoints
        ? null
        : new Error("未从 chunks 提取到 Server Action"),
      actions
    );
    return;
  }

  $httpClient.get(
    {
      url: `${UPSTREAM}${chunkPaths[index]}`,
      headers: {
        Host: "store.7li7li.com",
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        Referer: `${UPSTREAM}/`,
        "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
        Cookie: cookie,
      },
    },
    function (chunkError, chunkResponse, chunkData) {
      const found = chunkError ? {} : parseActionReferences(chunkData);
      scanActionChunks(
        cookie,
        chunkPaths,
        index + 1,
        {
          checkIn: actions.checkIn || found.checkIn,
          getUserPoints: actions.getUserPoints || found.getUserPoints,
        },
        callback
      );
    }
  );
}

function fetchCurrentActions(cookie, callback) {
  $httpClient.get(
    {
      url: `${UPSTREAM}/`,
      headers: {
        Host: "store.7li7li.com",
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: `${UPSTREAM}/`,
        "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
        Cookie: cookie,
      },
    },
    function (error, response, data) {
      if (error) {
        callback(error);
        return;
      }

      const chunkPaths = extractChunkPaths(data);
      if (!chunkPaths.length) {
        callback(new Error("未找到前端 chunks"));
        return;
      }

      scanActionChunks(cookie, chunkPaths, 0, {}, callback);
    }
  );
}

function resolveActions(cookie, callback) {
  fetchCurrentActions(cookie, function (error, actions) {
    if (error) {
      console.log(`7li store action discovery failed: ${String(error)}`);
      callback(DEFAULT_ACTIONS);
      return;
    }

    callback({
      checkIn: actions.checkIn || DEFAULT_ACTIONS.checkIn,
      getUserPoints: actions.getUserPoints || DEFAULT_ACTIONS.getUserPoints,
    });
  });
}

function requestAction(account, action, callback) {
  $httpClient.post(
    {
      url: `${UPSTREAM}/`,
      headers: {
        Host: "store.7li7li.com",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "next-action": action,
        "next-router-state-tree": ROUTER_STATE,
        "User-Agent": USER_AGENT,
        Accept: "text/x-component",
        "Content-Type": "text/plain;charset=UTF-8",
        Origin: UPSTREAM,
        Referer: `${UPSTREAM}/`,
        "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
        Cookie: account.cookie,
      },
      body: "[]",
    },
    callback
  );
}

function fetchUserPoints(account, actions, callback) {
  requestAction(account, actions.getUserPoints, function (error, response, data) {
    console.log(`7li store ${account.name} points fetch finished`);
    console.log(
      `7li store ${account.name} points raw body: ${String(data || "")}`
    );

    if (error) {
      callback(error);
      return;
    }

    try {
      callback(null, extractUserPoints(data));
    } catch (e) {
      callback(e);
    }
  });
}

function finishAccountWithUserPoints(account, actions, result, callback) {
  fetchUserPoints(account, actions, function (error, userPoints) {
    if (error) {
      console.log(
        `7li store ${account.name} points fetch failed: ${String(error)}`
      );
      result.userPoints = null;
      callback(result);
      return;
    }

    result.userPoints = userPoints;
    callback(result);
  });
}

function signInAccount(account, actions, callback) {
  requestAction(account, actions.checkIn, function (error, response, data) {
    console.log(`7li store ${account.name} sign in finished`);
    console.log(`7li store ${account.name} raw body: ${String(data || "")}`);

    if (error) {
      finishAccountWithUserPoints(
        account,
        actions,
        {
          name: account.name,
          status: "error",
          subtitle: String(error),
          rawError: String(error),
          earnedPoints: 0,
        },
        callback
      );
      return;
    }

    let json;

    try {
      json = extractSignInResult(data);
    } catch (e) {
      const preview = String(data || "").slice(0, 200);
      finishAccountWithUserPoints(
        account,
        actions,
        {
          name: account.name,
          status: "error",
          subtitle: preview || String(e),
          rawError: preview || String(e),
          earnedPoints: 0,
        },
        callback
      );
      return;
    }

    if (json.success) {
      finishAccountWithUserPoints(
        account,
        actions,
        {
          name: account.name,
          status: "success",
          subtitle: formatConsecutiveDays(json.consecutiveDays),
          earnedPoints: json.points,
        },
        callback
      );
      return;
    }

    const errorMessage = String(json.error || json.message || "").trim();
    const isDuplicate = /重复|已.*签|already|checked.?in/i.test(errorMessage);
    finishAccountWithUserPoints(
      account,
      actions,
      {
        name: account.name,
        status: isDuplicate ? "duplicate" : "failed",
        subtitle: errorMessage || JSON.stringify(json),
        rawError: errorMessage || JSON.stringify(json),
        earnedPoints: json.points || 0,
      },
      callback
    );
  });
}

function formatAccountResult(result) {
  if (result.status === "success") {
    return `${result.name}成功`;
  }

  if (result.status === "duplicate") {
    return `${result.name}重复签到`;
  }

  return result.rawError || result.subtitle || "失败";
}

function finishAll(results) {
  const subtitle = results.map(formatAccountResult).join("；");
  const message = results.map(formatAccountMessage).join("\n");

  finish("7li store 多账户签到完成", subtitle, message);
}

function signInAccounts(accounts, actions, index, results) {
  if (index >= accounts.length) {
    finishAll(results);
    return;
  }

  signInAccount(accounts[index], actions, function (result) {
    results.push(result);
    signInAccounts(accounts, actions, index + 1, results);
  });
}

function main() {
  const accounts = parseAccounts(storedCookieValue);

  if (!accounts.length) {
    finish("签到错误", "7li-cookie 为空，请先保存登录 Cookie", formatMessage(0, null));
    return;
  }

  resolveActions(accounts[0].cookie, function (actions) {
    signInAccounts(accounts, actions, 0, []);
  });
}

main();
