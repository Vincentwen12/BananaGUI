# Banana UI 原则

目标：安静、可信、耐看。界面服务于对话和代码，不做视觉表演。

## 9 条硬禁用

| 规则 ID | 禁用 | 反例 | 正例 |
|---|---|---|---|
| `no-gradient` | 装饰性渐变 | `background: linear-gradient(...)` | `background: var(--panel)` |
| `no-neon-glow` | 霓虹发光 | `text-shadow: 0 0 18px #8b5cf6` | 无 `text-shadow`，用字重/颜色分层 |
| `no-glass` | 玻璃拟态 | `backdrop-filter: blur(18px)` | 半透明实色 `rgba(16,16,20,.32)` |
| `no-ai-palette` | 紫蓝 AI 配色 | `#6366F1` / `#8B5CF6` / `#A855F7` | 香蕉黄 `#dcde8d` + 黑白暖中性 |
| `no-big-radius` | 矩形圆角 > 8px | `border-radius: 16px` | `border-radius: var(--radius)` |
| `no-heavy-shadow` | 多层重阴影 | `0 1px 2px ..., 0 24px 48px ...` | 单层 `var(--shadow-sm)` 或 `var(--shadow-overlay)` |
| `no-emoji` | emoji 图标 | `💾 保存` | 内联 SVG |
| `no-lorem` | 假文案 | `Lorem ipsum` | 真实中文/英文文案 |
| `no-gradient-hero` | 居中大标题 + 渐变按钮 | `text-align:center` + `font-size:72px` + 渐变按钮 | 应用空状态或普通标题，按钮用实色 |

## 6 条正向要求

1. 颜色、间距、字号、圆角、阴影引用 `design-tokens.json` / CSS 变量。
2. 交互元素有 8 态：default / hover / active / focus-visible / disabled / loading / error / selected。
3. 正文对比度 ≥ 4.5:1。
4. 动效只动 `transform` / `opacity` / 颜色，并遵守 `prefers-reduced-motion`。
5. 键盘可达：Tab 循环限制在弹层内，Esc 关闭并归还焦点。
6. 信息优先：先内容后装饰，不用无意义卡片、徽章和分隔线。

## 例外

- `mask-image` 功能性渐隐允许渐变函数。
- xterm 终端调色板必须用具体色值，用 `scanner-allow: terminal-palette` 标记。
- 胶囊/开关/滚动条/头像允许 `99px` / `999px` / `50%`。
- 代码内部原子写入 `.tmp` 不属于临时文件规则。
