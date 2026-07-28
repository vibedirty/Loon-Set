// @file-type javascript
// update at 2026-07-28 19:43

(function () {
  const NOTICE_KEY = "pdd_personal_probe_202607281943";
  const safeUrl = String($request.url || "").split("?")[0];

  console.log(`[拼多多个人中心探针] 已命中请求：${safeUrl}`);

  if (
    typeof $notification !== "undefined" &&
    typeof $persistentStore !== "undefined" &&
    !$persistentStore.read(NOTICE_KEY)
  ) {
    $notification.post("拼多多工具箱", "已捕获个人中心请求", safeUrl);
    $persistentStore.write("1", NOTICE_KEY);
  }

  $done({});
})();
