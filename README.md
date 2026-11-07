# BananaCLI + BananaGUI

[English](README.en.md) | 中文

终端里的多 provider AI agent，附带一个本地图形界面。能读写文件、跑命令、搜代码、上网查资料；多轮对话自动保存，随时切换历史会话。

```text
   ____                  _
  | __ )  __ _ _ __   __ _| |__   __ _ _ __
  |  _ \ / _` | '_ \ / _` | '_ \ / _` | '_ \
  | |_) | (_| | | | | (_| | |_) | (_| | | | |
  |____/ \__,_|_| |_|\__,_|_.__/ \__,_|_| |_|

          BananaCLI v0.8.5 · 终端 + 图形界面
```

- **无前端框架依赖**：CLI 只用 Node 内置模块；运行时依赖 `ws`（GUI/终端 WebSocket）和 `@lydell/node-pty`（预编译原生模块）。
- **手写 agent 循环**：tool-calling、工具注册、权限控制、上下文压缩都在仓库里，可读可改。
- **多 provider**：OpenAI 兼容协议（DeepSeek / Moonshot / Qwen / Gemini / OpenRouter / Ollama …）和 Anthropic 原生协议，SSE 流式输出。
- **会话持久化**：每轮自动落盘到 `~/.banana/sessions/`，支持 `/list` `/use` 切换。
- **Plan / Build 双模式**：Plan 只读调研并生成待批准计划；批准后切到 Build 按清单执行。
- **项目规则**：`AGENT.md` 记录环境、路径、命令和限制，Agent 直接采用，不重复探测。
- **改前看 diff、改后可回滚**：写文件前展示具体增删行，`/undo` 还原上一轮文件改动。
- **任务清单**：`todo_write` / `todo_read`，清单随会话保存，GUI 有任务栏和计划卡。
- **多模态与扩展**：`/image` 附加截图，`.banana/tools/` 放脚本注册自定义工具，成本按 token 估算。
- **UI 设计约束**：统一设计令牌 + `npm run ui:check` 扫描渐变、玻璃拟态、大圆角、紫蓝 AI 配色和 emoji。

## 图形界面

同一个内核，两种界面。CLI 加 `--ui` 就能开图形界面：

```bash
banana --ui                 # 打开图形界面
banana --ui --no-open       # 启动服务但不自动开浏览器
npm install -g @vincentbanana/banana-gui && banana-gui   # 或装独立 GUI 包
```

图形界面与终端共用同一套内核（agent 循环、工具、权限、斜杠命令），配置也共用 `~/.banana/config.json`。

界面提供：会话管理与导出（Markdown / JSON）、`/` 命令面板、`@` 文件补全、工作区文件面板、工具输出详情、Plan/Build 切换、任务栏、三态主题、API Key 和搜索设置、内嵌终端。

窗口和样式遵守同一套规则：黑白暖中性 + 香蕉黄 `#dcde8d`，自绘 SVG 图标，不用渐变、霓虹、玻璃拟态和 emoji。

## 平台支持

| 平台 | 状态 | 说明 |
| --- | --- | --- |
| Windows 10/11 | ✅ | PowerShell / Windows Terminal；`shell` 工具走 `cmd.exe`，超时用 `taskkill /T` 杀进程树 |
| macOS 12+ | ✅ | `shell` 走 `/bin/sh`，超时按进程组杀 |
| Linux (glibc/musl) | ✅ | 同上；终端使用 `@lydell/node-pty` 预编译模块 |
| WSL | ✅ | 装在 WSL 里就是 Linux 行为（推荐，脚本兼容性最好） |

要求：**Node.js >= 20**（推荐 22 LTS 或 24）。`npm install -g @vincentbanana/bananacli` 会创建 `banana` 命令；GUI 包会创建 `banana-gui`。

平台差异只在这几处，都已处理：

- 路径全部用 `node:path`，工作区沙箱按真实路径校验（软链/junction 也不例外）
- `shell` 命令在 Windows 用 `cmd.exe`、Unix 用 `/bin/sh`；中断/超时都会清理子进程
- 配置文件在 `~/.banana/`（Windows 默认优先 `D:\BananaCLI-data`，不可写时回退到家目录）
- **CRLF 兼容**：Windows 仓库常见的 `\r\n` 文件，模型用 `\n` 写 `old_string` 也能匹配，替换后保持原文件行尾

