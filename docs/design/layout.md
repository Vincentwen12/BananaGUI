# 布局

## 规则

- 8px 网格；区块之间 16–24px，组内 8–12px。
- 主内容优先，侧栏和 Review 可折叠；窄屏覆盖层不挡输入框。
- 不嵌套多层卡片；用留白、分隔线和字重建立结构。
- 顶部栏高度稳定，滚动不跳动。
- 对话区跟随底部，用户上滚后停止跟随，并给「回到最新」。
- 弹层 z-index 高于所有内容，打开时背景不可交互。

## 反例

```css
.sidebar { position: fixed; width: 600px; }
.modal { z-index: 10; }
```

## 正例

```css
.sidebar { width: var(--sidebar); }
.modal { z-index: 200; }
```

## 扫描器

`no-big-radius`、`no-heavy-shadow`、`no-glass`；响应式为人工验收。

## 验收

375px 宽可用；输入框/弹层不被遮挡；键盘焦点不跑到背景。
