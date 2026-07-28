# @file-type loon-remote-script
# update at 2026-07-28 10:35
# Loon Remote Script subscription for sign-in tasks
# Add this URL in Loon -> Remote Script

cron "0 20 9 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/glados_checkin.js, timeout=60, tag=glados签到, enable=true
cron "10 20 9 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/anyrouter.js, timeout=60, tag=anyrouter签到, enable=true
cron "20 20 9 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/li7store.js, timeout=60, tag=7li7li签到, enable=true
cron "30 20 9 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/v2ex-signin.js, timeout=60, tag=v2ex签到, enable=true
cron "40 20 9 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/ArkApi.js, timeout=60, tag=ArkApi签到, enable=true
cron "58 23 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/pdd_coupon_countdown.js, timeout=10, tag=拼夕夕券倒计时, enable=true
