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

## 文件类型识别规范

不得仅根据文件扩展名判断文件类型。修改文件前，必须优先读取文件顶部的 `@file-type` 声明。

### JavaScript 脚本

JavaScript 文件顶部使用以下格式：

```js
// @file-type javascript
// update at 2026-06-19 11:30
```

JavaScript 文件必须使用 `//` 或 `/* ... */` 注释，不得使用 `#` 注释。

### Loon Remote Script 配置

Loon Remote Script 配置文件顶部使用以下格式：

```text
# @file-type loon-remote-script
# update at 2026-06-19 11:30
```

此类文件即使使用 `.js` 后缀，实际内容仍是 Loon 配置语法，必须使用 `#` 注释。

### 文件类型判断优先级

1. 优先读取文件顶部的 `@file-type` 声明。
2. 没有类型声明时，根据文件内容判断。
3. 包含 `cron`、`script-path` 等顶层配置语法时，视为 Loon Remote Script 配置。
4. 包含 `const`、`let`、`function`、`$httpClient` 等 JavaScript 语法时，视为 JavaScript。
5. 无法确定文件类型时不得修改，必须先询问用户。

### 当前 JavaScript 后缀文件类型

- `script/signin.js`：`loon-remote-script`
- `script/v2ex-signin.js`：`javascript`
- `script/anyrouter.js`：`javascript`
- `script/glados_checkin.js`：`javascript`
- `script/li7store.js`：`javascript`
- `script/tandy_vase_inject.js`：`javascript`

## 更新时间注释规范

AI 每次修改 JavaScript 脚本或 Loon Remote Script 配置后，必须在被修改文件的顶部维护一条更新时间注释。

- 使用 `Asia/Shanghai` 时区的实际完成时间。
- 格式固定为 `YYYY-MM-DD HH:mm`，不包含秒。
- JavaScript 使用 `// update at YYYY-MM-DD HH:mm`。
- Loon Remote Script 配置使用 `# update at YYYY-MM-DD HH:mm`。
- 如果已有更新时间注释，只更新时间，不得重复新增。
- 更新时间注释应紧跟在 `@file-type` 声明之后。
- 一个文件只能存在一条 `update at` 更新时间注释。
