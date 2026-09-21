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
