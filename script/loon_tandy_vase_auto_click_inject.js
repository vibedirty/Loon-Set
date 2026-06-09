// Loon http-response script: inject auto-click code into tandy_vase.html
// Usage in plugin:
// ^https:\/\/m\.pinduoduo\.net\/tandy_vase\.html\?.*$ script-path=<your-url>/loon_tandy_vase_auto_click_inject.js, requires-body=true, timeout=10, tag=拼多多券自动确认注入

(function () {
  const DEBUG_NOTIFY = true;

  function loonLog(subtitle, message) {
    try {
      console.log('[券脚本] ' + subtitle + ' ' + (message || ''));
    } catch (e) {}

    try {
      if (DEBUG_NOTIFY && typeof $notification !== 'undefined') {
        $notification.post('券脚本', subtitle, message || '');
      }
    } catch (e) {}
  }

  const body = ($response && $response.body) || '';
  loonLog('收到 response', 'url: ' + (($request && $request.url) || 'unknown') + ', body length: ' + body.length);

  if (!body || body.indexOf('</body>') === -1) {
    loonLog('未注入', 'response body 为空或没有 </body>');
    $done({ body });
    return;
  }

  if (body.indexOf('__PDD_TANDY_VASE_AUTO_CONFIRM_INJECTED__') !== -1) {
    loonLog('跳过注入', 'HTML 中已存在注入标记');
    $done({ body });
    return;
  }

  const injected = `<script>
(function () {
  if (window.__PDD_TANDY_VASE_AUTO_CONFIRM_INJECTED__) return;
  window.__PDD_TANDY_VASE_AUTO_CONFIRM_INJECTED__ = true;

  /**
   * 自动点击确认兑换的三个时间点。
   * 页面时间使用设备本地时间。
   */
  var TARGET_TIMES = ['10:00:00', '16:00:00', '21:00:00', '14:54:00'];

  /** 到点后多少毫秒内，如果弹窗刚出现，也立即点击。 */
  var GRACE_AFTER_TARGET_MS = 60 * 1000;

  /** 目标时间前多少毫秒进入高频检测。 */
  var PREPARE_BEFORE_MS = 1500;

  /** 高频检测间隔。 */
  var POLL_INTERVAL_MS = 20;

  var clicked = false;
  var highFreqTimer = null;
  var scheduleTimer = null;
  var observer = null;
  var activeTarget = null;

  function showToast(message, duration) {
    duration = duration || 1400;

    try {
      var old = document.getElementById('__pdd_auto_confirm_toast__');
      if (old) old.remove();

      var el = document.createElement('div');
      el.id = '__pdd_auto_confirm_toast__';
      el.textContent = message;
      el.style.cssText = [
        'position:fixed',
        'left:50%',
        'top:50%',
        'transform:translate(-50%,-50%)',
        'z-index:2147483647',
        'max-width:78vw',
        'padding:10px 14px',
        'border-radius:8px',
        'background:rgba(0,0,0,.78)',
        'color:#fff',
        'font-size:14px',
        'line-height:1.4',
        'text-align:center',
        'word-break:break-all',
        'box-shadow:0 4px 16px rgba(0,0,0,.25)',
        'pointer-events:none'
      ].join(';');

      document.documentElement.appendChild(el);
      setTimeout(function () {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, duration);
    } catch (e) {}
  }

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

    // 当天三个时间都已过，排到明天第一个时间。
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
    if (!btn || clicked) return false;
    clicked = true;
    cleanupTimers();
    showToast('自动点击确认兑换');

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
        showToast('自动点击失败：' + err.message, 2200);
        return false;
      }
    }
  }

  function tryClickIfTimeReached() {
    if (clicked) return true;

    activeTarget = activeTarget || getActiveTarget();
    if (!activeTarget) return false;

    var now = Date.now();
    if (now < activeTarget.ts) return false;

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
      showToast('已到 ' + activeTarget.label + '，等待确认弹窗');
      startHighFreqPolling();
      return;
    }

    var wait = Math.max(0, diff - PREPARE_BEFORE_MS);
    scheduleTimer = setTimeout(function () {
      showToast('进入自动点击检测：' + activeTarget.label, 1200);
      startHighFreqPolling();
    }, wait);
  }

  function observePopup() {
    if (observer) return;

    observer = new MutationObserver(function () {
      if (clicked) return;

      var btn = findConfirmButton();
      if (!btn) return;

      activeTarget = activeTarget || getActiveTarget();
      if (!activeTarget) return;

      var now = Date.now();
      if (now >= activeTarget.ts && now <= activeTarget.ts + GRACE_AFTER_TARGET_MS) {
        clickButton(btn);
      } else if (now < activeTarget.ts) {
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
  showToast('券脚本已注入，目标：' + TARGET_TIMES.join(' / '), 2600);

  window.__PDD_TANDY_VASE_AUTO_CONFIRM_DEBUG__ = {
    times: TARGET_TIMES,
    getActiveTarget: getActiveTarget,
    findConfirmButton: findConfirmButton,
    clickNow: function () {
      var btn = findConfirmButton();
      if (!btn) {
        showToast('未找到确认兑换按钮');
        return false;
      }
      return clickButton(btn);
    }
  };
})();
</script>`;

  const newBody = body.replace(/<\/body>/i, injected + '</body>');
  loonLog('注入成功', 'body: ' + body.length + ' -> ' + newBody.length);
  $done({ body: newBody });
})();
