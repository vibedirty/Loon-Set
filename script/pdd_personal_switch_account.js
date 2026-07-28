// @file-type javascript
// update at 2026-07-28 19:37

(function () {
  const SWITCH_TITLE = "切换账号";
  const SWITCH_LINK = "login_exchange_account.html";
  const SWITCH_LOG_SN = 4271537;
  const NOTICE_VERSION = "20260728-2";

  try {
    const body = JSON.parse($response.body);
    const result = injectBesideEverySetting(body);

    if (result.inserted === 0 && result.existing === 0) {
      console.log("[拼多多切换账号] 未找到可注入的个人中心图标区域");
      notifyOnce(
        "not-found",
        "个人中心脚本已执行",
        "未在接口响应中找到“设置”按钮"
      );
      $done({});
      return;
    }

    console.log(
      `[拼多多切换账号] 已处理官方设置按钮所在列表：新增 ${result.inserted} 处，已有 ${result.existing} 处`
    );
    notifyOnce(
      "success",
      "个人中心脚本已执行",
      `已注入 ${result.inserted || result.existing} 处切换账号入口`
    );
    $done({ body: JSON.stringify(body) });
  } catch (error) {
    console.log(`[拼多多切换账号] 处理失败：${error}`);
    notifyOnce("error", "个人中心脚本执行失败", String(error));
    $done({});
  }

  function injectBesideEverySetting(root) {
    const result = { inserted: 0, existing: 0 };
    walk(root);
    return result;

    function walk(value) {
      if (Array.isArray(value)) {
        injectIntoList(value);
        value.forEach(walk);
        return;
      }

      if (!value || typeof value !== "object") return;
      Object.keys(value).forEach(function (key) {
        walk(value[key]);
      });
    }

    function injectIntoList(list) {
      if (list.some(isSwitchEntry)) {
        result.existing += 1;
        return;
      }

      for (let index = list.length - 1; index >= 0; index -= 1) {
        if (!isSettingEntry(list[index])) continue;
        list.splice(index + 1, 0, createSwitchEntry(list[index]));
        result.inserted += 1;
      }
    }
  }

  function isSettingEntry(item) {
    if (!item || typeof item !== "object") return false;
    if (item.link === "setting.html" || item.link_url === "setting.html") {
      return true;
    }
    return item.app_name === "setting" && !isSwitchEntry(item);
  }

  function isSwitchEntry(item) {
    return (
      item &&
      typeof item === "object" &&
      (item.link === SWITCH_LINK || item.link_url === SWITCH_LINK)
    );
  }

  function createSwitchEntry(settingEntry) {
    const entry = JSON.parse(JSON.stringify(settingEntry));
    entry.title = SWITCH_TITLE;
    entry.link = SWITCH_LINK;
    entry.link_url = SWITCH_LINK;
    entry.app_name = settingEntry.app_name || "setting";
    entry.log_sn = SWITCH_LOG_SN;
    entry.extra = Object.assign({}, entry.extra, { login_scene: 12 });
    entry.track_info = Object.assign({}, entry.track_info, {
      page_el_sn: String(SWITCH_LOG_SN),
    });
    return entry;
  }

  function notifyOnce(status, subtitle, message) {
    if (
      typeof $notification === "undefined" ||
      typeof $persistentStore === "undefined"
    ) {
      return;
    }

    const key = `pdd_switch_account_${NOTICE_VERSION}_${status}`;
    if ($persistentStore.read(key)) return;
    $notification.post("拼多多工具箱", subtitle, message);
    $persistentStore.write("1", key);
  }
})();
