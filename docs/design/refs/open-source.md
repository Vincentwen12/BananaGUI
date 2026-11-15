# 开源 UI 参考

只学结构、交互和可访问性，不照搬视觉。涉及 AGPL 的项目只看交互，不复制代码。

## 组件与交互

| 项目 | 许可证 | 学什么 | 不要照搬 |
|---|---|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | MIT | 组件 API 的命名、变体组织、可组合结构 | 默认的卡片堆叠和“模板感”外观 |
| [Radix Primitives](https://github.com/radix-ui/primitives) | MIT | 弹层、菜单、焦点管理、键盘行为 | 它只是行为层，不要直接当视觉方案 |
| [Headless UI](https://github.com/tailwindlabs/headlessui) | MIT | 过渡状态、列表键盘导航、无障碍属性 | 过度依赖动画包装 |
| [Base UI](https://github.com/mui/base-ui) | MIT | 无样式组件的状态机式 API | 复杂组件一次引入太多 |
| [IBM Carbon](https://github.com/carbon-design-system/carbon) | Apache-2.0 | 企业级信息密度、表格、表单、状态语义 | 厚重的设计语言和大量图标 |
| [Motion](https://github.com/motiondivision/motion) | MIT | 弹簧参数、手势与布局动画的组织方式 | 为每个元素都加动画 |
| [Lucide](https://github.com/lucide-icons/lucide) | ISC | 统一线宽、端点、尺寸的图标体系 | 图标风格混用 |
| [Open Props](https://github.com/argyleink/open-props) | MIT | 用 CSS 变量组织颜色、间距、缓动 | 整套变量直接覆盖现有令牌 |

## 完整产品参考

| 项目 | 许可证 | 学什么 | 不要照搬 |
|---|---|---|---|
| [Cal.com](https://github.com/calcom/cal.com) | AGPL-3.0 | 设置页分组、表单校验、空状态 | 代码和品牌视觉（AGPL） |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | MIT | 画布工具的手感、浮动工具栏、快捷键提示 | 手绘风格和装饰性元素 |
| [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend) | MIT | 表单错误、标签、无障碍 | 过于保守的排版 |
| [GitHub Primer](https://github.com/primer/css) | MIT | 代码块、状态色、开发者工具可读性 | 过多边框、徽章和蓝色链接 |

## 使用方式

1. 先读 `principles.md` 和 `tokens.md`，确定禁用项。
2. 需要具体交互时，只选 1 个最接近的参考，说明学它的哪一点，不罗列链接；不要整套引入。
3. 视觉仍然用本项目的 `design-tokens.json`，不复制参考项目的颜色和圆角。
4. 交付前跑 `ui_audit`。