## 快速开始

```bash
# 安装（包名是 @vincentbanana/bananacli，命令是 banana）
npm install -g @vincentbanana/bananacli

# 第一次启动会进入配置向导（选服务、贴 key、测连接）
banana

# 也可以用环境变量提前给 key
$env:DEEPSEEK_API_KEY = "sk-..."        # PowerShell
export ANTHROPIC_API_KEY="sk-ant-..."   # macOS / Linux

# 交互式 / 单轮执行
banana
banana "看下 src/index.ts 是干什么的"
banana -c                               # 继续上次对话
```

从源码运行：

```bash
git clone https://github.com/Vincentwen12/BananaGUI.git
cd BananaGUI
npm install        # 会触发 prepare -> 构建 dist
npm start          # 等价于 node src/index.ts
npm test
npm run build
npm run ui:check   # UI 反 AI 味扫描
```

## 配置向导

第一次启动（无 `~/.banana/config.json` 且检测不到 key）会自动进入向导，也可以用 `banana --setup` 随时重跑：

1. **选服务**：OpenAI / Anthropic / DeepSeek / Moonshot / Qwen / Gemini / OpenRouter / Ollama，或自定义网关、vLLM、LiteLLM。
2. **填连接信息**：确认或修改 Base URL、模型名。
3. **填 API key**：输入显示为 `*`，不会留在终端历史里；已有环境变量或已保存的 key 可以直接沿用。
4. **选权限**：shell 命令、写文件是否每次确认（默认都要）。
5. **测连接**：真实发一次最小请求；失败会显示上游错误并允许重试。
6. 配置写入 `~/.banana/config.json`，然后直接进入对话。

> key 默认以明文存在配置文件里。更稳妥的做法是：向导里沿用环境变量（`DEEPSEEK_API_KEY` 等），配置文件里只留 `apiKeyEnv` 引用。

非交互环境也能配置：把答案按顺序逐行喂给 stdin。

```bash
printf '3\nn\nsk-xxxx\nn\nn\n' | banana --setup
```

## 命令行

```text
banana                       进入交互式多轮对话
banana "帮我跑一下测试"      单轮任务模式（不进入对话）

  -p, --provider <名称>  openai / anthropic / deepseek / moonshot / qwen / gemini / openrouter / ollama
  -m, --model <模型名>   覆盖模型名
      --base-url <url>  覆盖 base URL（接自建网关、vLLM、LiteLLM 等）
      --api-key <key>   直接给 key（不推荐，优先用环境变量）
  -s, --session <ref>   载入指定对话（序号 / id 前缀 / 标题关键词）
  -c, --continue        继续上一次对话
      --list            列出历史对话后退出
      --cwd <目录>      指定工作区（agent 能访问的目录范围）
      --allow-outside   允许工具访问工作区之外的路径
      --yolo            跳过所有确认（仅本次运行；非交互模式放行 shell/write 需要它）
      --trust-project   信任当前项目的 .banana 配置/插件/AGENT.md
      --system <文本>   覆盖系统提示词
      --no-tools        不给 agent 任何工具（纯对话）
      --no-reasoning    不显示推理模型的思考过程
      --setup           运行/重跑配置向导
      --ui              启动图形界面（本地服务 + 浏览器）
      --port <端口>     指定 GUI 端口（默认随机）
      --no-open         启动 GUI 时不自动打开浏览器
```

> 非交互模式（管道、CI、`--one-shot`）下，`ask` 权限默认**拒绝**，不会静默执行 shell 或写文件。需要放行时显式加 `--yolo`，或把对应权限设为 `allow`。

## 交互命令

