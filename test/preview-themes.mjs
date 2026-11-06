/**
 * 四主题预览图生成（用于视觉复检，不进 CI）
 * 运行：node test/preview-themes.mjs [输出目录]
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { buildCardDocument } = await import('../lib/cards.js');
const { listThemes } = await import('../lib/themes.js');

const OUT = process.argv[2] || 'preview';
mkdirSync(OUT, { recursive: true });

const CODE = `
<h1>AMWH 组件四主题校验</h1>
<table class="compare">
  <tr><th></th><th>方案 A</th><th>方案 B</th></tr>
  <tr><td>速度</td><td class="c-yes">✓ 快 3 倍</td><td class="c-no">✗ 慢</td></tr>
  <tr><td>成本</td><td class="c-mid">◐ 持平</td><td class="c-yes">✓ 更低</td></tr>
</table>
<div class="verdict">结论：<strong>先测再选</strong>，别凭感觉。</div>
<ol class="seq">
  <li><b>准备</b> — 固定输入与验收标准</li>
  <li><b>双跑</b> — 带 / 不带各 3 次</li>
  <li><b>裁决</b> — 质量、耗时、补救三判据</li>
</ol>
<p>坏词示范：<span class="flag">赋能闭环</span> → 改为"帮 X 做到 Y"</p>`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome',
  args: ['--no-sandbox'],
});
const page = await (await browser.newContext({ viewport: { width: 900, height: 720 } })).newPage();

for (const t of listThemes()) {
  const name = 'theme-' + t.id + '.html';
  writeFileSync(join(OUT, name), buildCardDocument({ code: CODE, theme: t.id, title: 'preview_' + t.id }));
  await page.goto('file://' + resolve(OUT, name));
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, 'theme-' + t.id + '.png') });
  const v = await page.locator('.verdict').evaluate(el => getComputedStyle(el).backgroundColor);
  const g = await page.locator('.c-yes').first().evaluate(el => getComputedStyle(el).color);
  const fg = await page.locator('.flag').evaluate(el => getComputedStyle(el).backgroundColor);
  console.log(t.id.padEnd(7), 'verdict:', v.padEnd(28), 'c-yes:', g.padEnd(18), 'flag:', fg);
}
await browser.close();
console.log('\n预览图已写入', OUT + '/');
