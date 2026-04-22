
const cookieVal = $persistentStore.read('any-cookie');
const userId = $persistentStore.read('any-user');

const headers = {
  Host: "anyrouter.top",
  Connection: "keep-alive",
  "New-API-User": userId,
  "sec-ch-ua-platform": '"macOS"',
  "Cache-Control": "no-store",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  "sec-ch-ua-mobile": "?0",
  Origin: "https://anyrouter.top",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
  Referer: "https://anyrouter.top/",
  "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
  Cookie: cookieVal,
};

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

function signIn() {
  const params = {
    url: "https://anyrouter.top/api/user/sign_in",
    headers: { ...headers },
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
      notify("AnyRouter 返回解析失败", `HTTP ${response?.status || "未知"}`, String(e));
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
        : data || "无返回内容"
    );
    $done();
  });
}

signIn();
