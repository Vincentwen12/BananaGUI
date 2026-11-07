# A/B 测试提示词与知识包

目标：用数据而不是感觉判断新提示词/知识包是否更好。

## 流程

1. 固定同一组评测题（`npm run eval` 的契约题 + 本地真实模型题）。
2. A 版保持当前提示词，B 版只改一个变量（例如新增一条反幻觉规则）。
3. 两版各跑同一组题，记录：通过率、平均耗时、平均 token、错误类型。
4. 只有 B 的通过率显著更高、成本没有明显恶化时才切换。
5. 把结果追加到 `docs/prompt-versions.md`，并可回滚到 A 版。

## 真实模型题（本地）

需要 API key 时，手动把同一组任务分别喂给 A/B 两个提示词，记录：

```json
{
  "test": "prompt-a-vs-b",
  "a": { "pass_rate": 0.85, "avg_time_s": 12, "avg_tokens": 3000 },
  "b": { "pass_rate": 0.92, "avg_time_s": 14, "avg_tokens": 3200 },
  "decision": "switch_to_b"
}
```

CI 只跑不依赖 key 的契约评测；真实模型 A/B 不阻塞合并。
