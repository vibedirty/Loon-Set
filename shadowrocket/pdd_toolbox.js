// @file-type javascript
// update at 2026-07-31 11:39

(function () {
  const DEBUG_NOTIFY = true;
  const INJECT_BEFORE_MS = 10 * 60 * 1000;
  const GRACE_AFTER_TARGET_MS = 60 * 1000;
  const targetTimes = ['00:00:00', '10:00:00', '16:00:00', '21:00:00'];

  function log(subtitle, message, notify) {
    try {
      console.log('[券脚本] ' + subtitle + ' ' + (message || ''));
    } catch (e) {}

    try {
      if (DEBUG_NOTIFY && notify && typeof $notify !== 'undefined') {
        $notify('拼多多注入脚本', subtitle, message || '');
      }
    } catch (e) {}
  }

  function parseTarget(timeText, now) {
    const parts = timeText.split(':');
    const secondParts = (parts[2] || '0').split('.');
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Number(parts[0]),
      Number(parts[1]),
      Number(secondParts[0]),
      Number((secondParts[1] || '0').padEnd(3, '0'))
    );
  }

  function getNextTargetInfo() {
    const now = new Date();
    const nowTs = now.getTime();
    const targets = targetTimes
      .map(function (timeText) {
        const date = parseTarget(timeText, now);
        return { label: timeText, ts: date.getTime() };
      })
      .filter(function (item) {
        return !Number.isNaN(item.ts);
      })
      .sort(function (a, b) {
        return a.ts - b.ts;
      });

    if (!targets.length) {
      return { label: '未知时间', waitText: '未知时间', diffMs: Infinity };
    }

    let target = targets.find(function (item) {
      return nowTs <= item.ts + GRACE_AFTER_TARGET_MS;
    });

    if (!target) {
      target = {
        label: targets[0].label + ' 明天',
        ts: targets[0].ts + 24 * 60 * 60 * 1000
      };
    }

    const diffMs = Math.max(0, target.ts - nowTs);
    const totalSeconds = Math.ceil(diffMs / 1000);
    return {
      label: target.label,
      waitText: Math.floor(totalSeconds / 60) + '分钟' + (totalSeconds % 60) + '秒',
      diffMs: diffMs
    };
  }

  let body = ($response && $response.body) || '';
  const requestUrl = ($request && $request.url) || 'unknown';
  const hourMinutePattern = targetTimes
    .map(function (timeText) {
      return timeText.slice(0, 5).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .filter(function (value, index, values) {
      return values.indexOf(value) === index;
    })
    .join('|');

  log(
    '收到 response',
    'url: ' + requestUrl + ', body length: ' + body.length +
      ', times: ' + targetTimes.join('/')
  );

  if (hourMinutePattern) {
    body = body.replace(
      new RegExp('((?:' + hourMinutePattern + '))开抢', 'g'),
      '$1准备好了吗'
    );
  }
  body = body.replace(/"couponType":2/g, '"couponType":0');
  body = body.replace(
    /"couponType":[1-9]\d*(?=,[^{}]*"(?:unableToast|couponCornerText)":"(?:[^"\\]|\\.)*(?:(?:每日|每周)限兑|本周(?:已兑换|兑换(?:[^"\\]|\\.)*上限)|(?:\\u6bcf\\u65e5|\\u6bcf\\u5468)\\u9650\\u5151|\\u672c\\u5468(?:\\u5df2\\u5151\\u6362|\\u5151\\u6362(?:[^"\\]|\\.)*\\u4e0a\\u9650)))/g,
    '"couponType":0'
  );

  if (!body || body.indexOf('</body>') === -1) {
    log('未注入', 'response body 为空或没有 </body>');
    $done({ body: body });
    return;
  }

  if (body.indexOf('__PDD_TANDY_VASE_AUTO_CONFIRM_INJECTED__') !== -1) {
    log('跳过注入', 'HTML 中已存在注入标记');
    $done({ body: body });
    return;
  }

  const nextTarget = getNextTargetInfo();
  if (nextTarget.diffMs > INJECT_BEFORE_MS) {
    log(
      '无需注入',
      '距离下次自动兑换还有' + nextTarget.waitText +
        '（' + nextTarget.label + '），仅执行复写'
    );
    $done({ body: body });
    return;
  }

  const injected = `<script>
(function () {
  if (window.__PDD_TANDY_VASE_AUTO_CONFIRM_INJECTED__) return;
  window.__PDD_TANDY_VASE_AUTO_CONFIRM_INJECTED__ = true;

  var TARGET_TIMES = ${JSON.stringify(targetTimes)};
  var GRACE_AFTER_TARGET_MS = 60 * 1000;
  var PREPARE_BEFORE_MS = 1500;
  var POLL_INTERVAL_MS = 20;
  var clicked = false;
  var clickStarted = false;
  var highFreqTimer = null;
  var scheduleTimer = null;
  var observer = null;
  var activeTarget = null;

  function parseTodayTime(timeText) {
    var match = /^(\\d{1,2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,3}))?$/.exec(timeText);
    if (!match) return null;

    var now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number((match[4] || '0').padEnd(3, '0'))
    );
  }

  function getTargets() {
    return TARGET_TIMES
      .map(function (timeText) {
        var date = parseTodayTime(timeText);
        return date ? { label: timeText, ts: date.getTime() } : null;
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return a.ts - b.ts;
      });
  }

  function getActiveTarget() {
    var now = Date.now();
    var targets = getTargets();

    for (var i = 0; i < targets.length; i++) {
      if (now <= targets[i].ts + GRACE_AFTER_TARGET_MS) return targets[i];
    }

    if (!targets.length) return null;
    return {
      label: targets[0].label + ' 明天',
      ts: targets[0].ts + 24 * 60 * 60 * 1000
    };
  }

  function isVisible(element) {
    if (!element) return false;
    var rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    var style = window.getComputedStyle(element);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0';
  }

  function findConfirmButton() {
    var button = document.querySelector('._1Yazelp2 ._2DuZp14z');
    if (button && isVisible(button)) {
      var buttonText = (button.textContent || '').replace(/\\s+/g, '');
      if (buttonText.indexOf('确认兑换') !== -1) return button;
    }

    var candidates = Array.prototype.slice.call(
      document.querySelectorAll('div,button,span')
    );
    for (var i = 0; i < candidates.length; i++) {
      var element = candidates[i];
      var text = (element.textContent || '').replace(/\\s+/g, '');
      if (text === '确认兑换' && isVisible(element)) return element;
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

  function observePopup() {
    if (observer) return;

    observer = new MutationObserver(function () {
      if (clicked) return;
      var button = findConfirmButton();
      if (!button) return;

      activeTarget = getActiveTarget();
      if (!activeTarget) return;

      var now = Date.now();
      if (
        now >= activeTarget.ts &&
        now <= activeTarget.ts + GRACE_AFTER_TARGET_MS
      ) {
        clickButton(button);
      } else if (now >= activeTarget.ts - PREPARE_BEFORE_MS) {
        startHighFreqPolling();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function clickButton(button) {
    if (!button || clicked || clickStarted) return false;

    clickStarted = true;
    clicked = true;
    cleanupTimers();
    if (observer) {
      try { observer.disconnect(); } catch (e) {}
      observer = null;
    }

    try {
      button.click();
      return true;
    } catch (e) {
      try {
        button.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
        return true;
      } catch (error) {
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
    if (now < activeTarget.ts) return false;

    var button = findConfirmButton();
    return button ? clickButton(button) : false;
  }

  function startHighFreqPolling() {
    if (highFreqTimer || clicked) return;
    highFreqTimer = setInterval(tryClickIfTimeReached, POLL_INTERVAL_MS);
  }

  function scheduleNextTarget() {
    if (clicked) return;
    activeTarget = getActiveTarget();
    if (!activeTarget) return;

    var wait = Math.max(0, activeTarget.ts - Date.now() - PREPARE_BEFORE_MS);
    scheduleTimer = setTimeout(startHighFreqPolling, wait);
  }

  observePopup();
  scheduleNextTarget();

  window.__PDD_TANDY_VASE_AUTO_CONFIRM_DEBUG__ = {
    times: TARGET_TIMES,
    getActiveTarget: getActiveTarget,
    findConfirmButton: findConfirmButton,
    clickNow: function () {
      var button = findConfirmButton();
      return button ? clickButton(button) : false;
    }
  };
})();
</script>`;

  body = body.replace(/<\/body>/i, injected + '</body>');
  log(
    '注入成功',
    '将在' + nextTarget.waitText + '后自动兑换（' + nextTarget.label + '）',
    true
  );
  $done({ body: body });
})();
