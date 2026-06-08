const sessionCookie = String($persistentStore.read("li7-cookie") || "").trim();

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

function scanActionChunks(chunkPaths, index, actions, callback) {
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
        Cookie: sessionCookie,
      },
    },
    function (chunkError, chunkResponse, chunkData) {
      const found = chunkError ? {} : parseActionReferences(chunkData);
      scanActionChunks(
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

function fetchCurrentActions(callback) {
  $httpClient.get(
    {
      url: `${UPSTREAM}/`,
      headers: {
        Host: "store.7li7li.com",
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: `${UPSTREAM}/`,
        "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
        Cookie: sessionCookie,
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

      scanActionChunks(chunkPaths, 0, {}, callback);
    }
  );
}

function resolveActions(callback) {
  fetchCurrentActions(function (error, actions) {
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

function requestAction(action, callback) {
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
        Cookie: sessionCookie,
      },
      body: "[]",
    },
    callback
  );
}

function fetchUserPoints(actions, callback) {
  requestAction(actions.getUserPoints, function (error, response, data) {
    console.log("7li store points fetch finished");
    console.log(`7li store points raw body: ${String(data || "")}`);

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

function finishWithUserPoints(actions, title, subtitle, earnedPoints) {
  fetchUserPoints(actions, function (error, userPoints) {
    if (error) {
      console.log(`7li store points fetch failed: ${String(error)}`);
      finish(title, subtitle, formatMessage(earnedPoints, null));
      return;
    }

    finish(title, subtitle, formatMessage(earnedPoints, userPoints));
  });
}

function signIn(actions) {
  requestAction(actions.checkIn, function (error, response, data) {
    console.log("7li store sign in finished");
    console.log(`7li store raw body: ${String(data || "")}`);

    if (error) {
      finishWithUserPoints(actions, "7li store 签到错误", String(error), 0);
      return;
    }

    let json;

    try {
      json = extractSignInResult(data);
    } catch (e) {
      const preview = String(data || "").slice(0, 200);
      finishWithUserPoints(actions, "7li store 签到错误", preview || String(e), 0);
      return;
    }

    if (json.success) {
      finishWithUserPoints(
        actions,
        "7li store 签到成功",
        formatConsecutiveDays(json.consecutiveDays),
        json.points
      );
      return;
    }

    const errorMessage = String(json.error || json.message || "").trim();
    finishWithUserPoints(
      actions,
      "7li store 签到失败",
      errorMessage || JSON.stringify(json),
      json.points || 0
    );
  });
}

function main() {
  if (!sessionCookie) {
    finish("签到错误", "7li-cookie 为空，请先保存登录 Cookie", formatMessage(0, null));
    return;
  }

  resolveActions(signIn);
}

main();
