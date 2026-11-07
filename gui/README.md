# @vincentbanana/banana-gui

Banana 的图形界面：本地起一个服务，用浏览器打开。黑白主题、只用自绘 SVG 图标、无 emoji、无第三方 UI 依赖。

## 安装

```bash
npm install -g @vincentbanana/banana-gui
```

装完有两种启动方式，**同一份安装，不用额外装东西**：

```bash
banana-gui              # 浏览器版：启动后自动开浏览器，最轻
banana-gui --desktop    # 桌面版：直接开独立窗口
banana-gui-desktop      # 同上，等价的独立命令
```

electron 是可选依赖（`optionalDependencies`），npm 安装时会自动带上；万一某个平台装不上，`banana-gui` 仍然照常工作，只是 `--desktop` 会提示你用浏览器版。

> **关于 electron 的下载**：新版 electron 的二进制不在 `npm install` 时下载，而是**首次运行时**才拉取（一百多 MB），默认源是 GitHub，国内基本连不上。`banana-gui --desktop` 会自动改用国内镜像下载，你不用加任何参数。
>
> 想换源就设环境变量，例如：
>
> ```bash
> set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> banana-gui --desktop
> ```

首次启动会进配置向导（选 provider、贴 API key、选权限、测连接），配置与 CLI 共用 `~/.banana/config.json`。

## 用法

```bash
banana-gui                      # 随机端口，自动开浏览器
banana-gui --port 8080          # 指定端口
banana-gui --cwd D:/project     # 指定工作区
banana-gui --provider deepseek --model deepseek-chat
```

## 特性

- **和 CLI 同一套内核**：agent 循环、工具、权限、斜杠命令全部来自 `@vincentbanana/bananacli`，两边行为完全一致
- 左侧会话列表：新建 / 切换 / 重命名 / 导出（Markdown、JSON）/ 删除
- 输入 `/` 调出命令面板（`/help` 看全部），输入 `@` 补全项目文件
- 流式回复、工具调用实时状态，点工具行可展开完整输出
- 危险操作弹窗确认，写文件前给 diff
- 一键撤销上一轮文件改动
- 右侧项目文件面板：浏览目录、预览文件、一键插入引用
- 粘贴或拖拽图片，随消息一起发送
- 模型、权限、API Key、工作区、系统提示词在设置里改，改完立刻生效
- 权限设置写清了每种模式的含义和风险，新手也不会懵
- 三态主题：跟随系统 / 浅色 / 深色，纯黑白无渐变
- 没配 API Key 也能打开界面，照着引导填完即可用

## 两种方式对比

| | 启动命令 | 需要什么 | 说明 |
| --- | --- | --- | --- |
| 浏览器版 | `banana-gui` | 任何装了 Node 20+ 的系统 | 启动后自动打开浏览器，几十 MB |
| 桌面版 | `banana-gui --desktop` | 同一个 npm 包 | 独立窗口，约 200MB（内含 electron） |

两者用的是同一套 agent 内核和同一份界面资源，功能完全一致，只是外壳不同。

## 打包成安装包（可选）

想出 `.exe` / `.dmg` / `AppImage` 的话，在源码仓库里构建：

```bash
git clone <这个仓库>
cd banana-gui
npm install          # 装 electron-builder
npm run dist:win     # 也支持 dist:mac / dist:linux
```

产物在 `gui/release/`。

## 配置

首次启动会提示配置向导。GUI 与 CLI 共用 `~/.banana/config.json`：

- 也可以直接在界面的设置面板里填 API Key、切换模型和权限
- 环境变量优先级更高，例如 `DEEPSEEK_API_KEY`
- API Key 只写在你自己的机器上，不会进代码仓库

## 安全

服务只监听 `127.0.0.1`，所有接口都需要 URL 里的 token；无 token 访问一律 404。URL 等同于登录凭证，不要分享。

## 依赖

运行时依赖只有 `@vincentbanana/bananacli`（agent 内核），界面资源全部在本包里，零第三方前端依赖。