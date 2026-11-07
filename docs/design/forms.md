# 表单

## 规则

- 标签在上，输入在下；不要只用 placeholder 当标签。
- 必填、格式、范围在提交前给出明确错误，错误贴近字段。
- 错误用文字说明，不只把边框变红。
- 输入框高度和圆角引用令牌；focus 轮廓必须可见。
- 破坏性提交（删除、清空）二次确认，默认焦点在取消。
- 保存中显示 loading，成功后短反馈，失败保留用户输入。

## 反例

```html
<input placeholder="邮箱" />
```

## 正例

```html
<label for="email">邮箱</label>
<input id="email" name="email" type="email" autocomplete="email" />
<p class="field-error" role="alert">请输入有效邮箱</p>
```

## 扫描器

`token-color-only`、`no-big-radius`、`no-important`。

## 验收

错误可被屏幕阅读器读到；提交失败不丢内容；危险操作可取消。
