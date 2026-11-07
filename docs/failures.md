# 失败案例库

记录真实翻车场景，定期把高频错误补进提示词、UI 扫描规则和测试。

## 模板

```json
{
  "id": "fail-001",
  "scene": "场景",
  "error": "错误表现",
  "root_cause": "根因",
  "fix": "修正方式",
  "added_to": "补到了哪条规则/测试",
  "date": "2026-11-07"
}
```

## 已知案例

### fail-001 打开不可信仓库即执行项目插件

- **场景**：克隆一个带 `.banana/tools/*.mjs` 的仓库并打开。
- **错误表现**：`import()` 直接执行插件顶层代码，默认审批为 `never`，等于无确认执行任意命令。
- **根因**：项目级文件被默认信任。
- **修正**：项目配置/插件/AGENT.md 改为指纹信任；未信任不加载；插件默认审批改为 `shell`。
- **补到**：`src/config/project-trust.ts`、`src/config/config.ts`、`test/features.test.mjs`「未信任项目不合并配置」。

### fail-002 没有 D 盘的机器保存不了配置

- **场景**：Windows 机器只有 C 盘，启动 `banana-gui`。
- **错误表现**：启动器强制 `BANANA_HOME=D:\BananaCLI-data`，配置/会话保存失败。
- **根因**：启动器硬编码盘符，绕过了 `bananaHome()` 的可写性回退。
- **修正**：启动器不再强制 `BANANA_HOME`；`ELECTRON_CACHE` 仅在 D 盘存在时设置；Electron 数据目录增加家目录回退。
- **补到**：`gui/bin/banana-gui.mjs`、`gui/desktop/main.cjs`、`test/pack.test.mjs`「GUI 启动器不再强制 D 盘数据目录」。

### fail-003 Plan 计划项带着 done/in_progress 进入执行

- **场景**：Plan 模式让模型列计划，模型把第一项标成 `in_progress`。
- **错误表现**：批准后 Build 一开始就显示 1/2 完成、50% 进度。
- **根因**：计划项直接复用 `session.todos` 的状态。
- **修正**：Plan 创建和批准时统一重置为 `pending`，计划快照与 todos 分离。
- **补到**：`src/server/ui-server.ts`、`test/gui.test.mjs`「Plan 阶段计划项全部为 pending」。

### fail-004 浏览器断开后审批挂死

- **场景**：审批弹窗出现时关闭页面。
- **错误表现**：服务端审批 Promise 永不结算，`turn` 一直非空，后续对话 409。
- **根因**：abort 只取消请求，没有结算 pending 审批。
- **修正**：审批 Promise 监听 abort；SSE close 时统一 resolve(false)。
- **补到**：`src/server/ui-server.ts`。

### fail-005 grep 截断后匹配数虚低

- **场景**：5 处匹配，`limit: 2`。
- **错误表现**：报告「找到 2 处匹配」，剩余提示不出现。
- **根因**：达到展示上限后直接 `break`，停止计数。
- **修正**：只限制展示行数，继续计数；加 20,000 上限。
- **补到**：`src/tools/fs.ts`、`test/features.test.mjs`「grep 截断后仍报告真实总数」。

### fail-006 CLI 多行续行重复

- **场景**：输入 `a\`，续行输入 `b`。
- **错误表现**：发送内容变成 `a\na\nb`。
- **根因**：首行和续行在循环里被加入两次。
- **修正**：抽 `collectContinuation`，每行只加入一次。
- **补到**：`src/cli/continuation.ts`、`test/features.test.mjs`「多行续行每行只加入一次」。

### fail-007 大文件静默跳过备份

- **场景**：修改 >4MB 文件后执行 `/undo`。
- **错误表现**：没有备份也没有提示，用户以为能撤销；旧逻辑甚至可能把文件当新建文件删除。
- **根因**：`record()` 超限直接 return。
- **修正**：记录 `skipped`，undo 时明确列出并绝不删除文件。
- **补到**：`src/session/backups.ts`、`test/features.test.mjs`「>4MB 文件记录 skipped」。
