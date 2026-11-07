// 网页搜索的解析回归测试。不联网，只喂固定 HTML，保证换了搜索结果页结构时能被发现。
import { normalizeUrl, parseBing, parseDuckDuckGo, sanitizeHits, unwrapBing, mergeSearchHits, extractMainText } from '../src/tools/web.ts';
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failed += 1;
    process.stdout.write(`  FAIL ${name}${detail ? ` (${detail})` : ''}\n`);
  }
}

const base64 = Buffer.from('https://example.com/真实地址', 'utf8').toString('base64url');

const html = `
<ol id="b_results">
  <li class="b_algo">
    <h2><a href="https://www.runoob.com/nodejs/nodejs-tutorial.html">Node.js 教程 | 菜鸟教程</a></h2>
    <div class="b_caption"><p>Node.js 是一个基于 Chrome V8 引擎的 JavaScript 运行环境。</p></div>
  </li>
  <li class="b_algo">
    <h2><a href="https://www.bing.com/ck/a?!&&p=abc&u=a1${base64}&ntb=1">被包装的链接</a></h2>
    <div class="b_caption"><p>摘要里有实体 &amp; 和 &ensp; 空白</p></div>
  </li>
  <li class="b_algo">
    <h2><a href="javascript:void(0)">不该出现</a></h2>
  </li>
</ol>`;

const hits = parseBing(html, 5);
check('解析出两条有效结果', hits.length === 2, String(hits.length));
check('标题正确', hits[0]?.title === 'Node.js 教程 | 菜鸟教程', hits[0]?.title);
check('链接正确', hits[0]?.url === 'https://www.runoob.com/nodejs/nodejs-tutorial.html', hits[0]?.url);
check('摘要正确', (hits[0]?.snippet ?? '').includes('V8 引擎'), hits[0]?.snippet);
check('跳过非 http 链接', !hits.some((hit) => hit.url.startsWith('javascript:')), JSON.stringify(hits.map((h) => h.url)));
check('还原 bing 跳转链接', hits[1]?.url === 'https://example.com/真实地址', hits[1]?.url);
check('解码 HTML 实体', (hits[1]?.snippet ?? '').includes('&') && !(hits[1]?.snippet ?? '').includes('&ensp;'), hits[1]?.snippet);

check('普通链接原样返回', unwrapBing('https://a.com/x') === 'https://a.com/x');
check('数量上限生效', parseBing(html, 1).length === 1, String(parseBing(html, 1).length));

// 结果清洗：去重、去掉搜索引擎自己的跳转页、补标题
check('URL 归一化忽略大小写和末尾斜杠', normalizeUrl('https://WWW.Example.com/a/') === normalizeUrl('https://example.com/a'));
const messy = [
  { title: 'A', url: 'https://example.com/a/', snippet: 'one' },
  { title: 'A 重复', url: 'https://www.example.com/a', snippet: 'dup' },
  { title: '', url: 'https://bing.com/ck/a?u=a1xx', snippet: '' },
  { title: '非 http', url: 'javascript:void(0)', snippet: '' },
  { title: 'B', url: 'https://b.com/b', snippet: '  two  ' },
];
const cleaned = sanitizeHits(messy, 5);
check('搜索结果去重', cleaned.length === 2, JSON.stringify(cleaned.map((h) => h.url)));
check('去掉搜索引擎跳转页', !cleaned.some((h) => h.url.includes('bing.com')), JSON.stringify(cleaned.map((h) => h.url)));
check('空标题用链接兜底', cleaned.every((h) => h.title), JSON.stringify(cleaned.map((h) => h.title)));
check('摘要去掉首尾空白', cleaned[1]?.snippet === 'two', cleaned[1]?.snippet);

// Brave 的官方域名是 api.search.brave.com，写错会稳定 404
const webSource = readFileSync(new URL('../src/tools/web.ts', import.meta.url), 'utf8');
check('Brave 使用官方 API 域名', webSource.includes('api.search.brave.com'), '域名写错会导致搜索永远降级');
check('搜索开关支持环境变量兜底', webSource.includes('BANANA_TAVILY_KEY') || webSource.includes("process.env['TAVILY_API_KEY']"));

// DuckDuckGo：标准页和 lite 页都要能解析，跳转链接要还原
const ddg = `
<div class="result">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnodejs.org%2Fapi%2F&rut=1">Node.js API</a>
  <a class="result__snippet">Node.js 官方 API 文档</a>
</div>
<table>
  <a class="result-link" href="https://developer.mozilla.org/zh-CN/docs/Web/API">MDN Web API</a>
  <td class="result-snippet">Web API 参考</td>
</table>`;
const ddgHits = parseDuckDuckGo(ddg, 5);
check('DuckDuckGo 标准页能解析', ddgHits[0]?.url === 'https://nodejs.org/api/', ddgHits[0]?.url);
check('DuckDuckGo lite 页能解析', ddgHits[1]?.url === 'https://developer.mozilla.org/zh-CN/docs/Web/API', ddgHits[1]?.url);
check('DuckDuckGo 摘要正确', ddgHits[1]?.snippet === 'Web API 参考', ddgHits[1]?.snippet);

// 多源合并：重复链接只留一条，两个引擎都靠前的结果优先
const merged = mergeSearchHits(
  [
    [
      { title: 'A', url: 'https://example.com/a', snippet: 'a' },
      { title: 'B', url: 'https://github.com/x/y', snippet: 'b' },
    ],
    [
      { title: 'B2', url: 'https://www.github.com/x/y/', snippet: 'b2 longer' },
      { title: 'C', url: 'https://example.com/c', snippet: 'c' },
    ],
  ],
  5,
);
check('多源合并去重', merged.length === 3, JSON.stringify(merged.map((h) => h.url)));
check('两个引擎都命中的结果排前面', merged[0]?.url.includes('github.com'), merged[0]?.url);
check('合并时保留更完整的摘要', merged[0]?.snippet === 'b2 longer', merged[0]?.snippet);

// 正文提取：去导航/脚本，保留 article 正文
const article = `<html><head><script>var x=1</script></head><body>
<nav>首页 文档 关于</nav>
<article><h1>安装</h1><p>运行 npm install 即可。</p><p>然后执行 banana。</p></article>
<footer>版权</footer></body></html>`;
const extracted = extractMainText(article);
check('正文提取保留内容', extracted.includes('npm install') && extracted.includes('banana'), extracted);
check('正文提取去掉脚本和导航', !extracted.includes('var x') && !extracted.includes('首页'), extracted);

// 搜索配置：默认零配置可用，深度搜索默认关闭
check('默认使用自动搜索源', webSource.includes("provider: 'auto'"));
check('深度搜索默认关闭', /deep: false/.test(webSource) || readFileSync(new URL('../src/config/config.ts', import.meta.url), 'utf8').includes('deep: false'));
check('支持按调用切换深度搜索', webSource.includes("input.depth === 'deep'"));

process.stdout.write(`\n${passed} 项通过，${failed} 项失败\n`);
process.exitCode = failed ? 1 : 0;
