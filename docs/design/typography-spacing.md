# 排版与间距

## 字号

使用 `--text-xs` 11px、`--text-sm` 12px、`--text-md` 13px、`--text-base` 14px、`--text-lg` 16px、`--text-xl` 20px、`--text-2xl` 28px。

- 正文默认 13–14px，行高 1.55–1.7。
- 代码使用 `--mono`，13px 左右，保留横向滚动。
- 不用 9px/10px 作为正文；只允许极少数辅助标签。

## 间距

使用 `--space-1..8`：4 / 8 / 12 / 16 / 24 / 32 / 40 / 48px。

- 组件内部 8–12px，区块之间 16–24px。
- 不写裸 `margin: 13px`；优先引用令牌。
- 用留白和分隔线建立层级，不靠堆卡片。

## 反例

```css
.title { font-size: 37px; margin: 13px; letter-spacing: 3px; }
```

## 正例

```css
.title { font-size: var(--text-xl); margin-bottom: var(--space-4); }
```

## 扫描器

`token-color-only`；字号/间距裸值目前是警告项。

## 验收

中文双宽对齐；长文可读；代码块不撑破容器。
