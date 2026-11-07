# Banana UI 原则

目标：安静、可信、耐看。界面服务于对话和代码，不做视觉表演。

## 9 条硬禁用

1. 装饰性渐变（`linear-gradient` / `radial-gradient`）；只有 `mask-image` 渐隐例外。
2. 霓虹发光、彩色外发光。
3. 玻璃拟态（`backdrop-filter`）。
4. 紫蓝 AI 配色（`#6366F1` / `#8B5CF6` / `#A855F7` 等）。
5. 矩形表面圆角 > 8px；`999px` / `99px` 只用于胶囊、开关、滚动条、头像和圆点。
6. 多层重阴影；只保留单层轻投影，浮层用单层 `--shadow-overlay`。
7. emoji 图标；统一用内联 SVG。
8. Lorem ipsum 或假数据。
9. 居中大标题 + 渐变按钮的落地页式结构；应用空状态可以居中，但不要渐变 CTA。

## 6 条正向要求

1. 颜色、间距、字号、圆角、阴影全部引用 `--token`，不写裸值。
2. 交互元素有 8 态：default / hover / active / focus-visible / disabled / loading / error / selected。
3. 对比度：正文 ≥ 4.5:1；大字与图标 ≥ 3:1。
4. 动效只动 `transform` / `opacity` / 颜色，并遵守 `prefers-reduced-motion`。
5. 键盘可达：Tab 循环限制在弹层内，Esc 关闭并归还焦点。
6. 信息优先：先内容后装饰，不使用无意义的卡片、徽章和分隔线。

## 例外

- `app.js` 的 xterm 终端调色板必须使用具体色值，已用 `scanner-allow: terminal-palette` 标记。
- CSS `mask-image` 的功能性渐隐允许出现渐变函数。
- 代码内部的原子写入 `.tmp` 不属于「禁止临时文件」。
