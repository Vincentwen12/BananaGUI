# 动效

## 规则

- 只动 `transform` / `opacity` / 颜色，不触发布局。
- 常规时长 140–240ms；弹层和页面切换不超过 300ms。
- 不用循环闪烁、扫光、霓虹脉冲。
- 尊重 `prefers-reduced-motion`：全部降为 0 或只保留透明度变化。
- 流式内容限制刷新频率，不每帧重排。
- 动画不能是理解状态的唯一方式。

## 反例

```css
@keyframes glow { 0%,100% { text-shadow: 0 0 8px #8b5cf6; } }
.title { animation: glow 1.2s infinite; }
```

## 正例

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

## 扫描器

`no-neon-glow`；循环动画和 reduced-motion 为人工检查项。

## 验收

减少动态效果下没有动画；交互不因动画缺失而不可理解。
