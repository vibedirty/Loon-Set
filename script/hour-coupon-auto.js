// @file-type javascript
// update at 2026-10-21 12:13
// Loon http-response：活动 197270 的下一场自动解锁、确认并抢券。
(function () {
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

  // 注入参数位于 script 内，保留 JSON 字符串的 HTML 安全转义。
  function scriptJson(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function runInPage(target) {
    if (window.__PDD_HOUR_COUPON_AUTO__) return;
    window.__PDD_HOUR_COUPON_AUTO__ = true;
    var stopped = false;
    var graceMs = 60 * 1000;
    var prepareBeforeMs = 1500;
    var pollIntervalMs = 20;
    var fastPollIntervalMs = 4;
    var prepareTimer = null;
    var pollTimer = null;
    var targetTimer = null;
    var unlockObserver = null;
    var unlockPending = false;
    var phase = target.needsUnlock ? 'unlock' : 'claim';
    var session = new Date(target.time);
    var label = String(session.getHours()).padStart(2, '0') + ':' +
      String(session.getMinutes()).padStart(2, '0');
    var root = '#w-' + target.componentId;

    function log(message) {
      console.log('[整点抢券] ' + message);
    }

    function stop() {
      stopped = true;
      clearTimeout(prepareTimer);
      clearTimeout(pollTimer);
      clearTimeout(targetTimer);
      if (unlockObserver) unlockObserver.disconnect();
      window.removeEventListener('pagehide', stop);
    }

    function isVisible(element) {
      if (!element) return false;
      var rect = element.getBoundingClientRect();
      var style = window.getComputedStyle(element);
      return Boolean(rect.width && rect.height && style.display !== 'none' &&
        style.visibility !== 'hidden' && style.opacity !== '0');
    }

    function findUnlockConfirm() {
      // Egqx 弹窗的确认按钮使用背景图片，无文字内容，不能按按钮文本查找。
      var dialogs = document.querySelectorAll('.HMO6QNyo .StG_xOJG');
      for (var i = 0; i < dialogs.length; i++) {
        var dialog = dialogs[i];
        var title = dialog.querySelector('.G4TOG23F');
        var content = dialog.querySelector('.con92xrh');
        var tip = dialog.querySelector('.jV2RSBJA');
        var button = dialog.querySelector('.LIAWcJR3');
        if (title && (title.textContent || '').trim() === '确定解锁5折神券' &&
            content && new RegExp('(?:^|[^0-9])' + label + '(?:[^0-9]|$)').test(content.textContent || '') &&
            tip && (tip.textContent || '').replace(/\s+/g, '').indexOf('解锁将消耗' + target.minPoints + '张') !== -1 &&
            isVisible(dialog) && isVisible(button)) {
          return button;
        }
      }
      return null;
    }

    function watchUnlockProgress() {
      // 仅在主动解锁后监听弹窗创建和列表刷新，减少确认及抢券的等待。
      if (unlockObserver || typeof MutationObserver === 'undefined' || !document.documentElement) return;
      unlockObserver = new MutationObserver(function () { tryClick(); });
      unlockObserver.observe(document.documentElement, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['class', 'style', 'hidden', 'disabled']
      });
    }

    function findCouponAction(button) {
      // 通过 React 组件找到页面原来的券点击事件，获取完整异步处理的 Promise。
      var element = button;
      var fiber = null;
      while (element && !fiber) {
        var keys = Object.getOwnPropertyNames(element);
        for (var i = 0; i < keys.length; i++) {
          if (keys[i].indexOf('__reactFiber$') === 0 || keys[i].indexOf('__reactInternalInstance$') === 0) {
            fiber = element[keys[i]];
            break;
          }
        }
        element = element.parentElement;
      }
      var trackingInfo;
      while (fiber) {
        if (fiber.memoizedProps && fiber.memoizedProps.trackingInfo) {
          trackingInfo = fiber.memoizedProps.trackingInfo;
        }
        var instance = fiber.stateNode;
        if (instance && typeof instance.onClickCouponItem === 'function' &&
            instance.store && instance.store.batchInfoList && typeof instance.store.batchInfoList.find === 'function') {
          var batch = instance.store.batchInfoList.find(function (item) {
            return item.batch_sn === target.batchSn && item.current_session_time * 1000 === target.time;
          });
          if (batch) {
            return function () { return instance.onClickCouponItem(batch, trackingInfo); };
          }
        }
        fiber = fiber.return;
      }
      return null;
    }

    function tryClick() {
      if (stopped) return true;
      var now = Date.now();
      if (now < target.time) return false;
      if (now > target.time + graceMs) {
        stop();
        log(label + ' 流程超时，停止于：' + phase);
        return true;
      }
      if (phase === 'confirm') {
        var confirmButton = findUnlockConfirm();
        if (!confirmButton || Date.now() < target.time || Date.now() > target.time + graceMs) return false;
        // 点击前切换阶段，避免页面同步更新或监听回调造成重复确认。
        phase = 'claim';
        confirmButton.click();
        log(label + ' 已点击解锁确认，等待券列表刷新');
        return false;
      }
      // 券列表可能先更新；必须等 onClickCouponItem 的异步锁释放后才能抢券。
      if (unlockPending) return false;
      var active = document.querySelector(root + ' .zBQNqdA3.J6anxRwT');
      var button = document.querySelector(root + ' .zoe79pyA .nzc7Ln1S');
      if (
        active && (active.textContent || '').indexOf(label) !== -1 &&
        isVisible(button)
      ) {
        var text = (button.textContent || '').trim();
        if (phase === 'unlock' && text === '去解锁') {
          if (Date.now() < target.time || Date.now() > target.time + graceMs) return false;
          var unlockAction = findCouponAction(button);
          if (!unlockAction) {
            stop();
            log(label + ' 未找到目标场次的页面解锁事件，本次结束');
            return true;
          }
          phase = 'confirm';
          unlockPending = true;
          watchUnlockProgress();
          try {
            var unlockResult = unlockAction();
            if (!unlockResult || typeof unlockResult.then !== 'function') {
              stop();
              log(label + ' 页面解锁事件未返回异步结果，本次结束');
              return true;
            }
            unlockResult.then(function () {
              if (stopped) return;
              unlockPending = false;
              log(label + ' 页面解锁处理已完成，开始检查立即抢');
              tryClick();
            }, function (error) {
              if (stopped) return;
              stop();
              log(label + ' 页面解锁处理失败：' + String(error && error.message || error));
            });
          } catch (error) {
            stop();
            log(label + ' 触发页面解锁事件失败：' + String(error && error.message || error));
            return true;
          }
          log(label + ' 已触发去解锁，等待目标场次确认弹窗');
          return false;
        }
        if (text === '立即抢') {
          var clickedAt = Date.now();
          if (clickedAt < target.time) return false;
          if (clickedAt > target.time + graceMs) {
            stop();
            log(label + ' 未找到就绪按钮，本次结束');
            return true;
          }
          stop();
          button.click();
          log(label + ' 已点击立即抢一次，时间：' + new Date(clickedAt).toISOString() +
            '，晚于目标：' + (clickedAt - target.time) + '毫秒');
          return true;
        }
      }
      return false;
    }

    function poll() {
      if (tryClick() || stopped) return;
      var remainingMs = target.time - Date.now();
      // 到点前100毫秒至到点后1秒加密检测，其他时间保持20毫秒间隔。
      var interval = remainingMs <= 100 && remainingMs >= -1000 ? fastPollIntervalMs : pollIntervalMs;
      pollTimer = setTimeout(poll, remainingMs > 0 ? Math.min(interval, remainingMs) : interval);
    }

    function checkAtTarget() {
      if (stopped) return;
      var remainingMs = target.time - Date.now();
      if (remainingMs > 0) {
        targetTimer = setTimeout(checkAtTarget, remainingMs);
        return;
      }
      tryClick();
    }

    function startMonitoring() {
      if (stopped) return;
      var remainingMs = target.time - prepareBeforeMs - Date.now();
      if (remainingMs > 0) {
        prepareTimer = setTimeout(startMonitoring, remainingMs);
        return;
      }
      // 到点检查独立计时，与轮询共用同一套点击判断。
      targetTimer = setTimeout(checkAtTarget, Math.max(0, target.time - Date.now()));
      poll();
    }

    window.addEventListener('pagehide', stop);
    log('已安排 ' + label + '，提前1.5秒开始检测，' +
      (target.needsUnlock ? '依次点击去解锁、确认、立即抢，各执行一次' : '立即抢仅点击一次'));
    startMonitoring();
  }

  try {
    const isPage = /^https:\/\/(?:m\.pinduoduo\.net|mobile\.yangkeduo\.com)\/attendance\.html\?/.test(url) &&
      /[?&]id=197270(?:&|$)/.test(url);

    if (isPage) {
      if (body.indexOf('__PDD_HOUR_COUPON_AUTO__') !== -1) {
        $done({ body });
        return;
      }
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
          !batch.feature || !batch.feature.hv_task || ![0, 1].includes(batch.feature.hv_task.status)) {
        log('下一场不在可处理状态，保持原响应');
        $done({ body });
        return;
      }
      const needsUnlock = batch.feature.hv_task.status === 0;
      const minPoints = Number(batch.feature.hv_task.min_points) || 0;
      if (needsUnlock && (!(minPoints > 0) || typeof component.store.score !== 'number' ||
          component.store.score < minPoints || component.store.taskApiError)) {
        log('下一场解锁所需减减卡不足或卡数查询异常，保持原响应');
        $done({ body });
        return;
      }
      const target = { time, batchSn: batch.batch_sn, componentId: component.componentId, needsUnlock, minPoints };
      const injected = '<script>(' + runInPage.toString() + ')(' + scriptJson(target) + ');</script>';
      body = body.replace(/<\/body>/i, function (closingTag) {
        return injected + closingTag;
      });
      log('已注入，目标：' + new Date(time).toString() + '，保留页面原始券状态');
    }
    $done({ body });
  } catch (error) {
    log('处理失败，保持原响应：' + error.message);
    $done({ body: originalBody });
  }
})();
