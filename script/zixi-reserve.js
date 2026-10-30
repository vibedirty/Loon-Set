// @file-type javascript
// update at 2026-10-30 12:11
// 配合 plugin/zixi-reserve.lpx 使用：自动保存登录令牌，每天预约次日 09:00–18:00。

(function () {
  const BASE = 'https://cloud.macken-tech.com';
  const APP_ID = 'wx825445b915377a7f';
  const STORE_ID = 12;
  const PRIORITIES = ['29', '27', '28', '21', '22', '33', '24'];
  const START = 9;
  const END = 18;
  const RESERVED_DAY = 2; // 抓包确认：2 代表次日，不能按日期差自行改为 1。
  const TOKEN_KEY = 'zixi-token';
  const AGENT_KEY = 'zixi-user-agent';
  const DEFAULT_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.73 ' +
    'NetType/WIFI Language/zh_CN';
  let token = '';
  let stateKey = '';
  let lockKey = '';
  let lockValue = '';
  let label = '';

  function notify(title, message) {
    const safe = token ? String(message).split(token).join('<令牌已隐藏>') : String(message);
    console.log('[自习预约] ' + title + '：' + safe);
    $notification.post('麦肯自习预约 · ' + title, label, safe);
  }

  function header(headers, name) {
    const key = Object.keys(headers || {}).find(k => k.toLowerCase() === name);
    return key ? String(headers[key]) : '';
  }

  function save(value, key) {
    if (!$persistentStore.write(value, key)) throw new Error('无法写入 Loon 持久化存储：' + key);
  }

  function capture() {
    const request = $request;
    // 只从目标小程序带 app_id 的 GET 请求保存凭据。
    if (String(request.method).toUpperCase() !== 'GET' ||
        !/^https:\/\/cloud\.macken-tech\.com\/api\//.test(request.url) ||
        !new RegExp('[?&]app_id=' + APP_ID + '(?:&|$)').test(request.url)) return;
    const authorization = header(request.headers, 'authorization').trim();
    if (!/^Bearer\s+\S+$/i.test(authorization)) return;
    token = authorization.replace(/^Bearer\s+/i, '');
    const changed = $persistentStore.read(TOKEN_KEY) !== token;
    save(token, TOKEN_KEY);
    const agent = header(request.headers, 'user-agent');
    if (agent) save(agent, AGENT_KEY);
    if (changed) notify('登录信息已更新', '每天 06:00 自动预约次日 09:00–18:00。');
  }

  function chinaTime() {
    const shifted = new Date(Date.now() + 8 * 3600000);
    return {
      today: shifted.toISOString().slice(0, 10),
      tomorrow: new Date(shifted.getTime() + 86400000).toISOString().slice(0, 10),
      hour: shifted.getUTCHours(),
    };
  }

  function fault(kind, message) {
    const error = new Error(message);
    error.kind = kind;
    return error;
  }

  function api(method, path, params) {
    return new Promise((resolve, reject) => {
      let settled = false;
      function finish(error, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      }
      const timer = setTimeout(() => finish(fault('network', '请求超时')), 8500);
      const options = {
        url: BASE + path,
        timeout: 8000, // Loon 的 HTTP 请求超时单位是毫秒。
        'auto-redirect': false,
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': $persistentStore.read(AGENT_KEY) || DEFAULT_AGENT,
          Referer: 'https://servicewechat.com/' + APP_ID + '/91/page-frame.html',
        },
      };
      if (method === 'get') {
        const query = Object.assign({}, params, { app_id: APP_ID });
        options.url += '?' + Object.keys(query).map(k =>
          encodeURIComponent(k) + '=' + encodeURIComponent(query[k])).join('&');
      } else options.body = JSON.stringify(Object.assign({}, params, { app_id: APP_ID }));
      try {
        $httpClient[method](options, (error, response, body) => {
          if (error) return finish(fault('network', '网络请求失败'));
          const status = Number(response && (response.status || response.statusCode));
          if (status === 401 || status === 403) {
            return finish(fault('auth', '登录失效或无访问权限，请打开小程序刷新登录信息'));
          }
          if (!status || status >= 500) return finish(fault('network', '服务器异常，HTTP ' + (status || '未知')));
          let result;
          try { result = JSON.parse(body); }
          catch (_) { return finish(fault('invalid', '接口未返回有效 JSON，HTTP ' + status)); }
          if (result && result.success === false && Number(result.status) === 0) {
            return finish(fault('business', String(result.message || result.error || '请求被拒绝').slice(0, 160)));
          }
          if (status < 200 || status >= 300 || !result || result.success !== true ||
              Number(result.status) !== 1 || Number(result.code) !== 0) {
            return finish(fault('invalid', '接口返回异常状态，HTTP ' + status));
          }
          finish(null, result.data);
        });
      } catch (_) { finish(fault('network', '无法发送请求')); }
    });
  }

  function readObject(key) {
    const raw = $persistentStore.read(key);
    if (!raw) return {};
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch (_) { /* 损坏的预约状态不能按未预约处理。 */ }
    throw new Error('保存的预约状态损坏，请先检查 ' + key);
  }

  function fixedReason(seat, date) {
    if (!(seat.is_open === true || seat.is_open === 1)) return '座位未开放';
    if (seat.is_bound !== 0 && seat.is_bound !== false && seat.is_bound !== '0') return '已固定或固定状态不明确';
    if (!Array.isArray(seat.user_times)) return '缺少固定期限信息';
    for (const period of seat.user_times) {
      const from = String(period.start_time || '').slice(0, 10);
      const until = String(period.end_time || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || from > until) {
        return '固定期限不明确';
      }
      if (from <= date && date <= until) return '预约日期内已固定';
    }
    return '';
  }

  function dateTime(value) {
    const text = String(value || '');
    // 抓包接口返回北京时间且没有时区；带时区的响应则明确转换为北京时间。
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(text)) return text.replace('T', ' ');
    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
      const time = Date.parse(text);
      if (Number.isFinite(time)) return new Date(time + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    }
    throw new Error('预约时间格式不明确');
  }

  function active(record) {
    if (record.deleted_at || record.active === false || record.active === 0) return false;
    if (record.active !== true && record.active !== 1) throw new Error('预约有效状态不明确');
    return true;
  }

  function overlaps(record, target) {
    if (!active(record)) return false;
    const from = dateTime(record.not_before);
    const until = dateTime(record.not_after);
    if (from >= until) throw new Error('预约起止时间异常');
    return from < target.until && until > target.from;
  }

  function owned(record, uid) {
    const owner = record.uid == null && record.user ? record.user.id : record.uid;
    return owner != null && String(owner) === String(uid);
  }

  function covers(record, target) {
    return dateTime(record.not_before) <= target.from && dateTime(record.not_after) >= target.until;
  }

  async function schedule(seat, today) {
    const data = await api('get', '/api/reservations/seats/' + seat.id, { reserved_day: RESERVED_DAY });
    if (!data || data.today !== today || !Array.isArray(data.reservations)) {
      throw new Error('座位 ' + seat.name + ' 的预约列表或服务器日期异常');
    }
    if (!Number.isFinite(Number(data.start_hour)) || !Number.isFinite(Number(data.end_hour)) ||
        Number(data.start_hour) > START || Number(data.end_hour) < END) {
      throw new Error('营业时间不覆盖 09:00–18:00');
    }
    return data.reservations;
  }

  function recordState(target, seat, status, reservation) {
    save(JSON.stringify({
      date: target.date, from: target.from, until: target.until,
      seatId: seat.id, seatName: seat.name, status,
      reservationId: reservation && reservation.id,
    }), stateKey);
  }

  function success(target, seat, reservation, existing) {
    recordState(target, seat, 'success', reservation);
    notify(existing ? '已有预约' : '预约成功', '麦肯自习室（嘉悦店） · ' + seat.name +
      ' 号座位\n09:00–18:00\n预约编号：' + reservation.id);
  }

  async function run() {
    const time = chinaTime();
    label = time.tomorrow + ' 09:00–18:00';
    if (time.hour < 6) throw new Error('北京时间 06:00 后才可预约次日，请在开放后执行');
    token = String($persistentStore.read(TOKEN_KEY) || '').trim().replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('尚未保存登录信息，请启用插件后打开麦肯自习小程序的预约页面');
    const target = { date: time.tomorrow, from: time.tomorrow + ' 09:00:00', until: time.tomorrow + ' 18:00:00' };
    const user = await api('get', '/api/user');
    if (!user || !Number.isInteger(Number(user.id)) || Number(user.id) <= 0) throw new Error('无法确认当前账号');
    const uid = user.id;
    stateKey = 'zixi-booking-' + uid + '-' + STORE_ID;
    lockKey = stateKey + '-lock';
    const oldLock = Number($persistentStore.read(lockKey) || 0);
    if (oldLock > Date.now()) throw new Error('另一次预约任务正在执行，请稍后再试');
    lockValue = String(Date.now() + 190000);
    save(lockValue, lockKey);

    // 已成功或结果待确认的提交，先从服务器核实，避免重复运行时再次预约。
    const previous = readObject(stateKey);
    if (previous.date === target.date && previous.status) {
      if (previous.from !== target.from || previous.until !== target.until ||
          !Number.isInteger(Number(previous.seatId)) || Number(previous.seatId) <= 0) {
        throw new Error('已有不同时间段或不完整的提交记录，请先人工核实');
      }
      const seat = { id: previous.seatId, name: previous.seatName };
      const records = await schedule(seat, time.today);
      const found = records.find(r => overlaps(r, target) && owned(r, uid) && covers(r, target));
      if (found) { success(target, seat, found, true); return; }
      if (previous.status === 'pending') {
        throw new Error('上次提交结果仍待确认，已停止再次提交。请在小程序核实后清除 ' + stateKey + ' 再重试');
      }
    }

    await api('get', '/api/reservations/check');
    const seats = await api('get', '/api/seats', { reserved_day: RESERVED_DAY, store_id: STORE_ID, type: 'normal' });
    if (!Array.isArray(seats) || !seats.length) throw new Error('座位列表为空或格式异常');
    const candidates = PRIORITIES.map(name => {
      const matches = seats.filter(s => String(s.name) === name && String(s.store_id) === String(STORE_ID));
      if (matches.length !== 1 || !Number.isInteger(Number(matches[0].id)) || Number(matches[0].id) <= 0) {
        throw new Error('无法唯一确定 ' + name + ' 号座位');
      }
      return matches[0];
    });
    const plans = [];
    let ownPartial = false;
    // 先检查全部候选座位，发现本人已有完整预约就结束，避免改约到另一个座位。
    for (const seat of candidates) {
      const records = await schedule(seat, time.today);
      const conflicts = records.filter(r => overlaps(r, target));
      const own = conflicts.filter(r => owned(r, uid));
      const existing = own.find(r => covers(r, target));
      if (existing) { success(target, seat, existing, true); return; }
      if (own.length) ownPartial = true;
      plans.push({ seat, reason: fixedReason(seat, target.date) || (conflicts.length ? '09:00–18:00 已有预约' : '') });
    }
    if (ownPartial) throw new Error('候选座位中已有本人部分时段的预约，请先人工确认，避免重复占用');

    const skipped = [];
    for (const plan of plans) {
      const seat = plan.seat;
      if (plan.reason) { skipped.push(seat.name + ' 号：' + plan.reason); continue; }
      // 提交前刷新，防止查询后出现新预约或新固定记录。
      const latest = await api('get', '/api/seats', { reserved_day: RESERVED_DAY, store_id: STORE_ID, type: 'normal' });
      const current = Array.isArray(latest) ? latest.find(s => String(s.id) === String(seat.id) &&
        String(s.store_id) === String(STORE_ID) && String(s.name) === seat.name) : null;
      if (!current) throw new Error('提交前无法确认座位状态');
      const reason = fixedReason(current, target.date);
      if (reason) { skipped.push(seat.name + ' 号：' + reason); continue; }
      const records = await schedule(seat, time.today);
      const conflicts = records.filter(r => overlaps(r, target));
      const existing = conflicts.find(r => owned(r, uid) && covers(r, target));
      if (existing) { success(target, seat, existing, true); return; }
      if (conflicts.some(r => owned(r, uid))) throw new Error('提交前发现本人部分时段的预约，请先人工确认');
      if (conflicts.length) { skipped.push(seat.name + ' 号：09:00–18:00 已有预约'); continue; }
      if (chinaTime().today !== time.today) throw new Error('执行期间日期已变化，请重新运行');

      // 先写 pending，再发送请求。即使脚本被系统结束，下次也会先核实这次提交。
      recordState(target, seat, 'pending');
      let reservation;
      try {
        reservation = await api('post', '/api/reservations/seats/' + seat.id, {
          store_id: STORE_ID, not_before: START, not_after: END, reserved_day: RESERVED_DAY,
        });
      } catch (error) {
        if (error.kind === 'business' || error.kind === 'auth') {
          save('{}', stateKey); // 服务器明确拒绝，没有创建预约。
          if (error.kind === 'business' && /固定|占用|冲突|座位.*(?:已被|不可预约)|时段.*(?:已被|不可预约)/.test(error.message)) {
            skipped.push(seat.name + ' 号：' + error.message);
            continue;
          }
          throw error;
        }
        // 超时、5xx 或异常响应可能发生在服务端已创建预约之后，不能换座继续提交。
        try {
          const after = await schedule(seat, time.today);
          const found = after.find(r => overlaps(r, target) && owned(r, uid) && covers(r, target));
          if (found) { success(target, seat, found, false); return; }
        } catch (_) { /* 保留 pending，等待下一次核实。 */ }
        throw new Error(seat.name + ' 号座位提交结果待确认：' + error.message + '。已停止后续预约，请在小程序核实');
      }
      if (!reservation || !reservation.id || !owned(reservation, uid) ||
          !overlaps(reservation, target) || !covers(reservation, target) ||
          !reservation.reservable || String(reservation.reservable.id) !== String(seat.id) ||
          String(reservation.reservable.store_id) !== String(STORE_ID)) {
        throw new Error('提交响应与目标预约不一致，已保留待确认记录，请在小程序核实');
      }
      success(target, seat, reservation, false);
      return;
    }
    notify('未能预约', skipped.join('\n') || '没有符合条件的候选座位');
  }

  (async function () {
    try {
      if (typeof $request !== 'undefined') capture();
      else await run();
    } catch (error) { notify('执行失败', error.message || '未知错误'); }
    finally {
      if (lockKey && lockValue && $persistentStore.read(lockKey) === lockValue) {
        $persistentStore.write('0', lockKey);
      }
      $done();
    }
  })();
})();
