// @file-type javascript
// update at 2026-07-31 11:32

(function () {
  const DEBUG_NOTIFY = true;
  const INJECT_BEFORE_MS = 10 * 60 * 1000;
  const GRACE_AFTER_TARGET_MS_OUTER = 60 * 1000;
  const fallback = ['00:00:00', '10:00:00', '16:00:00', '21:00:00'];

  function scriptLog(subtitle, message, notify) {
    try {
      console.log('[券脚本] ' + subtitle + ' ' + (message || ''));
    } catch (e) {}

    try {
      if (!DEBUG_NOTIFY || !notify) return;

      if (typeof $notification !== 'undefined') {
        $notification.post('拼多多注入脚本', subtitle, message || '');
      } else if (typeof $notify !== 'undefined') {
        $notify('拼多多注入脚本', subtitle, message || '');
      }
    } catch (e) {}
  }

  const targetTimes = fallback;
  const targetTimesJson = JSON.stringify(targetTimes);
  const rewriteHourMinutePattern = targetTimes
    .map(function (t) { return t.slice(0, 5).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); })
    .filter(function (value, index, arr) { return arr.indexOf(value) === index; })
    .join('|');

  let body = ($response && $response.body) || '';
  scriptLog('收到 response', 'url: ' + (($request && $request.url) || 'unknown') + ', body length: ' + body.length + ', times: ' + targetTimes.join('/'));

  // 原 [Rewrite] 逻辑合并到 response script，避免同一 URL 上 Rewrite 与 Script 冲突。
  if (rewriteHourMinutePattern) {
    body = body.replace(new RegExp('((?:' + rewriteHourMinutePattern + '))开抢', 'g'), '$1准备好了吗');
  }
  body = body.replace(/"couponType":2/g, '"couponType":0');
  body = body.replace(
    /"couponType":[1-9]\d*(?=,[^{}]*"(?:unableToast|couponCornerText)":"(?:[^"\\]|\\.)*(?:(?:每日|每周)限兑|本周(?:已兑换|兑换(?:[^"\\]|\\.)*上限)|(?:\\u6bcf\\u65e5|\\u6bcf\\u5468)\\u9650\\u5151|\\u672c\\u5468(?:\\u5df2\\u5151\\u6362|\\u5151\\u6362(?:[^"\\]|\\.)*\\u4e0a\\u9650)))/g,
    '"couponType":0'
  );

  if (!body || body.indexOf('</body>') === -1) {
    scriptLog('未注入', 'response body 为空或没有 </body>');
    $done({ body });
    return;
  }

  if (body.indexOf('__PDD_TANDY_VASE_AUTO_CONFIRM_INJECTED__') !== -1) {
    scriptLog('跳过注入', 'HTML 中已存在注入标记');
    $done({ body });
    return;
  }

  const injected = `<script>
(function () {
  if (window.__PDD_TANDY_VASE_AUTO_CONFIRM_INJECTED__) return;
  window.__PDD_TANDY_VASE_AUTO_CONFIRM_INJECTED__ = true;

  /**
   * 自动点击确认兑换的目标时间点。
   * 页面时间使用设备本地时间。
   */
  var TARGET_TIMES = ${targetTimesJson};

  /** 到点后多少毫秒内，如果弹窗刚出现，也立即点击。 */
  var GRACE_AFTER_TARGET_MS = 60 * 1000;

  /** 目标时间前多少毫秒进入高频检测。 */
  var PREPARE_BEFORE_MS = 1500;

  /** 高频检测间隔。 */
  var POLL_INTERVAL_MS = 20;

  var clicked = false;
  var clickStarted = false;
  var highFreqTimer = null;
  var scheduleTimer = null;
  var observer = null;
  var activeTarget = null;

  function parseTodayTime(timeText) {
    var m = /^(\\d{1,2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,3}))?$/.exec(timeText);
    if (!m) return null;

    var now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      Number((m[4] || '0').padEnd(3, '0'))
    );
  }

  function getTargets() {
    return TARGET_TIMES
      .map(function (t) {
        var d = parseTodayTime(t);
        return d ? { label: t, ts: d.getTime(), date: d } : null;
      })
      .filter(Boolean)
      .sort(function (a, b) { return a.ts - b.ts; });
  }

  function getActiveTarget() {
    var now = Date.now();
    var targets = getTargets();

    for (var i = 0; i < targets.length; i++) {
      if (now <= targets[i].ts + GRACE_AFTER_TARGET_MS) {
        return targets[i];
      }
    }

    // 当天所有目标时间都已过，排到明天第一个时间。
    var first = targets[0];
    if (!first) return null;
    return {
      label: first.label + ' 明天',
      ts: first.ts + 24 * 60 * 60 * 1000,
      date: new Date(first.ts + 24 * 60 * 60 * 1000)
    };
  }

  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function findConfirmButton() {
    // 当前抓包版本：ExchangeCoupon 弹窗根节点 _1Yazelp2，确认按钮 _2DuZp14z
    var btn = document.querySelector('._1Yazelp2 ._2DuZp14z');
    if (btn && isVisible(btn)) {
      var text = (btn.textContent || '').replace(/\\s+/g, '');
      if (text.indexOf('确认兑换') !== -1) return btn;
    }

    // 兜底：class hash 变更时，通过可见文本查找。
    var candidates = Array.prototype.slice.call(document.querySelectorAll('div,button,span'));
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var txt = (el.textContent || '').replace(/\\s+/g, '');
      if (txt !== '确认兑换') continue;
      if (!isVisible(el)) continue;
      return el;
    }

    return null;
  }

  function cleanupTimers() {
    if (highFreqTimer) {
      clearInterval(highFreqTimer);
      highFreqTimer = null;
    }
    if (scheduleTimer) {
      clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
  }

  function clickButton(btn) {
    if (!btn || clicked || clickStarted) return false;

    clickStarted = true;
    clicked = true;
    cleanupTimers();

    if (observer) {
      try { observer.disconnect(); } catch (e) {}
      observer = null;
    }

    var targetLabel = activeTarget && activeTarget.label || 'unknown';

    try {
      btn.click();
      return true;
    } catch (e) {
      try {
        btn.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
        return true;
      } catch (err) {
        clicked = false;
        clickStarted = false;
        observePopup();
        startHighFreqPolling();
        return false;
      }
    }
  }

  function tryClickIfTimeReached() {
    if (clicked) return true;

    activeTarget = getActiveTarget();
    if (!activeTarget) return false;

    var now = Date.now();
    if (now < activeTarget.ts) {
      if (now < activeTarget.ts - PREPARE_BEFORE_MS) {
        cleanupTimers();
        scheduleNextTarget();
      }
      return false;
    }

    var btn = findConfirmButton();
    if (!btn) return false;

    return clickButton(btn);
  }

  function startHighFreqPolling() {
    if (highFreqTimer || clicked) return;
    highFreqTimer = setInterval(function () {
      tryClickIfTimeReached();
    }, POLL_INTERVAL_MS);
  }

  function scheduleNextTarget() {
    if (clicked) return;

    activeTarget = getActiveTarget();
    if (!activeTarget) return;

    var now = Date.now();
    var diff = activeTarget.ts - now;

    if (diff <= 0) {
      startHighFreqPolling();
      return;
    }

    var wait = Math.max(0, diff - PREPARE_BEFORE_MS);
    scheduleTimer = setTimeout(function () {
      startHighFreqPolling();
    }, wait);
  }

  function observePopup() {
    if (observer) return;

    observer = new MutationObserver(function () {
      if (clicked) return;

      var btn = findConfirmButton();
      if (!btn) return;

      activeTarget = getActiveTarget();
      if (!activeTarget) return;

      var now = Date.now();
      if (now >= activeTarget.ts && now <= activeTarget.ts + GRACE_AFTER_TARGET_MS) {
        clickButton(btn);
      } else if (now >= activeTarget.ts - PREPARE_BEFORE_MS) {
        startHighFreqPolling();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  observePopup();
  scheduleNextTarget();

  window.__PDD_TANDY_VASE_AUTO_CONFIRM_DEBUG__ = {
    times: TARGET_TIMES,
    getActiveTarget: getActiveTarget,
    findConfirmButton: findConfirmButton,
    clickNow: function () {
      var btn = findConfirmButton();
      if (!btn) {
        return false;
      }
      return clickButton(btn);
    }
  };
})();
</script>`;

  function getNextTargetInfo() {
    const now = new Date();
    const nowTs = now.getTime();
    const candidates = targetTimes
      .map(function (t) {
        const parts = t.split(':');
        const msParts = (parts[2] || '0').split('.');
        const d = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          Number(parts[0]),
          Number(parts[1]),
          Number(msParts[0]),
          Number((msParts[1] || '0').padEnd(3, '0'))
        );
        return { label: t, ts: d.getTime() };
      })
      .filter(function (item) { return !Number.isNaN(item.ts); })
      .sort(function (a, b) { return a.ts - b.ts; });

    if (!candidates.length) return { label: '未知时间', waitText: '未知时间', diffMs: Infinity };

    let target = candidates.find(function (item) {
      return nowTs <= item.ts + GRACE_AFTER_TARGET_MS_OUTER;
    });

    if (!target) {
      target = { label: candidates[0].label + ' 明天', ts: candidates[0].ts + 24 * 60 * 60 * 1000 };
    }

    const diffMs = Math.max(0, target.ts - nowTs);
    const totalSeconds = Math.ceil(diffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return { label: target.label, waitText: minutes + '分钟' + seconds + '秒', diffMs: diffMs };
  }

  const nextTargetInfo = getNextTargetInfo();

  if (nextTargetInfo.diffMs > INJECT_BEFORE_MS) {
    scriptLog('无需注入', '距离下次自动兑换还有' + nextTargetInfo.waitText + '（' + nextTargetInfo.label + '），仅执行复写');
    $done({ body });
    return;
  }

  const newBody = body.replace(/<\/body>/i, injected + '</body>');
  scriptLog('注入成功', '将在' + nextTargetInfo.waitText + '后自动兑换（' + nextTargetInfo.label + '）', true);
  $done({ body: newBody });
})();
