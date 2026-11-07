// 配置向导交互逻辑的单元测试：伪造 TTY，直接投递按键事件验证行编辑器。
import { promptLine } from '../src/cli/setup.ts';

const stdin = process.stdin;
const originalIsTTY = stdin.isTTY;
const originalIsRaw = stdin.isRaw;
const originalSetRawMode = stdin.setRawMode;
const originalWrite = process.stdout.write.bind(process.stdout);

// 静音输出，避免测试刷屏
process.stdout.write = () => true;

stdin.isTTY = true;
stdin.isRaw = false;
stdin.setRawMode = () => {};

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    originalWrite(`  ok   ${name}\n`);
  } else {
    failures.push(name);
    originalWrite(`  FAIL ${name}${detail ? ` (${detail})` : ''}\n`);
  }
}

function press(sequence, key) {
  stdin.emit('keypress', sequence, key);
}

function enter() {
  press('\r', { name: 'return' });
}

async function run() {
  // 1. 掩码输入 + 退格
  {
    const promise = promptLine({ prompt: 'key:', mask: true });
    press('s', { sequence: 's' });
    press('k', { sequence: 'k' });
    press('x', { sequence: 'x' });
    press('', { name: 'backspace' });
    press('y', { sequence: 'y' });
    enter();
    const value = await promise;
    check('掩码输入与退格', value === 'sky', value);
  }

  // 2. 回车接受默认值
  {
    const promise = promptLine({ prompt: 'model:', defaultValue: 'gpt-4o' });
    enter();
    const value = await promise;
    check('回车接受默认值', value === 'gpt-4o', value);
  }

  // 3. 粘贴整段文本（一个 keypress 携带多个字符）
  {
    const promise = promptLine({ prompt: 'paste:' });
    press('hello world', { sequence: 'hello world' });
    enter();
    const value = await promise;
    check('粘贴整段文本', value === 'hello world', value);
  }

  // 4. Ctrl+C 取消
  {
    const promise = promptLine({ prompt: 'cancel:' });
    press('\u0003', { name: 'c', ctrl: true });
    try {
      await promise;
      check('Ctrl+C 取消向导', false);
    } catch (error) {
      check('Ctrl+C 取消向导', error.message === 'SETUP_CANCELLED', error.message);
    }
  }

  // 5. 忽略方向键等控制键
  {
    const promise = promptLine({ prompt: 'arrows:' });
    press('a', { sequence: 'a' });
    press('\u001b[A', { name: 'up' });
    press('\u001b[D', { name: 'left' });
    press('b', { sequence: 'b' });
    enter();
    const value = await promise;
    check('忽略方向键', value === 'ab', value);
  }

  // 6. 空输入回落到默认值
  {
    const promise = promptLine({ prompt: 'base:', defaultValue: 'https://api.example.com' });
    enter();
    const value = await promise;
    check('空输入使用默认值', value === 'https://api.example.com', value);
  }

  stdin.isTTY = originalIsTTY;
  stdin.isRaw = originalIsRaw;
  stdin.setRawMode = originalSetRawMode;
  process.stdout.write = originalWrite;

  if (failures.length) {
    originalWrite(`\n${passed} 项通过，${failures.length} 项失败: ${failures.join(', ')}\n`);
    process.exit(1);
  }
  originalWrite(`\n${passed} 项通过，0 项失败\n`);
  // 显式退出：测试里 stub 过 stdin，避免真实终端下事件循环被挂住
  process.exit(0);
}

run().catch((error) => {
  process.stdout.write = originalWrite;
  originalWrite(`按键测试出错: ${error?.stack ?? error}\n`);
  process.exit(1);
});