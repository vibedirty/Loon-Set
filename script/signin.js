# @file-type loon-remote-script
# update at 2026-07-23 11:39
# Loon Remote Script subscription for sign-in tasks
# Add this URL in Loon -> Remote Script

cron "20 9 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/glados_checkin.js, timeout=60, tag=glados签到, enable=true
cron "21 9 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/anyrouter.js, timeout=60, tag=anyrouter签到, enable=true
cron "22 9 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/li7store.js, timeout=60, tag=7li7li签到, enable=true
cron "23 9 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/v2ex-signin.js, timeout=60, tag=v2ex签到, enable=true
cron "58 23 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/pdd_coupon_countdown.js, timeout=10, tag=拼夕夕券倒计时, enable=true
