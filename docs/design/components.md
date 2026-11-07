# 组件

## 规则

- 按钮、输入、卡片、弹窗、计划卡、任务栏必须有明确状态和令牌。
- 主按钮用 `--accent` + `--on-accent`；次按钮用 `--panel-2`；幽灵按钮透明。
- 卡片背景 `--bg`/`--panel`，边框 `--line`，圆角 ≤ 8px，阴影最多 `--shadow-sm`。
- 弹窗遮罩用半透明实色，不用模糊；圆角 8px，阴影 `--shadow-overlay`。
- 计划卡只在 pending 时显示操作；批准后由验证页签推进阶段。
- 任务栏只显示 pending / in_progress；全部完成或取消后收起。

## 反例

```css
.card {
  border-radius: 16px;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  box-shadow: 0 1px 2px #000, 0 24px 48px #000;
  backdrop-filter: blur(18px);
}
```

## 正例

```css
.card {
  padding: var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
```

## 扫描器

`no-gradient`、`no-glass`、`no-big-radius`、`no-heavy-shadow`。

## 验收

组件在浅色/深色/窄屏下均可用，状态齐全，无令牌外硬编码值。
