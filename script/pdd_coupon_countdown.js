// @file-type javascript
// update at 2026-07-23 11:39

(function () {
  function getCountdownSubtitle(now) {
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      0
    );
    const totalSeconds = Math.max(
      0,
      Math.ceil((nextMidnight.getTime() - now.getTime()) / 1000)
    );
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `倒计时${minutes}分${seconds}秒`;
  }

  const subtitle = getCountdownSubtitle(new Date());
  console.log(`[拼夕夕券] ${subtitle}`);
  $notification.post('拼夕夕券', subtitle, '');
  $done();
})();
