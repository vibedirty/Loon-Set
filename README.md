## GitHub Raw 路径说明

Loon 订阅远程脚本或插件时，GitHub 文件建议使用 `raw.githubusercontent.com` 地址。

正确格式：

```text
https://raw.githubusercontent.com/<用户名>/<仓库名>/main/<文件路径>
```

例如本仓库的签到脚本合集：

```text
https://raw.githubusercontent.com/vibedirty/Loon-Set/main/script/signin.js
```

## V2EX 签到

脚本读取 Loon 持久化存储中的以下配置：

- `v2ex-cookie`：已登录 `v2ex.com` 的浏览器请求所携带的完整 Cookie，请从该域名获取，保留 `A2`、`PB3_SESSION` 等字段。
- `v2ex-user-agent`：获取上述 Cookie 时使用的浏览器 User-Agent。未配置时默认使用 macOS Chrome 151。

脚本直接访问 `https://v2ex.com/mission/daily`。页面显示 `每日登录奖励已领取` 时直接结束；否则提取页面中的领取链接及 `once` 参数，领取后检查已领取标记。如果领取响应没有该标记，会再次请求签到页验证结果，不会仅凭 HTTP 200 或 302 判断签到成功。

如果提示 HTTP 403，请先在与 Loon 使用相同网络出口的浏览器中打开 `https://v2ex.com/mission/daily`，确认页面能够访问且账号已登录，再更新上述配置。如果浏览器出现验证页面，先完成验证，并在更新 Cookie 时保留浏览器发送的 `cf_clearance`（如有，无需自行添加）。这些步骤不保证解除网站的访问限制，脚本本身无法执行浏览器验证。

脚本依据响应中的 `cf-mitigated: challenge` 或验证脚本标记识别 Cloudflare 验证页面；普通 403 不会直接归因为 Cookie 失效。参见 [Cloudflare 验证响应识别文档](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)。

本地回归测试：`node --test tests/v2ex-signin.test.cjs`。测试模拟 Loon 接口，不会发送实际签到请求。

## 麦肯自习自动预约

脚本：`script/zixi-reserve.js`，配套 Loon 插件：`plugin/zixi-reserve.lpx`。

将文件推送到 GitHub 后，在 Loon 中添加插件地址：

```text
https://raw.githubusercontent.com/vibedirty/Loon-Set/main/plugin/zixi-reserve.lpx
```

启用插件、MITM 及已安装并信任的 Loon 证书，然后打开麦肯自习微信小程序的预约页面。出现登录信息已更新通知后，即可由插件每天 06:00:01 执行。定时任务按设备时区运行，请将设备时区设为 `Asia/Shanghai`。插件已包含定时配置，无需再向 `script/signin.js` 添加任务。

令牌获取仅匹配 `/api/user` 用户信息接口，读取 Authorization 和 User-Agent 后通过 `$done({})` 原样放行请求，保存失败时同样放行。旧版误用 `$done()` 会直接断开被匹配的请求；遇到小程序请求失败时，先关闭 `麦肯自习登录信息` 规则，再更新插件和脚本缓存。已有令牌保存在 Loon 中，定时预约和自检仍可使用。

- 门店固定为麦肯自习室（嘉悦店），`store_id=12`；预约次日 `09:00–18:00`，`reserved_day=2`。
- 座位优先顺序为 `29、27、28、21、22、33、24`，使用座位列表返回的内部 ID 提交。
- 排除未开放、`is_bound` 非零或状态不明确的座位；同时检查 `user_times`，固定期限覆盖次日就跳过。其他日期的固定记录不影响次日筛选。
- 查询全部候选座位的预约时段，仅在完整的 `09:00–18:00` 无冲突时提交；结束于 `09:00` 或开始于 `18:00` 的预约不冲突。不会拆成多个座位或多个时段，也不会选择优先列表之外的座位。
- 发现本人在候选座位已有覆盖目标时段的预约时直接通知并结束；已有部分时段则停止，等待人工确认。提交前再次检查固定记录及预约冲突；服务器明确提示固定或冲突时尝试下一个候选座位。
- 成功、无座位、登录失效或其他失败均发送通知。令牌仅保存于 Loon 的 `zixi-token`，User-Agent 保存于 `zixi-user-agent`，脚本及仓库中不包含抓包凭据。令牌失效后重新打开小程序刷新。

为避免网络超时导致重复预约，脚本会在提交前保存待确认状态。响应异常时查询目标座位核实，无法确认就停止后续提交。再次执行也会先核实。只有在小程序确认未创建预约后，才可清除通知中指定的 `zixi-booking-账号ID-12` 持久化存储项后重试。已有成功记录但预约被取消时，重新执行会按服务器状态筛选。

06:00 前手动执行会停止。脚本使用北京时间计算次日，支持月底、年底跨日。Loon 的定时执行仍取决于设备与应用运行状态，请留意结果通知。

### 在手机上验证

更新脚本及插件后，在 Loon 手动触发 `麦肯自习预约自检`。该入口使用 `argument="check"`，只发送查询请求，不提交预约，也不改写预约结果或待确认记录。自检会验证当前登录、预约检查接口及七个候选座位的预约查询，通知逐一列出固定和冲突情况、已有本人预约，以及按当前状态会选择的座位。自检日期仍是运行当天的次日；自检完成不保证第二天的座位状态相同，也没有验证实际提交接口。

若要验证后台定时执行，可临时添加一条几分钟后触发的 cron，使用同一脚本并保留 `argument="check"`，在平时使用的锁屏及网络状态下等待通知。收到自检完成通知后删除临时测试任务。手动自检仅验证脚本运行和实时查询；定时自检验证当次定时触发，都不能保证次日一定有空座、令牌仍有效或网络始终正常。每日正式预约仍以预约成功通知中的日期、座位和预约编号为准，可在小程序复核。

本地回归测试：`node --test tests/zixi-reserve.test.cjs`。测试模拟 Loon 接口，不会发送实际预约请求。
