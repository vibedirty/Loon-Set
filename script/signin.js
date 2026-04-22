# Loon Remote Script subscription for sign-in tasks
# Add this URL in Loon -> Remote Script

cron "20 9 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/glados_checkin.js, timeout=60, tag=glados签到, enable=true
cron "21 9 * * *" script-path=https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/anyrouter.js, timeout=60, tag=anyrouter签到, enable=true
