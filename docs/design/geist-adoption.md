# 设计基准：ChatGPT 布局 + DeepSeek 细节

BananaUI 从零重写为扁平化对话界面，只取两家产品的**结构与交互**，不复制它们的品牌视觉。

## 结构（ChatGPT）

| 区域 | 规则 |
|---|---|
| 左侧栏 | 264px，可折叠；新会话、搜索、插件、工作区分组、会话行 |
| 对话列 | 最大 768px 居中；消息流独立滚动 |
| 输入框 | 底部悬浮，单层边框，圆角 12px |
| 右栏 | 360px 终端/文件/任务/验证/信息，桌面并排、窄屏覆盖 |
| 顶栏 | 52px，标题 + 模型 + 连接态 + 功能按钮 |

## 对话细节（DeepSeek）

- 用户消息右对齐浅灰块；助手消息全宽、无气泡、带叶子标记。
- 思考过程是折叠条：运行中展开并显示最新段落，完成后自动收起显示首行摘要。
- 工具调用整组折叠，单行显示状态点、工具名、摘要、耗时。
- 状态用文字与细边框表达，不用大色块。

## 扁平化规则

1. 禁止装饰性渐变、玻璃拟态、霓虹发光、多层重阴影。
2. 层级只靠 `--bg` / `--side` / `--panel-2` 与 1px 边框。
3. 矩形圆角 ≤ 10px，胶囊/开关/头像可用 999px / 50%。
4. 主按钮黑白实色；次按钮透明或浅灰；香蕉黄只作品牌与聚焦提示。
5. 动效只用 150 / 200 / 250ms，只改变 `transform`、`opacity`、颜色。

## 令牌映射

| CSS 变量 | 用途 |
|---|---|
| `--bg` / `--side` / `--panel` | 主背景 / 侧栏 / 弹层 |
| `--panel-2` / `--hover` / `--active` | 次级表面与交互态 |
| `--line` / `--line-strong` | 分隔与控件边框 |
| `--text` / `--text-2` / `--text-3` | 三级文字 |
| `--accent` / `--on-accent` | 主按钮 |
| `--brand` / `--link` / `--focus` | 品牌、链接、聚焦 |
| `--radius-sm..xl` | 4 / 6 / 8 / 10 |
| `--duration-fast/base/slow` | 150 / 200 / 250ms |

## 代码结构

- `ui/src/components/ui.tsx`：按钮、弹窗、开关、分段控件、Toast 等通用控件。
- `ui/src/components/Chat.tsx`：消息、思考、工具调用、计划卡、审批条。
- `ui/src/components/Composer.tsx`：输入框、附件、`/` 命令与 `@` 文件补全。
- `ui/src/components/Dock.tsx`：终端、文件树、任务、验证、信息。
- `ui/src/components/Sidebar.tsx` / `Settings.tsx` / `Plugins.tsx` / `Palette.tsx`：四个主视图。
- `ui/src/state/app.ts`：按域拆分的 Solid store 与 WS 事件分发。
- `ui/src/styles/`：tokens / base / app / components / chat。

## 禁止

- 扫光 shimmer、渐变按钮、紫色 AI 配色
- 弹跳式 spring
- 同一功能出现两套组件写法
- 直接复制 React 组件运行时代码
