# Codex 自定义供应商 / API 配置指南（2026-09-16 调研）

## 0. 本机现状诊断（已实测）
- App 与 CLI **同源配置**：`%USERPROFILE%\.codex\config.toml` + `%USERPROFILE%\.codex\auth.json`（设置→配置页有"打开 config.toml"按钮实锤）。
- 当前 `model = "gpt-6-astra"`，`model_reasoning_effort = "xhigh"`（= 滑杆第 4 档"极高"），**无 `model_provider`、无 `[model_providers.*]` 块** → 走默认 OpenAI 官方通道。
- `auth.json` 中 `OPENAI_API_KEY` 仅 **10 字符** → 模拟 Key，发消息不可能得到真实响应（与用户所述一致）。
- 设置→**连接页只有 SSH，无供应商/API 配置 UI** → 自定义供应商**只能改配置文件**，没有图形入口。
- 个人资料菜单显示"已通过 API 密钥登录" = `auth.json` 存在 API Key 即判定 `auth_mode=ApiKey`（见 cc-switch #3034 讨论的同款行为）。

## 1. 标准做法：6 行 config.toml（官方机制）
编辑 `%USERPROFILE%\.codex\config.toml`，追加（示例为 OpenAI 兼容网关）：

```toml
model = "<网关给你的 Model ID>"
model_provider = "custom"

[model_providers.custom]
name = "My Gateway"
base_url = "https://<网关域名>/v1"
env_key = "MY_PROVIDER_API_KEY"
wire_api = "responses"
requires_openai_auth = false
```

字段口径（官方 Advanced Configuration）：`base_url` 为 API 根（OpenAI 兼容网关以 `/v1` 结尾、无尾斜杠）；
`env_key` 是**环境变量名**（不是 Key 本身）；`wire_api` 目前仅支持 `"responses"`；第三方一律 `requires_openai_auth = false`。
保留 ID `openai/ollama/lmstudio` 不可用作自定义名。项目级 `.codex/config.toml` **不能**覆盖 provider/auth 类键，必须写用户级。

然后设环境变量（PowerShell，用户级，App 重启后生效）：

```powershell
[Environment]::SetEnvironmentVariable("MY_PROVIDER_API_KEY", "<真实Key>", "User")
```

改完**重启 Codex App**（配置为启动时加载）。

## 2. 两层认证别混用（重要）
- `auth.json` = 登录态（菜单显示"已通过 API 密钥登录"/ChatGPT 登录就看它）。
- 自定义供应商 Key **走 `env_key` 环境变量，不要塞进 `auth.json`**，否则 App 会把你判定为 ApiKey 登录态，挤掉 ChatGPT 登录（含 Fast/远程等依赖登录态的能力）。
- 想要"ChatGPT 登录 + 自定义供应商出流量"：`auth.json` 保持 ChatGPT 登录态，`config.toml` 另配 provider + `env_key`，两者正交。

## 3. 切流/多栈
- 临时单次：`codex --config model_provider=<id> --model <model-id> "..."`（CLI）。
- 多环境：`$CODEX_HOME/*.config.toml` profile 文件 + `codex --profile <name>`；provider 定义仍放主 `config.toml`。
- 排错对照：401/403=Key 错或 env 对不上；404=base_url 缺 `/v1`；model not found=Model ID 照抄网关；改了不生效=改错层/没重启。

## 4. 对本任务的影响
- 真实 turn（含通知面 Alt+T、审批流 UI 的物化）**必须先配好真实供应商**，否则发消息无响应，UIA 捕获不到任何东西。
- 模型名注意：第三方网关的 Model ID 与 `gpt-6-astra` 不同，需从网关处复制；滑杆 effort 档（轻度/标准/深度/极高/Ultra）可用性因模型而异（配置页"已选择 5 个"即控制显示档位）。

## 5. 实测血泪（2026-09-16 真机验证）
- `model_provider` 必须写在顶层：append 到文件尾 `[projects]` 表之后会变成野 key，静默回落 openai（症状：401/`provider: openai`）。正确位置：`model = …` 下一行。
- 模型：`deepseek-v4-flash-vision-exp` 推理端 404（path 级）；`deepseek-v4-flash` 可用。RabbitAPI 仅 responses wire（chat/completions 同 404），0.154 已移除 `wire_api="chat"`。
- flash 不支持原生 web_search：设置→配置→网页搜索→已禁用（= `web_search = "disabled"`），否则整 turn 报 invalid_request_error。
- E2E 金标准：CLI `provider: rabbit` + 返回 `ROUTE_OK`（约 4k tokens/次，含一次重连抖动属正常）。
- 桌面端 401 复盘：野 key 回落所致，不是前端覆盖 provider；配置正确后桌面前后端一致。

## 来源
- 官方 Advanced Configuration（CODEX_HOME/config.toml/auth.json 位置、model_providers 字段、Azure/Bedrock 内建 provider）：https://developers.openai.com/codex/config-advanced
- cc-switch #3034（auth.json 决定 Desktop auth_mode=ApiKey 的行为实测）：https://github.com/farion1231/cc-switch/issues/3034
- 第三方 2026 配置指南（6 行块、保留 ID、profiles/--config 用法）：https://docs.bettertoken.ai/en/faq/codex/config-toml 、https://ofox.ai/blog/codex-cli-custom-model-providers-byo-setup/ 、https://www.morphllm.com/codex-provider-configuration
- Azure 官方排错对照：https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/codex
