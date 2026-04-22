const sessionCookie = String($persistentStore.read("any-cookie") || "").trim();
const userId = $persistentStore.read("any-user") || "";

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

function notify(title, subtitle, message) {
  $notification.post(title, subtitle || "", message || "");
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

function getArg1(callback) {
  $httpClient.get(
    {
      url: `${UPSTREAM}/api/user/self`,
      headers: {
        Host: "anyrouter.top",
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: sessionCookie,
        "New-API-User": userId,
      },
    },
    function (error, response, data) {
      if (error) {
        callback(error);
        return;
      }

      const match = String(data || "").match(
        /var\s+arg1\s*=\s*['"]([0-9a-fA-F]{40})['"]/
      );
      if (!match) {
        callback(new Error(`arg1 not found, HTTP ${response?.status || "未知"}`));
        return;
      }

      callback(null, match[1]);
    }
  );
}

function getDynamicCookie(callback) {
  getArg1(function (error, arg1) {
    if (error) {
      callback(error);
      return;
    }

    callback(null, computeAcwCookie(arg1));
  });
}

function signIn(dynamicCookie) {
  if (!sessionCookie || !/^session=/.test(sessionCookie)) {
    notify("AnyRouter 签到错误", "", "any-cookie 需保存为 session=xxx;");
    $done();
    return;
  }

  const params = {
    url: `${UPSTREAM}/api/user/sign_in`,
    headers: {
      Host: "anyrouter.top",
      Connection: "keep-alive",
      "New-API-User": userId,
      "Cache-Control": "no-store",
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Origin: UPSTREAM,
      Referer: `${UPSTREAM}/`,
      "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
      Cookie: `${dynamicCookie}; ${sessionCookie}`,
    },
  };

  $httpClient.post(params, function (error, response, data) {
    console.log("anyrouter sign in finished");

    if (error) {
      notify("AnyRouter 签到错误", "", String(error));
      $done();
      return;
    }

    let json;
    try {
      json = JSON.parse(data);
    } catch (e) {
      const preview = String(data || "").slice(0, 200);
      notify("AnyRouter 返回解析失败", `HTTP ${response?.status || "未知"}`, preview || String(e));
      $done();
      return;
    }

    const status = response?.status || response?.statusCode || "未知";
    const success = Boolean(json?.success);
    const message = extractMessage(json, "");

    if (success) {
      const text =
        typeof message === "string" && message.trim()
          ? message.trim()
          : "今天已经签到过了";
      notify("AnyRouter 签到结果", `HTTP ${status}`, text);
      $done();
      return;
    }

    notify(
      "AnyRouter 签到失败",
      `HTTP ${status}`,
      typeof message === "string" && message.trim()
        ? message.trim()
        : JSON.stringify(json)
    );
    $done();
  });
}

getDynamicCookie(function (error, dynamicCookie) {
  if (error) {
    notify("AnyRouter 动态 Cookie 获取失败", "", String(error));
    $done();
    return;
  }

  signIn(dynamicCookie);
});
