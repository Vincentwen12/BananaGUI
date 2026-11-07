# Banana UI 设计知识包

规则 → 文档 → 扫描器 ID → 示例。

| 文档 | 规则 |
|---|---|
| [principles.md](principles.md) | 9 条硬禁用 + 6 条正向要求 |
| [tokens.md](tokens.md) | `design-tokens.json` 令牌契约 |
| [components.md](components.md) | 按钮/输入/卡片/弹窗/计划卡/任务栏 |
| [states.md](states.md) | 交互八态 |
| [accessibility.md](accessibility.md) | 对比度、焦点、aria、键盘 |
| [typography-spacing.md](typography-spacing.md) | 字号、行高、间距、栅格 |
| [layout.md](layout.md) | 桌面/窄屏/侧栏/Review/终端 |
| [forms.md](forms.md) | 表单、校验、错误、危险确认 |
| [data-display.md](data-display.md) | 表格、diff、空状态 |
| [motion.md](motion.md) | 时长、缓动、减少动效 |
| [content.md](content.md) | 文案、错误信息、空状态 |
| [checklist.md](checklist.md) | 交付前自检 |

## 参考卡

- [Linear](refs/linear.md)
- [Notion](refs/notion.md)
- [Stripe](refs/stripe.md)
- [GitHub Primer](refs/github-primer.md)
- [GOV.UK](refs/govuk.md)

## 示例

- `examples/good/pricing-page.*`：令牌化、八态齐全、通过扫描。
- `examples/bad/*`：每个文件只违反一条规则，用于测试扫描器。

## 扫描器 ID

`no-gradient`、`no-neon-glow`、`no-glass`、`no-ai-palette`、`no-big-radius`、`no-heavy-shadow`、`no-emoji`、`no-lorem`、`no-gradient-hero`、`token-color-only`、`no-important`。

运行：

```bash
npm run ui:check
node scripts/check-ui.mjs docs/design/examples/good
node scripts/check-ui.mjs docs/design/examples/bad/neon.css
```
