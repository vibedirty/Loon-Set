// @file-type javascript
// update at 2026-10-21 10:47
// Loon http-response：活动 197270 的下一场已解锁优惠券。
(function () {
  const STATE_KEY = 'pdd_hour_coupon_197270_target';
  const GRACE_MS = 60 * 1000;
  const url = ($request && $request.url) || '';
  const originalBody = ($response && $response.body) || '';
  let body = originalBody;

  function log(message) {
    console.log('[整点抢券] ' + message);
  }

  function nextSession(now) {
    const minutes = [0];
    for (let m = 8 * 60; m < 20 * 60; m += 30) minutes.push(m);
    for (let m = 20 * 60; m <= 21 * 60; m += 15) minutes.push(m);
    for (const minute of minutes) {
      const time = new Date(now);
      time.setHours(0, minute, 0, 0);
      if (time.getTime() >= now) return time.getTime();
    }
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
  }

  function rewriteBatch(list, target) {
    let changed = 0;
    for (const batch of list) {
      if (
        batch.batch_sn === target.batchSn &&
        batch.current_session_time * 1000 === target.time &&
        batch.status === 2 &&
        batch.feature && batch.feature.hv_task &&
        batch.feature.hv_task.status === 1
      ) {
        batch.status = 0;
        changed++;
      }
    }
    return changed;
  }

  // NEXT_DATA 位于 script 内，保留 JSON 字符串的 HTML 安全转义。
  function scriptJson(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function runInPage(target) {
    if (window.__PDD_HOUR_COUPON_AUTO__) return;
    window.__PDD_HOUR_COUPON_AUTO__ = true;
    var clicked = false;
    var graceMs = 60 * 1000;
    var session = new Date(target.time);
    var label = String(session.getHours()).padStart(2, '0') + ':' +
      String(session.getMinutes()).padStart(2, '0');
    var root = '#w-' + target.componentId;

    function log(message) {
      console.log('[整点抢券] ' + message);
    }

    function tick() {
      if (clicked) return;
      var now = Date.now();
      if (now < target.time) {
        setTimeout(tick, target.time - now);
        return;
      }
      if (now > target.time + graceMs) {
        log(label + ' 未找到就绪按钮，本次结束');
        return;
      }
      var active = document.querySelector(root + ' .zBQNqdA3.J6anxRwT');
      var button = document.querySelector(root + ' .zoe79pyA .nzc7Ln1S');
      // 立即抢说明页面已完成对应状态的渲染，避免点击到尚未绑定事件的初始 HTML。
      if (
        active && (active.textContent || '').indexOf(label) !== -1 &&
        button && (button.textContent || '').trim() === '立即抢'
      ) {
        var rect = button.getBoundingClientRect();
        var style = window.getComputedStyle(button);
        if (rect.width && rect.height && style.display !== 'none' &&
            style.visibility !== 'hidden' && style.opacity !== '0') {
          clicked = true;
          button.click();
          log(label + ' 已点击一次，时间：' + new Date().toISOString());
          return;
        }
      }
      setTimeout(tick, 20);
    }

    window.addEventListener('pagehide', function () { clicked = true; });
    log('已安排 ' + label + '，仅点击一次');
    tick();
  }

  try {
    const isPage = /^https:\/\/(?:m\.pinduoduo\.net|mobile\.yangkeduo\.com)\/attendance\.html\?/.test(url) &&
      /[?&]id=197270(?:&|$)/.test(url);
    const isList = /^https:\/\/(?:[a-z0-9-]+\.)?(?:pinduoduo\.(?:com|net)|yangkeduo\.com)\/api\/carnival\/hour_coupon\/v2\/coupon_info_list(?:[?]|$)/.test(url);

    if (isPage) {
      if (body.indexOf('__PDD_HOUR_COUPON_AUTO__') !== -1) {
        $done({ body });
        return;
      }
      $persistentStore.write('', STATE_KEY);
      const nextDataPattern = /(<script\b[^>]*\bid="NEXT_DATA"[^>]*>\s*window\.__NEXT_DATA__\s*=\s*)([\s\S]*?)(;\s*<\/script>)/;
      const match = nextDataPattern.exec(body);
      if (!match || !/<\/body>/i.test(body)) {
        log('页面缺少初始数据，保持原响应');
        $done({ body });
        return;
      }
      const data = JSON.parse(match[2]);
      const component = data.store.list.find(function (item) {
        return item.key === 'DcCouponSpikesV5';
      });
      if (!component) {
        log('未找到抢券组件，保持原响应');
        $done({ body });
        return;
      }
      const time = nextSession(Date.now());
      const batch = component.store.batchInfoList.find(function (item) {
        return item.current_session_time * 1000 === time;
      });
      if (!batch || !batch.batch_sn || ![0, 2].includes(batch.status) ||
          !batch.feature || !batch.feature.hv_task || batch.feature.hv_task.status !== 1) {
        log('下一场未解锁或不在可处理状态，请先解锁后重新进入页面');
        $done({ body });
        return;
      }
      const target = { time, batchSn: batch.batch_sn, componentId: component.componentId };
      const changed = rewriteBatch(component.store.batchInfoList, target);
      if (!$persistentStore.write(JSON.stringify(target), STATE_KEY)) {
        log('保存目标场次失败，保持原响应');
        $done({ body });
        return;
      }
      body = body.replace(nextDataPattern, function (_, prefix, json, suffix) {
        return prefix + scriptJson(data) + suffix;
      });
      const injected = '<script>(' + runInPage.toString() + ')(' + scriptJson(target) + ');</script>';
      body = body.replace(/<\/body>/i, function (closingTag) {
        return injected + closingTag;
      });
      log('已注入，目标：' + new Date(time).toString() + '，修改券数：' + changed);
    } else if (isList) {
      const saved = $persistentStore.read(STATE_KEY);
      if (!saved) {
        $done({ body });
        return;
      }
      const target = JSON.parse(saved);
      if (Date.now() > target.time + GRACE_MS) {
        $done({ body });
        return;
      }
      let changed = 0;
      const data = JSON.parse(body, function (key, value) {
        if (key === 'batch_info_list' && Array.isArray(value)) {
          changed += rewriteBatch(value, target);
        }
        return value;
      });
      if (changed) {
        body = JSON.stringify(data);
        log('券列表刷新：修改目标场次 ' + changed + ' 张券');
      }
    }
    $done({ body });
  } catch (error) {
    log('处理失败，保持原响应：' + error.message);
    $done({ body: originalBody });
  }
})();
