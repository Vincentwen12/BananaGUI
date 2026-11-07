# UI 示例

## good

`good/pricing-page.html` + `good/pricing-page.css`

- 所有颜色、间距、圆角、阴影来自令牌。
- 按钮有 hover / focus-visible / disabled / selected。
- 无渐变、霓虹、玻璃拟态、大圆角、重阴影、emoji。
- 窄屏单列布局。

运行：

```bash
node scripts/check-ui.mjs docs/design/examples/good
```

## bad

每个文件只违反一条规则：

| 文件 | 规则 |
|---|---|
| `bad/neon.css` | `no-gradient`、`no-neon-glow`、`no-ai-palette` |
| `bad/glass.css` | `no-glass` |
| `bad/big-radius.css` | `no-big-radius` |
| `bad/heavy-shadow.css` | `no-heavy-shadow` |
| `bad/emoji.tsx` | `no-emoji` |
| `bad/gradient-hero.css` | `no-gradient`、`no-gradient-hero` |

运行：

```bash
node scripts/check-ui.mjs docs/design/examples/bad/neon.css
```
