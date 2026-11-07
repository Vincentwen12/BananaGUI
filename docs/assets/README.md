# 演示素材

这些是 **示意图**，用于 README 首屏展示工作流；实际界面以运行版本为准。

| 文件 | 用途 |
|---|---|
| `demo.svg` / `demo.png` | Plan → Build → Review 流程 |
| `cli.svg` / `cli.png` | CLI 示意 |
| `gui.svg` / `gui.png` | GUI 示意 |
| `review.svg` / `review.png` | Review「验证」页签示意 |
| `social-preview.svg` / `social-preview.png` | GitHub Social preview（1280×640） |

PNG 是由 SVG 通过 Edge headless 渲染的，README 使用 PNG；SVG 保留作为可编辑源文件。

## 替换成真实截图 / GIF

1. 运行 `banana --ui` 或 `banana-gui`。
2. 录制 20–30 秒：Plan → 批准 → `/verify` → UI 审计拦截 → 修复 → 通过。
3. 保存为 `docs/assets/demo.gif`，把 README 里的 `demo.svg` 改成 `demo.gif`。
4. 截图分别保存为 `cli.png`、`gui.png`、`review.png`，替换 README 表格里的 SVG。
5. Social preview 在 GitHub 仓库 Settings → Social preview 上传 `social-preview.svg` 或导出的 PNG。
