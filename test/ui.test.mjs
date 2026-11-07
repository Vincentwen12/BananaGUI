// UI 排版与命令建议的单元测试：确保中文双宽字符不会把表格撑歪。
import {
  banner,
  displayWidth,
  formatCount,
  padDisplay,
  truncateDisplay,
} from '../src/cli/ui.ts';
import { suggestCommand } from '../src/cli/commands.ts';
import { startupHeader } from '../src/cli/repl.ts';

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

check('中文按两列计算', displayWidth('中文') === 4, String(displayWidth('中文')));
check('忽略 ANSI 颜色', displayWidth('\u001b[31mabc\u001b[0m') === 3, String(displayWidth('\u001b[31mabc\u001b[0m')));
check('emoji 按两列计算', displayWidth('🍌') === 2, String(displayWidth('🍌')));
check('padDisplay 补齐到目标宽度', displayWidth(padDisplay('中文', 8)) === 8);
check('padDisplay 不截断超宽文本', padDisplay('中文中文', 3) === '中文中文');
check('truncateDisplay 按显示宽度截断', truncateDisplay('中文中文', 5) === '中文…', truncateDisplay('中文中文', 5));
check('truncateDisplay 不处理短文本', truncateDisplay('abc', 10) === 'abc');

const art = banner();
const artWidth = Math.max(...art.split('\n').map(displayWidth));
check('banner 单行不超过 60 列', artWidth <= 60, String(artWidth));
check('banner 包含版本号', art.includes('BananaCLI v'));
check('banner 的香蕉图形完整', art.includes('| __ )') && art.includes('|____/'));

const header = startupHeader({
  providerName: 'deepseek',
  model: 'deepseek-chat',
  workspace: 'D:\\BananaCLI',
  toolCount: 11,
  permissions: { shell: 'ask', write: 'ask', network: 'allow' },
  sessionTitle: '重构配置向导',
  sessionId: '20261017-203512-ab12',
});
check('头部包含模型信息', header.includes('deepseek/deepseek-chat'));
check('头部包含权限组合', header.includes('shell=ask') && header.includes('network=allow'));
check('头部包含会话 id', header.includes('20261017-203512-ab12'));
check('头部默认带 banner', header.includes('| __ )'));
const noBanner = startupHeader({
  providerName: 'anthropic',
  model: 'claude-sonnet-4-5',
  workspace: '/tmp/work',
  toolCount: 3,
  permissions: { shell: 'allow', write: 'allow', network: 'allow' },
  sessionTitle: '新对话',
  sessionId: '20261017-203512-ab12',
  skipBanner: true,
});
check('skipBanner 时不再重复 logo', !noBanner.includes('| __ )'));

check('命令拼写错误能被纠正', suggestCommand('providr') === 'provider', suggestCommand('providr'));
check('别名也能匹配', suggestCommand('swich') === 'use', suggestCommand('swich'));
check('完全无关的命令不瞎猜', suggestCommand('zzzzzz') === undefined, String(suggestCommand('zzzzzz')));

check('formatCount 千位缩写', formatCount(1234) === '1.2k', formatCount(1234));
check('formatCount 小于千保持原样', formatCount(999) === '999');

if (failures.length) {
  process.stdout.write(`\n${passed} 项通过，${failures.length} 项失败: ${failures.join(', ')}\n`);
  process.exit(1);
}
process.stdout.write(`\n${passed} 项通过，0 项失败\n`);
process.exit(0);