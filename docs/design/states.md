# 交互八态

每个可交互元素都应有明确状态，不能只做默认态和 hover。

| 状态 | 要求 |
|---|---|
| default | 静止、可读，不靠动画吸引注意 |
| hover | 边框/背景/文字至少一项变化，避免只有阴影 |
| active | 轻微按压反馈，不改变布局 |
| focus-visible | 2px `--accent-ink` 轮廓，键盘可见 |
| disabled | 降透明度 + `cursor: not-allowed`，不可点击 |
| loading | 保留原尺寸，显示进度或占位，不造成跳动 |
| error | 使用 `--danger`，同时给出文字说明，不只靠颜色 |
| selected | 背景/边框/文字层级明确，和 hover 区分 |

禁止用颜色作为唯一状态信号；禁止无替代地 `outline: none`。
