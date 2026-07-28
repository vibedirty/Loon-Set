// @file-type javascript
// update at 2026-07-28 19:22

(function () {
  const SWITCH_TITLE = "切换账号";
  const SWITCH_LINK = "login_exchange_account.html";
  const SWITCH_LOG_SN = 4271537;

  try {
    const body = JSON.parse($response.body);
    const style = body.personal_center_style_v2_vo || {};
    const iconSet = body.icon_set || {};
    const settingEntry =
      findSettingEntry(style.top_personal_icons_v2) ||
      findSettingEntryInRows(style.top_personal_icons_v3) ||
      findSettingEntry(iconSet.third_personal_icons);

    const switchEntry = createSwitchEntry(settingEntry);
    let inserted = false;

    inserted =
      addEntryOnce(style.third_personal_icons_v2, switchEntry) || inserted;
    inserted =
      addEntryOnce(iconSet.third_personal_icons, switchEntry) || inserted;

    if (!inserted) {
      inserted =
        addEntryOnce(style.top_personal_icons_v2, switchEntry) || inserted;
      inserted =
        addEntryToFirstRow(style.top_personal_icons_v3, switchEntry) ||
        inserted;
    }

    if (!inserted) {
      console.log("[拼多多切换账号] 未找到可注入的个人中心图标区域");
      $done({});
      return;
    }

    console.log("[拼多多切换账号] 已注入官方切换账号入口");
    $done({ body: JSON.stringify(body) });
  } catch (error) {
    console.log(`[拼多多切换账号] 处理失败：${error}`);
    $done({});
  }

  function createSwitchEntry(settingEntry) {
    const entry = settingEntry
      ? JSON.parse(JSON.stringify(settingEntry))
      : {
          image:
            "https://img.pddpic.com/a/coupon/ea1ea30c-2483-487c-90c7-b4d3f7154aa0.png.slim.png",
          style: 0,
          deleted: false,
        };

    entry.title = SWITCH_TITLE;
    entry.link = SWITCH_LINK;
    entry.app_name = "login_exchange_account";
    entry.log_sn = SWITCH_LOG_SN;
    entry.extra = Object.assign({}, entry.extra, { login_scene: 12 });
    entry.track_info = Object.assign({}, entry.track_info, {
      page_el_sn: String(SWITCH_LOG_SN),
    });

    return entry;
  }

  function findSettingEntry(list) {
    if (!Array.isArray(list)) return null;

    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      if (
        item &&
        (item.link === "setting.html" || item.app_name === "setting")
      ) {
        return item;
      }
    }

    return null;
  }

  function findSettingEntryInRows(rows) {
    if (!Array.isArray(rows)) return null;

    for (let index = 0; index < rows.length; index += 1) {
      const entry = findSettingEntry(rows[index]);
      if (entry) return entry;
    }

    return null;
  }

  function addEntryOnce(list, entry) {
    if (!Array.isArray(list)) return false;

    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      if (
        item &&
        (item.link === SWITCH_LINK ||
          item.app_name === "login_exchange_account")
      ) {
        return true;
      }
    }

    list.push(JSON.parse(JSON.stringify(entry)));
    return true;
  }

  function addEntryToFirstRow(rows, entry) {
    if (!Array.isArray(rows) || !Array.isArray(rows[0])) return false;
    return addEntryOnce(rows[0], entry);
  }
})();
