/**
 * dsh-card 端到端测试
 *
 * 零外部依赖原则：只依赖 playwright（可选，需本机已装或 npx playwright）。
 * 覆盖：AMWH 四组件渲染、三态勾叉色、下载按钮真实点击、PNG/HTML 产物校验、
 *       四主题变量解析、F1-F8 回归断言。
 *
 * 运行：node test/e2e-card.mjs   （需要 Chrome/Chromium）
 *      PLAYWRIGHT_PATH 可指定 playwright 模块路径
 */
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PW);

const { buildCardDocument, CSP } = await import('../lib/cards.js');

const DIR = mkdtempSync(join(tmpdir(), 'dsh-card-e2e-'));

const CARD_CODE = `
<h1>Redis vs Memcached</h1>
<table class="compare">
  <tr><th></th><th>Redis</th><th>Memcached</th></tr>
  <tr><td>数据结构</td><td class="c-yes">✓ 丰富</td><td class="c-no">✗ 仅 KV</td></tr>
  <tr><td>持久化</td><td class="c-yes">✓ RDB/AOF</td><td class="c-no">✗ 无</td></tr>
  <tr><td>多线程</td><td class="c-mid">◐ 6.0 起</td><td class="c-yes">✓</td></tr>
</table>
<div class="verdict">结论：要持久化选 <strong>Redis</strong>；纯缓存选 <strong>Memcached</strong>。</div>
<ol class="seq">
  <li><b>建连</b> — 客户端发起 SYN</li>
  <li><b>握手</b> — 服务端回 SYN+ACK</li>
  <li><b>传输</b> — 全双工帧通信</li>
</ol>
<p>空洞词示范：<span class="flag">赋能闭环</span> → 改为"帮 X 做到 Y"</p>`;

const CARD_PATH = join(DIR, 'card.html');
writeFileSync(CARD_PATH, buildCardDocument({ code: CARD_CODE, theme: 'whale', title: 'Redis vs Memcached' }));

const CHROME = process.env.CHROME_PATH || '/opt/google/chrome/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 900, height: 800 } });
const page = await ctx.newPage();
await page.goto('file://' + CARD_PATH);
await page.waitForTimeout(400);

const results = [];
function check(name, ok, extra) { results.push({ name, ok, extra }); }

// 基础
const bar = page.locator('.dshdl-bar');
check('工具条存在', await bar.count() === 1);
const bb = await bar.boundingBox();
check('工具条右上角 top:8', bb && Math.abs(bb.y - 8) < 1 && bb.x > 500, `y=${bb?.y?.toFixed(1)}`);
check('按钮数=2', await page.locator('.dshdl-btn').count() === 2);

// F3/F4: 去阴影 + opacity .55
const barStyle = await bar.evaluate(el => { const s = getComputedStyle(el); return { shadow: s.boxShadow, radius: s.borderRadius, op: s.opacity }; });
check('F3 无阴影', barStyle.shadow === 'none', barStyle.shadow);
check('F3 radius 4px', barStyle.radius === '4px', barStyle.radius);
check('F4 opacity .55', parseFloat(barStyle.op) >= 0.55, barStyle.op);

// F1: 勾叉列左对齐（扫读竖线恢复）
const align = await page.locator('.compare .c-yes').first().evaluate(el => getComputedStyle(el).textAlign);
check('F1 勾叉列左对齐', align === 'left', align);

// F6: 时序圆点描边式
const dot = await page.locator('.seq li').first().evaluate(el => {
  const s = getComputedStyle(el, '::before');
  return { bg: s.backgroundColor, border: s.borderTopWidth + ' ' + s.borderTopColor, color: s.color };
});
check('F6 圆点透明底', dot.bg === 'rgba(0, 0, 0, 0)', dot.bg);
check('F6 圆点 accent 描边', dot.border === '1px rgb(77, 107, 254)', dot.border);
check('F6 数字用 accent 色', dot.color === 'rgb(77, 107, 254)', dot.color);

// AMWH 组件
check('.compare 可见', await page.locator('table.compare').isVisible());
check('.verdict 可见', await page.locator('.verdict').isVisible());
check('.flag 可见', await page.locator('.flag').isVisible());
const flagBg = await page.locator('.flag').evaluate(el => getComputedStyle(el).backgroundColor);
check('F2 flag 底色走变量', flagBg === 'rgba(139, 44, 31, 0.07)', flagBg);

// 下载
const [dlPng] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.locator('.dshdl-btn').first().click(),
]);
const pngPath = join(DIR, 'out.png');
await dlPng.saveAs(pngPath);
check('PNG 下载触发', true);

// F8: 带空格 title → 文件名空格变 '-'
const fname = dlPng.suggestedFilename();
check('F8 空格转连字符', fname.startsWith('Redis-vs-Memcached-') && !fname.includes(' '), fname);

const [dlHtml] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.locator('.dshdl-btn').nth(1).click(),
]);
const htmlPath = join(DIR, 'out.html');
await dlHtml.saveAs(htmlPath);
check('HTML 下载触发', true);

// 产物校验
const pngStat = statSync(pngPath);
check('PNG 非空且 < 5MB', pngStat.size > 5000 && pngStat.size < 5*1024*1024, `${pngStat.size}B`);
const htmlOut = readFileSync(htmlPath, 'utf8');
check('F5 导出带 DOCTYPE', /^<!DOCTYPE html>/i.test(htmlOut), htmlOut.slice(0, 30));
check('HTML 产物含 compare 表', htmlOut.includes('compare'));
check('HTML 产物无脚本残留', !/<script/.test(htmlOut));
check('HTML 产物无工具条', !htmlOut.includes('dshdl-bar'));
check('HTML 产物无批注弹层元素', !htmlOut.includes('<div class="dshann-modal'));
check('HTML 产物保留批注序号样式', htmlOut.includes('.dshann-mark'));
check('正文仍在', await page.locator('h1').textContent() === 'Redis vs Memcached');

await page.screenshot({ path: join(DIR, 'shot.png'), fullPage: true });

let fail = 0;
for (const r of results) { console.log((r.ok?'  ✅ ':'  ❌ ')+r.name+(r.extra?'  ['+r.extra+']':'')); if(!r.ok) fail++; }
await browser.close();
console.log('\n产物目录:', DIR);
console.log(fail ? `FAIL ${fail}` : 'ALL PASS ' + results.length);
process.exit(fail ? 1 : 0);
