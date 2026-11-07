# UI 交付自检

交付前逐条回答，任一不过就重写：

1. `no-gradient` / `no-neon-glow` / `no-glass` 是否全部为「否」？
2. `no-ai-palette`：是否没有紫蓝 AI 配色？
3. `no-big-radius`：矩形圆角是否 ≤ 8px？
4. `no-heavy-shadow`：是否只有单层阴影？
5. `no-emoji` / `no-lorem`：是否没有 emoji 和假文案？
6. `no-gradient-hero`：是否没有居中大标题 + 渐变按钮？
7. `token-color-only`：颜色、间距、字号、圆角、阴影是否全部来自令牌？
8. 交互元素 8 态是否齐全？
9. 键盘 Tab / Shift+Tab / Esc 是否可用？弹层焦点是否被困住？
10. 正文对比度是否 ≥ 4.5:1？
11. `prefers-reduced-motion` 下是否没有动画？
12. 375px 窄屏是否可用，输入框和弹层是否被遮挡？

命令：

```bash
node scripts/check-ui.mjs <你的 UI 文件或目录>
npm run ui:check
npm run eval
npm test
```
