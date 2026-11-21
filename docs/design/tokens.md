# Banana 设计令牌

唯一令牌源：根目录 `design-tokens.json`。CSS 变量映射在 `src/ui/style.css` 的 `:root`。

## 颜色

| 令牌 | 值 | 用途 |
|---|---|---|
| `bg` | `#fafafa` | 页面背景 |
| `panel` / `panel2` | `#f2f2f2` / `#ededed` | 面板层级 |
| `border` / `borderStrong` | `rgba(0,0,0,.08)` / `.16` | 边框与分隔 |
| `text` / `text2` / `text3` | `#161616` / `#5c5c5c` / `#6b6b73` | 文字层级 |
| `accent` / `accentInk` | `#dcde8d` / `#8a6d12` | 香蕉黄强调 |
| `danger` / `success` | `#c9564a` / `#2f7d50` | 语义色 |

## 圆角

`none` 0、`sm` 4、`md` 6、`lg` 8。矩形表面 ≤ 8px；胶囊/开关/滚动条/头像可用 `99px` / `999px` / `50%`。

## 阴影

- `sm`：`0 1px 2px rgba(16,16,20,.05)`
- `overlay`：`0 12px 32px rgba(16,16,20,.14)`
- 禁止逗号分隔的多层重阴影。

## 间距

`4 / 8 / 12 / 16 / 24 / 32 / 40 / 48`。CSS 变量：`--space-1..8`。

## 字号

`11 / 12 / 13 / 14 / 16 / 20 / 28`。CSS 变量：`--text-xs..2xl`。

## 强制规则

- 令牌文件之外不得出现 `#hex`、`rgb()`、`hsl()`。
- 不允许 `border-radius: 16px` 这类裸值；用 `var(--radius-*)`。
- 项目存在 `design-tokens.json` 时，`ui_audit` 会把令牌外硬编码颜色视为失败。
- 颜色对比度由令牌组合保证；新增颜色必须同时提供深色主题值。
