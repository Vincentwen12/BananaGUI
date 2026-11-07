# Banana 设计令牌

所有 UI 颜色、间距、字号、圆角、阴影、动效必须引用 `src/ui/style.css` 顶部的 `:root` 变量。

## 颜色

| 令牌 | 用途 |
|---|---|
| `--bg-deep` / `--bg` / `--panel` / `--panel-2` / `--panel-3` | 背景层级 |
| `--line` / `--line-strong` | 边框与分隔 |
| `--text` / `--text-2` / `--text-3` / `--text-placeholder` | 文字层级 |
| `--accent` / `--accent-ink` / `--accent-soft` / `--on-accent` | 品牌香蕉黄 |
| `--success` / `--warn` / `--danger` / `--info` | 语义色 |
| `--diff-add` / `--diff-del` / `--diff-add-ink` / `--diff-del-ink` | diff 背景与文字 |
| `--on-danger` | 危险色上的文字 |

## 间距

`--space-1` 4px、`--space-2` 8px、`--space-3` 12px、`--space-4` 16px、`--space-5` 24px、`--space-6` 32px、`--space-7` 40px、`--space-8` 48px。

## 字号

`--text-xs` 11px、`--text-sm` 12px、`--text-md` 13px、`--text-base` 14px、`--text-lg` 16px、`--text-xl` 20px、`--text-2xl` 28px。

## 圆角

`--radius-sm` 4px、`--radius-md` 6px、`--radius` 8px。胶囊/开关/滚动条/头像可用 `99px` 或 `999px`，圆形可用 `50%`。

## 阴影

- `--shadow-sm`：卡片、输入框等表面。
- `--shadow-overlay`：弹层、菜单、Toast。
- 禁止 `a, b` 形式的多层阴影。

## 动效

`--dur-1` 140ms、`--dur-2` 200ms、`--dur-3` 240ms；缓动使用 `--ease` / `--ease-soft` / `--spring`。减少动态效果时全部降为 0。