| 命令 | 说明 |
| --- | --- |
| `/new [标题]` | 开新对话（当前对话已自动保存） |
| `/list` | 历史对话列表 |
| `/use <序号\|id前缀\|标题>` | 切换对话 |
| `/rename` `/delete` `/clear` | 改名 / 删除 / 清空上下文 |
| `/undo` | 回滚上一轮的文件修改（恢复/删除） |
| `/session` `/history` | 当前对话信息 / 消息列表 |
| `/provider [名]` `/model [名]` | 切换供应商 / 模型 |
| `/setup` | 会话内重新配置 provider / 模型 / key |
| `/image <路径\|clear>` | 给下一条消息附加图片（png/jpg/gif/webp） |
| `/tools [名\|all]` | 查看或启停工具（含插件工具） |
| `/perm <shell\|write\|network> <ask\|allow\|deny>` | 权限策略 |
| `/compact` | 手动压缩上下文 |
| `/cwd [路径]` | 查看/切换工作目录 |
| `/system [文本]` | 查看/替换系统提示词 |
| `/env` | 打印环境询问模板，写进 `AGENT.md` 可避免重复探测 |
| `/verify` | 运行配置的验收命令（默认 `npm test` + `npm run build`），结果写入会话 |
| `/phase [next\|阶段名]` | 查看/切换已批准计划的当前阶段；依赖未完成会拒绝 |
| `/review` | 让独立审查 agent 检查最近交付（不修改文件） |
| `/prefer [文本\|clear]` | 查看/追加用户偏好，注入系统提示词 |
| `/template [名称]` | 查看任务模板：步骤、验收清单、常见坑 |
| `/feedback <文本>` | 记录一条人工反馈到 `~/.banana/feedback.jsonl` |
| `/cls` `/exit` | 清屏 / 保存退出 |

