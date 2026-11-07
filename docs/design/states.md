# 交互八态

| 状态 | 要求 | CSS 示例 |
|---|---|---|
| default | 静止、可读 | `border: 1px solid var(--line);` |
| hover | 边框/背景/文字变化 | `.btn:hover { border-color: var(--line-strong); }` |
| active | 轻微按压，不改布局 | `.btn:active { transform: scale(0.98); }` |
| focus-visible | 可见轮廓 | `outline: 2px solid var(--accent-ink); outline-offset: 2px;` |
| disabled | 降透明度 | `opacity: .45; cursor: not-allowed;` |
| loading | 保留尺寸 | 显示 spinner，不替换按钮尺寸 |
| error | 文字 + 颜色 | `color: var(--danger);` |
| selected | 背景/边框明确 | `border-color: var(--accent-ink); background: var(--accent-soft);` |

## 反例

```css
button:focus { outline: none; }
button:hover { box-shadow: 0 0 18px #8b5cf6; }
```

## 正例

```css
button:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 2px; }
button:disabled { opacity: .45; cursor: not-allowed; }
```

## 扫描器

`no-neon-glow`、`no-important`；状态缺失目前是人工检查项。

## 验收

键盘 Tab 能走完主要流程，禁用态不可点击，错误不只靠颜色。
