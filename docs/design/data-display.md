# 数据展示

## 规则

- 表格数字右对齐，文本左对齐；不要给每列都加边框。
- 空状态说明为什么为空，并给一个动作。
- 长文本截断时提供完整内容入口（title / 详情面板）。
- 状态色只做辅助，必须有文字或图标。
- diff 用行号 + 增删色，不要只靠颜色区分。
- 时间显示相对时间，hover 再给绝对时间。

## 反例

```html
<div class="empty">暂无数据</div>
```

## 正例

```html
<div class="empty">
  <p>还没有会话。</p>
  <button type="button">新建对话</button>
</div>
```

## 扫描器

`no-gradient`、`no-neon-glow`、`token-color-only`。

## 验收

空状态有下一步；表格窄屏可横向滚动；diff 不只靠颜色。