快捷键：`Ctrl+C` 中断当前请求（连按两次退出），`↑` 翻历史输入，输入末尾加 `\` 续行，`@` 后按 `Tab` 补全项目文件。

## Plan / Build

- **Plan**：只读工具（读文件、列目录、glob、grep、搜索、todo），先调研再生成 3–7 项计划。
- **Build**：允许写文件和执行命令。
- Plan 模式下 `todo_write` 生成的条目全部是 `pending`；批准后切到 Build，任务从 pending 开始执行。
- 取消计划会清空任务清单；手动切到 Build 会丢弃待批准计划，避免旧计划继续注入下一轮。

## 项目规则：AGENT.md

在项目根目录（或 `.banana/AGENT.md`）放一份 `AGENT.md`，写下已经确认的环境、路径、命令和限制。Agent 会直接采用这些事实，不再跑 `command -v` / `find` / `ls` 去重复验证。

```text
开始前请确认（可只填你知道的，不确定写“不确定”）：
1 系统/Shell：
2 语言与版本：
3 包管理器：
4 关键工具（git/jq/rg/docker/…）：
5 项目路径：
6 启动/测试/构建命令：
7 已知限制（无 sudo/需代理/无 GPU 等）：
```

可以直接运行 `/env` 打印这份模板。`AGENT.md` 只作为运行时输入，不会写进 `config.json`；切换工作区时会重新读取。示例见仓库里的 `AGENT.md.example`。

## 记忆与偏好

- `memory_write` / `memory_read` 维护两类结构化记忆：
  - 已确认事实：内容 + 来源（用户/文档/实测/推断/猜测）+ 置信度。
  - 未验证项：内容 + 原因 + 验证方法。
- 事实和未验证项随会话保存，并自动注入后续每一轮；换模型不丢。
- `/prefer` 把反复出现的纠正沉淀成用户偏好，下一轮注入系统提示词。
- GUI 的 Review 面板新增「验证」页签：计划状态、任务完成数、事实数量、未验证项、下一步，以及最近一次 `/verify` 的测试/构建结果。

## 项目信任与安全

从不可信仓库打开项目时，以下文件会影响 agent 行为，因此默认**不加载**：

- `.banana/config.json`
- `.banana/tools/*.{mjs,js,ts}`
- `AGENT.md` / `.banana/AGENT.md`

首次遇到时会提示信任；信任后把指纹写入全局配置。文件内容变化后指纹失效，需要重新信任。

- CLI：交互式会询问；非交互式跳过并提示。也可以显式加 `--trust-project`。
- GUI：启动时弹窗询问「信任并加载」。
- 即使已信任，项目配置也只允许白名单键：`maxSteps`、`maxContextChars`、`showReasoning`、`disabledPlugins`、`search` 的非密钥字段。
- `providers`、`permissions`、`allowOutsideWorkspace`、`systemPrompt`、`sessionDir` 永远只来自全局配置。
- 插件默认审批是 `shell`（默认 `ask`），不再静默放行；项目插件只有信任后才加载。

其他安全默认值：

- API Key 存在 `~/.banana/config.json`，不要提交到仓库；`.banana/` 已在 `.gitignore` 中。
- 非交互模式默认拒绝 `ask` 权限，需要 `--yolo` 显式放行。
- 工作区路径按真实路径校验，软链不能逃出工作区。

## 安全网：diff 预览与撤销

- 写文件 / 改文件需要确认时，先显示 `+新增 / -删除` 的具体行（最多 40 行）。
- 每次工具写入前，旧内容快照到 `~/.banana/backups/<sessionId>/`，每轮一条记录（最多保留 30 轮）。
- `/undo` 回滚最近一轮：被改的文件恢复原内容，新建的文件直接删除。
- 超过 4MB 的文件不会生成备份；`/undo` 会明确列出「未备份，无法恢复」，不会误删文件。
- 对话记录不会回滚；`shell` 命令和插件工具的副作用不在撤销范围内。

## 图片输入

```text
/image screenshot.png
看看这个报错
```

图片编码成 data URL 随下一条消息发送，OpenAI 兼容协议和 Anthropic 协议都支持；单张上限 4MB，支持 png / jpg / gif / webp。`/image` 不带参数查看待发送列表，`/image clear` 清空。

## 插件工具

在 `~/.banana/tools/`（全局）或 `<项目>/.banana/tools/`（项目，需信任）放一个 `.mjs`（也支持 `.js` / `.ts`），默认导出工具定义即可：

```js
// ~/.banana/tools/http_status.mjs
export default {
  name: 'http_status',
  description: '检查一个 URL 的 HTTP 状态码',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: '目标地址' } },
    required: ['url'],
    additionalProperties: false,
  },
  approval: 'network', // never | write | shell | network；不写默认 shell
  async run(input) {
    const response = await fetch(String(input.url), { method: 'HEAD' });
    return { ok: response.ok, content: `${input.url} -> ${response.status}` };
  },
};
```

名称冲突、缺少 `run`、字段不合法都会在启动时提示并跳过。插件以当前 Node 进程权限运行，等同你自己写的代码，只放可信脚本。

## 联网搜索

- 默认 `auto`：有 Tavily / Brave key 就用 API，否则合并 Bing / DuckDuckGo 免费源。
- 也可以在 GUI 设置 → 联网搜索里填 key；key 不会通过 `/api/info` 回传。
- `depth=deep` 或开启「深度搜索」会额外读取前几页正文；默认关闭。
- 搜索语言默认英文/技术源优先，可切 `auto` / `zh`。

## 成本估算与预算

按内置价目表（美元 / 百万 token）估算每轮和整会话花费，未知模型不显示。价格会变，可在 provider 配置里覆盖：

```json
{ "pricing": { "input": 0.27, "output": 1.1 } }
```

可以在全局配置里设单轮预算，超出后在下一次模型调用前停止：

```json
{ "budget": { "tokens": 200000, "minutes": 30 } }
```

## Trace

每轮对话会在 `~/.banana/traces/<sessionId>-<turnId>.jsonl` 留一份 trace，记录工具调用、耗时、重试、压缩和结束原因。出问题可以按 session / turn 回放。

## 评测与失败案例

```bash
npm run eval   # 契约评测：提示词章节、知识包、UI 扫描、多行、grep、计划字段
```

失败案例记录在 `docs/failures.md`，每次翻车补场景、根因、修正和对应测试。

## 配置

全局 `~/.banana/config.json`；项目级 `<工作区>/.banana/config.json` 需要显式信任，且只应用白名单键。

```json
{
  "current": "deepseek",
  "providers": {
    "deepseek": {
      "protocol": "openai",
      "baseUrl": "https://api.deepseek.com/v1",
      "model": "deepseek-chat",
      "apiKeyEnv": "DEEPSEEK_API_KEY"
    },
    "my-gateway": {
      "protocol": "openai",
      "baseUrl": "https://llm.internal/v1",
      "model": "qwen2.5-coder",
      "apiKeyEnv": "INTERNAL_KEY",
      "pricing": { "input": 0.4, "output": 1.2 }
    }
  },
  "permissions": { "shell": "ask", "write": "ask", "network": "allow" },
  "maxSteps": 40,
  "maxContextChars": 160000,
  "allowOutsideWorkspace": false,
  "showReasoning": true,
  "trustedProjects": {},
  "budget": { "tokens": 200000, "minutes": 30 },
  "verifyCommands": ["npm test", "npm run build"]
}
```

Anthropic 协议默认给 `system` 和工具定义打 `cache_control: ephemeral`（prompt caching）；网关不认这个字段时，在对应 provider 里设 `"promptCaching": false`。

环境变量：`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `DASHSCOPE_API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY`；搜索可选 `TAVILY_API_KEY` 或 `BRAVE_API_KEY`；临时覆盖用 `BANANA_PROVIDER` / `BANANA_MODEL` / `BANANA_BASE_URL` / `BANANA_SHOW_REASONING` / `BANANA_HOME` / `BANANA_CONFIG`。

`protocol` 只有两个值：`openai`（OpenAI 兼容）和 `anthropic`（Claude 原生）。

## 代码结构

```text
src/                  CLI 内核
  index.ts            入口：参数解析、装配、项目信任提示
  config/
    config.ts         配置加载/合并、环境变量覆盖、系统提示词、AGENT.md
    project-trust.ts  项目级文件指纹与信任检查
  providers/          OpenAI / Anthropic 协议、SSE、定价
  agent/              agent 循环、上下文压缩
  tools/              文件 / 命令 / 网络 / 任务清单 / 插件
  server/             GUI 本地服务、终端 PTY
  session/            会话落盘、备份与 /undo
  cli/                REPL、slash 命令、补全、配置向导、终端输出
  ui/                 浏览器界面（HTML/CSS/JS，无前端框架）
gui/                  独立 GUI 包（启动器、Electron 桌面壳、同步的 ui/）
docs/design/          UI 原则、令牌、组件、状态、无障碍、自检清单、参考卡
docs/failures.md      失败案例库
docs/prompt-versions.md  提示词与知识包版本记录
scripts/              构建、同步、UI 扫描、发布
test/                 mock provider 与全量测试
```

## 开发

```bash
npm run typecheck   # tsc --noEmit
npm test            # 类型检查 + UI 扫描 + 全量测试
npm run dev         # node --watch
npm run build       # 编译到 dist/（发布用）
npm run ui:check    # 只跑 UI 反 AI 味扫描
npm run eval        # 契约评测（提示词/知识包/关键行为）
npm run ab          # 两组提示词后缀的契约 A/B
npm run gui:sync    # src/ui -> gui/ui
npm run gui:check   # 校验两套 UI 一致
```

注释约定：

- 代码注释统一使用中文叙述。
- API、协议、命令、文件路径和专有名词保持英文，例如 `OpenAI`、`SSE`、`scanner-allow`。
- `// scanner-allow: terminal-palette` 与 `// scanner-allow-end` 是 UI 扫描器标记，必须保持英文。
- UI 交付前跑 `npm run ui:check`，并阅读 `docs/design/checklist.md`。

## 已知边界

- 模型名和 provider baseUrl 是内置默认值，不同服务可能需要 `/model` 或配置改一下。
- 上下文压缩按字符数估算 token，超长会话建议调小 `maxContextChars`。
- `web_search` 在没有 Tavily/Brave key 时合并 Bing / DuckDuckGo；两个源都不可用时明确报错，不会假装成功。
- 图片以 data URL 存进会话 JSON，多张大图会让会话文件变大（单张上限 4MB）。
- `/undo` 只覆盖 `write_file` / `edit_file`；`shell` 命令和插件工具的副作用无法回滚。
- 插件以当前进程权限运行，只应放可信脚本；项目插件必须显式信任。

## 许可证

MIT。见 [LICENSE](LICENSE)。
