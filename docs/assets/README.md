# 演示素材

这些是 **示意图**，用于 README 首屏展示工作流；实际界面以运行版本为准。

| 文件 | 用途 |
|---|---|
| `gui-real.png` | **真实** `banana --ui` 运行截图 |
| `review-real.png` | **真实** Review「验证」页签截图 |
| `demo.svg` / `demo.png` | Plan → Build → Review 流程示意 |
| `cli.svg` / `cli.png` | CLI 示意 |
| `gui.svg` / `gui.png` | GUI 示意（旧版） |
| `review.svg` / `review.png` | Review 示意（旧版） |
| `social-preview.svg` / `social-preview.png` | GitHub Social preview（1280×640） |

PNG 是由 SVG 通过 Edge headless 渲染的，README 使用 PNG；SVG 保留作为可编辑源文件。

## 替换成真实截图 / GIF

`gui-real.png` 和 `review-real.png` 已经由真实运行的 `banana --ui` 截取。

如果还要补 30 秒 GIF：

1. 运行 `banana --ui` 或 `banana-gui`。
2. 录制 20–30 秒：Plan → 批准 → `/verify` → Review 验证 → 结束。
3. 保存为 `docs/assets/demo.gif`，把 README 里的 `gui-real.png` 换成 `demo.gif`（或新增一段）。
4. Social preview 在 GitHub 仓库 Settings → Social preview 上传 `social-preview.png`。
