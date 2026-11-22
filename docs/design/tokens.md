# Banana 设计令牌

唯一令牌源：根目录 `design-tokens.json`。CSS 变量映射在 `ui/src/styles/tokens.css` 的 `:root` 与 `:root[data-theme='dark']`。

## 颜色（浅色）

| 令牌 | 值 | 用途 |
|---|---|---|
| `bg` | `#ffffff` | 页面与对话背景 |
| `side` | `#f7f7f5` | 左侧栏 |
| `panel` / `panel2` | `#ffffff` / `#f2f2ef` | 弹层 / 次级表面 |
| `hover` / `active` | `#f0f0ed` / `#e9e9e5` | 交互态 |
| `border` / `borderStrong` | `#e7e7e2` / `#d6d6cf` | 边框与分隔 |
| `text` / `text2` / `text3` | `#1b1b19` / `#5d5d57` / `#8b8b83` | 文字层级 |
| `accent` / `onAccent` | `#1b1b19` / `#ffffff` | 主按钮 |
| `brand` / `link` | `#f5c518` / `#2f62d8` | 品牌点与链接 |
| `danger` / `success` / `warning` | `#c93a2e` / `#2f7d50` / `#946200` | 语义色 |

深色主题在 `tokens.css` 内覆盖同名变量：背景 `#0f0f0e`、侧栏 `#171716`、文字 `#ecece7`。

## 圆角

`none` 0、`sm` 4、`md` 6、`lg` 8、`xl` 12。矩形表面 ≤ 10px；胶囊/开关/滚动条/头像可用 `99px` / `999px` / `50%`。

## 阴影

- `sm`：`0 1px 2px rgba(0,0,0,.18)`，只用于开关滑块。
- `overlay`：`0 8px 24px rgba(16,16,20,.10)`，只用于弹窗、菜单、抽屉。
- 禁止逗号分隔的多层重阴影。

## 间距

`4 / 8 / 12 / 16 / 24 / 32`。CSS 变量：`--space-1..6`。

## 字号

`11 / 12 / 13 / 14 / 16 / 20`。CSS 变量：`--text-xs / sm / base / md / lg / xl`。正文默认 14px，可由设置页在 12–18px 之间调整。

## 强制规则

- 令牌文件之外不得出现 `#hex`、`rgb()`、`hsl()`。
- 不允许 `border-radius: 16px` 这类裸值；用 `var(--radius-*)`。
- 项目存在 `design-tokens.json` 时，`ui_audit` 会把令牌外硬编码颜色视为失败。
- 颜色对比度由令牌组合保证；新增颜色必须同时提供深色主题值。
