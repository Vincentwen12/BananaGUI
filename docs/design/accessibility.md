# 可访问性

## 规则

- 正文对比度 ≥ 4.5:1；大字/图标 ≥ 3:1。
- 所有图标按钮有 `aria-label` 或可见文字。
- 弹层使用 `role="dialog"` + `aria-modal="true"`；Tab 焦点限制在弹层内，Esc 关闭并归还焦点。
- 流式状态使用 `aria-live="polite"`，不要每帧播报。
- 支持 `prefers-reduced-motion`。
- 不用 emoji 代替图标或状态；不用颜色作为唯一错误提示。

## 反例

```tsx
<button onClick={close}><svg /></button>
```

## 正例

```tsx
<button onClick={close} aria-label="关闭">
  <svg aria-hidden="true" />
</button>
```

## 扫描器

`no-emoji`；对比度由令牌组合检查和人工验收。

## 验收

只用键盘可以完成：切换会话、发送、停止、审批、设置。
