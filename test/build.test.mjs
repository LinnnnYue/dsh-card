/**
 * 构建期契约测试（零依赖，无需浏览器）
 * 运行：node test/build.test.mjs
 */
import { buildCardDocument, CSP } from '../lib/cards.js';
import { listThemes, getTheme, DEFAULT_THEME } from '../lib/themes.js';

let fail = 0;
const results = [];
function check(name, ok, extra) { results.push({ name, ok, extra }); if (!ok) fail++; }

// ── 1. 转义 ───────────────────────────────────────────
const evil = buildCardDocument({ code: 'x', theme: 'whale', title: '<script>alert(1)</script>"&' });
check('title 尖括号转义', !evil.includes('<script>alert(1)</script>'), '');
check('title 引号转义', evil.includes('&quot;') && evil.includes('&amp;'), '');
check('title 进 <title>', evil.includes('<title>&lt;script&gt;'), '');

// ── 2. 四主题变量完备 ──────────────────────────────────
const REQUIRED = ['--bg', '--bg-card', '--accent', '--accent-light', '--text',
                  '--text-muted', '--text-secondary', '--border', '--table-head',
                  '--green', '--danger', '--danger-light'];
for (const t of listThemes()) {
  const v = getTheme(t.id).vars;
  const missing = REQUIRED.filter(k => !v[k]);
  check(`主题 ${t.id} 变量完备`, missing.length === 0, missing.join(','));
}

// ── 3. AMWH 组件 CSS 存在 ──────────────────────────────
const doc = buildCardDocument({ code: 'x', theme: 'whale', title: 't' });
for (const sel of ['.compare', '.c-yes', '.c-no', '.c-mid', '.verdict', '.seq', '.flag']) {
  check(`CSS 含 ${sel}`, doc.includes(sel), '');
}
check('.flag 走变量', doc.includes('var(--danger-light'), '');
check('.seq 描边式圆点', doc.includes('border: 1px solid var(--accent)'), '');

// ── 4. 下载脚本完整性 ──────────────────────────────────
for (const marker of ['dshdl-bar', 'data-dshdl', '下载为 PNG', '下载为 HTML',
                      'cleanedClone', 'DOCTYPE', 'foreignObject']) {
  check(`下载脚本含 ${marker}`, doc.includes(marker), '');
}
const dlScript = doc.match(/<script>\n\(function\(\)\{\n  function el\([\s\S]*?\}\)\(\);\n<\/script>/);
check('下载脚本可提取', !!dlScript, '');
if (dlScript) {
  try { new Function(dlScript[0].replace(/^<script>/, '').replace(/<\/script>$/, '')); check('下载脚本语法有效', true, ''); }
  catch (e) { check('下载脚本语法有效', false, e.message); }
}

// ── 5. 其他脚本保留 ────────────────────────────────────
check('批注脚本存在', doc.includes('dsh.card-annotate'), '');
check('高度脚本存在', doc.includes('dsh.card-resize'), '');
check('CSP 非空且含 sandbox', CSP.includes('sandbox') && CSP.includes('default-src'), '');

// ── 6. 默认主题 ────────────────────────────────────────
check('默认主题存在', !!getTheme(DEFAULT_THEME).vars, DEFAULT_THEME);
check('未知主题回落', !!getTheme('nonexistent').vars, '');

for (const r of results) console.log((r.ok ? '  ✅ ' : '  ❌ ') + r.name + (r.extra ? '  [' + r.extra + ']' : ''));
console.log(fail ? `\nFAIL ${fail}` : `\nALL PASS ${results.length}`);
process.exit(fail ? 1 : 0);
