# 可访问性

- 正文对比度 ≥ 4.5:1；大字/图标 ≥ 3:1。
- 所有图标按钮必须有 `aria-label` 或可见文字。
- 弹层使用 `role="dialog"` + `aria-modal="true"`，Tab 焦点限制在弹层内，Esc 关闭并归还焦点。
- 流式状态使用 `aria-live="polite"`，不要每一帧都播报。
- 支持 `prefers-reduced-motion`：关闭非必要动画。
- 不用 emoji 代替图标或状态；不用颜色作为唯一错误提示。
- 键盘可以完成主要流程：会话切换、发送、停止、审批、设置。
