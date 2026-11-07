# Banana 组件约定

## 按钮

- 主按钮：`--accent` 背景 + `--on-accent` 文字；次按钮：`--panel-2` + `--line`；幽灵按钮：透明背景。
- 必须有 hover / active / focus-visible / disabled / loading 态。
- 不用渐变、不用彩色发光。

## 输入

- 边框 `--line`，聚焦 `--line-strong` 或 `--accent-ink`，焦点轮廓保留。
- placeholder 用 `--text-placeholder`，不要用正文色。

## 卡片 / 面板

- 背景 `--bg` 或 `--panel`，边框 `--line`，圆角 8px，阴影最多 `--shadow-sm`。
- 不为每个区块加卡片；优先用留白和分隔线。

## 弹层

- 遮罩用半透明实色，不用模糊。
- 圆角 8px，阴影 `--shadow-overlay`。
- Tab 焦点限制在弹层内，Esc 关闭并归还焦点。

## 计划卡 / 任务栏

- 计划卡只在 `pending` 时出现；批准后不再固定追加到消息底部。
- 计划项状态只允许 pending / in_progress / done；批准时全部重置为 pending。
- 任务栏只显示 pending / in_progress；全部完成或取消计划后收起。
- 计划项可附带阶段、文件、验证方式、置信度，用次要文字展示。

## 终端

- xterm 调色板是固定接口，允许具体色值，文件里用 `scanner-allow: terminal-palette` 标记。
