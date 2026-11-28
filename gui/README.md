# @vincentbanana/banana-gui

Banana 的图形界面：本地服务 + SolidJS Web UI。内置终端、浏览器、文件预览、队列和多模型切换。

- GitHub：<https://github.com/Vincentwen12/BananaGUI>
- 问题反馈：<https://github.com/Vincentwen12/BananaGUI/issues>
- 仓库说明：<https://github.com/Vincentwen12/BananaGUI#readme>

## 安装

```bash
npm install -g @vincentbanana/banana-gui
```

启动方式：

```bash
banana-gui              # 浏览器版：启动本地服务并打开浏览器
banana-gui-desktop      # 桌面版：独立窗口，内置完整网页视图
```

浏览器版最轻；桌面版内置 Electron，可播放网页视频、登录站点。两者共用同一份 agent 内核和配置。

## 用法

```bash
banana-gui                      # 随机端口，自动开浏览器
banana-gui --port 8080          # 指定端口
banana-gui --no-open            # 不自动打开浏览器
banana-gui-desktop              # 桌面窗口
```

配置与 CLI 共用 `~/.banana/config.json`；也可以直接在界面设置里填 API Key。

## 特性

- **和 CLI 同一套内核**：agent 循环、工具、权限、斜杠命令全部来自 `@vincentbanana/bananacli`
- **会话管理**：新建 / 切换 / 重命名 / 导入 / 导出 JSON 与 Markdown / 删除
- **流式对话**：思考过程可折叠、工具调用状态与输出、失败自动展开
- **自动跟随**：流式输出贴底；上滚后停止跟随，可一键回到最新
- **队列系统**：生成中继续输入会排队，服务端顺序执行，刷新页面不丢
- **模型选择**：动态读取官方模型列表，按 provider 分组；未配 Key 的 provider 不显示
- **官方搜索**：OpenAI / Claude / Gemini / Qwen / DeepSeek / Kimi / OpenRouter / Ollama，失败降级 Brave / Tavily
- **内置终端**：CMD / PowerShell 5 / PowerShell 7 / WSL / Git Bash，行编辑与 UTF-8
- **内置浏览器**：前进 / 后退、地址栏、GET 表单、轻量模式；桌面版使用原生网页视图
- **文件管理器**：目录树 + 分栏预览，文本自动换行，支持图片 / 音频 / 视频
- **附件**：图片拖入或粘贴，文本 / 代码文件导入后随消息发送
- **三态主题**：跟随系统 / 浅色 / 深色，中英双语
- **无第三方 UI 依赖**：SolidJS + 自绘 SVG，无 emoji、无紫蓝 AI 配色

## 安全

服务只监听 `127.0.0.1`，接口需要 URL 中的 token。URL 等同于登录凭证，不要分享。

## 相关

- CLI：<https://www.npmjs.com/package/@vincentbanana/bananacli>
- 源码与文档：<https://github.com/Vincentwen12/BananaGUI>
