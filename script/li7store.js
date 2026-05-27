const sessionCookie = String($persistentStore.read("li7-cookie") || "").trim();

const UPSTREAM = "https://store.7li7li.com";
const DEFAULT_ACTIONS = {
  checkIn: "00f88461684e29a264c036ff2b6f96b9355e4686dd",
  getUserPoints: "00f9eec6afcfa0972e38c613b5d80c613caa9e18cb",
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

function extractPageChunkPath(html) {
  const match = String(html || "").match(
    /\/_next\/static\/chunks\/app\/page-[^"'\\]+\.js/
  );

  return match ? match[0] : null;
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

      const pageChunkPath = extractPageChunkPath(data);
      if (!pageChunkPath) {
        callback(new Error("未找到 app/page chunk"));
        return;
      }

      $httpClient.get(
        {
          url: `${UPSTREAM}${pageChunkPath}`,
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
          if (chunkError) {
            callback(chunkError);
            return;
          }

          const actions = parseActionReferences(chunkData);
          if (!actions.checkIn && !actions.getUserPoints) {
            callback(new Error("未从 app/page chunk 提取到 Server Action"));
            return;
          }

          callback(null, actions);
        }
      );
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
