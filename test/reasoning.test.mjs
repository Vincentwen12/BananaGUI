// 思考过程纯函数单测：摘要、段落、签名剥离、duration。
import {
  firstLine,
  formatDuration,
  latestCompletedParagraphFirstLine,
  processLabel,
  processStatusFromStop,
  stripReasoningSignature,
  summaryOf,
} from '../ui/src/lib/reasoning.ts';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failures.push(name);
    process.stdout.write(`  FAIL ${name}${detail ? ` (${detail})` : ''}\n`);
  }
}

check('首行取第一段', firstLine('第一行\n第二行') === '第一行');
check('首行去掉空白', firstLine('  abc  \n第二行') === 'abc');
check('已完成后摘要取首行', summaryOf('已完成第一段\n第二段', false) === '已完成第一段');
check(
  '运行中取最新完成段落首行',
  latestCompletedParagraphFirstLine('第一段\n第二段\n\n第三段\n未完成') === '第三段',
);
check(
  '运行中摘要忽略未完成段落',
  summaryOf('甲\n乙\n\n丙\n未完成', true) === '丙',
);
check('摘要去掉 ** 标记', summaryOf('**加粗**内容', false) === '加粗内容');
check('剥离 signature', stripReasoningSignature('<signature>abc</signature>\n真正的思考') === '真正的思考');
check('未闭合 signature 不显示', stripReasoningSignature('<signature>abc') === '');
check('普通文本原样返回', stripReasoningSignature('普通文本') === '普通文本');
check('duration 秒', formatDuration(15_400) === '15 秒');
check('duration 分钟', formatDuration(63_000) === '1 分 03 秒');
check('duration 空', formatDuration(0) === '');
check('完成标签包含用时', processLabel('done', 15_000).includes('已完成分析') && processLabel('done', 15_000).includes('15 秒'));
check('运行标签', processLabel('running') === '分析中…');
check('停止标签', processLabel('stopped') === '已停止');
check('失败标签', processLabel('error') === '分析失败');
check('abort 映射 stopped', processStatusFromStop('aborted') === 'stopped');
check('error 映射 error', processStatusFromStop('error') === 'error');
check('done 映射 done', processStatusFromStop('done') === 'done');

if (failures.length) {
  process.stdout.write(`\n${passed} 项通过，${failures.length} 项失败: ${failures.join(', ')}\n`);
  process.exit(1);
}
process.stdout.write(`\n${passed} 项通过，0 项失败\n`);
process.exit(0);
