/* cards.js 由 _cards_p1.js + _cards_p3.js + _cards_p2.js 按序拼接而成：
   p1 = imports + CSP + createCardStore + sanitizeVars
   p3 = BASE_CSS / HEIGHT_SCRIPT 常量（const 必须先于使用方定义）
   p2 = buildCardDocument（引用 BASE_CSS / HEIGHT_SCRIPT）*/

/**
 * cards.js —— 卡片 HTML 的包装与缓存
 *
 * 为什么需要服务端包壳：iframe 必须从真实 http origin 加载，才能拿到
 * 自己的 CSP 上下文，让内联脚本（高度上报、卡片内交互）得以执行。
 * srcdoc/blob 会继承父页面的 script-src 'self'，脚本被静默阻断。
 *
 * 生命周期：落盘到 ~/.dsh/card-store/，重启后仍可取回，不再因 LRU 清空而失效。
 * 超过 512 张时按 mtime 淘汰最旧的。
 */

import { getTheme } from './themes.js'

const MAX_CODE_BYTES = 512 * 1024
const CARD_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

/* CSP：卡片可跑内联脚本换高度，但断网、断子框架、断表单、断导航 */
export const CSP = [
  "default-src 'none'",
  'sandbox allow-scripts',
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "navigate-to 'none'",
].join('; ')

import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/* 卡片落盘目录：重启后仍能取到，不再因为 LRU 清空而失效 */
const CARD_DIR = join(homedir(), '.dsh', 'card-store')
const MAX_CARDS = 512

function ensureDir() {
  try { mkdirSync(CARD_DIR, { recursive: true }) } catch (e) {}
}

function cardPath(cardId) {
  return join(CARD_DIR, cardId + '.json')
}

export function createCardStore() {
  ensureDir()

  function put(cardId, entry) {
    if (!CARD_ID_RE.test(cardId)) return { ok: false, error: 'invalid cardId' }
    const code = String(entry.code || '')
    if (!code) return { ok: false, error: 'code required' }
    if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
      return { ok: false, error: 'code too large' }
    }
    const record = {
      cardId,
      code,
      title: String(entry.title || ''),
      theme: String(entry.theme || ''),
      savedAt: Date.now(),
    }
    try {
      writeFileSync(cardPath(cardId), JSON.stringify(record), 'utf8')
    } catch (e) {
      return { ok: false, error: 'write failed: ' + e.message }
    }
    prune()
    return { ok: true }
  }

  function get(cardId) {
    if (!CARD_ID_RE.test(cardId)) return null
    try {
      const raw = readFileSync(cardPath(cardId), 'utf8')
      const rec = JSON.parse(raw)
      if (!rec || typeof rec.code !== 'string') return null
      return { code: rec.code, title: rec.title || '', theme: rec.theme || '' }
    } catch (e) {
      return null
    }
  }

  /* 超过上限时按 mtime 删最旧的 */
  function prune() {
    try {
      const files = readdirSync(CARD_DIR).filter(function (f) { return f.endsWith('.json') })
      if (files.length <= MAX_CARDS) return
      const stats = []
      for (const f of files) {
        try {
          const fp = join(CARD_DIR, f)
          stats.push({ f: f, m: statSync(fp).mtimeMs })
        } catch (e) {}
      }
      stats.sort(function (a, b) { return a.m - b.m })
      const drop = stats.slice(0, stats.length - MAX_CARDS)
      for (const d of drop) {
        try { unlinkSync(join(CARD_DIR, d.f)) } catch (e) {}
      }
    } catch (e) {}
  }

  function size() {
    try {
      return readdirSync(CARD_DIR).filter(function (f) { return f.endsWith('.json') }).length
    } catch (e) {
      return 0
    }
  }

  return { put, get, size }
}

/* 剥掉尖括号，杜绝 varsCss 里出现 </style> 逃逸 */
function sanitizeVars(varsObj) {
  const out = []
  for (const k of Object.keys(varsObj || {})) {
    const name = String(k).replace(/[<>]/g, '')
    const val = String(varsObj[k]).replace(/[<>]/g, '')
    if (name && val) out.push('  ' + name + ': ' + val + ';')
  }
  return out.join('\n')
}

/* 静态样式：reset + 排版规则（设计手册 §4/§6） */
const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { background: var(--bg-card); color: var(--text); scrollbar-width: none; }
html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0; height: 0; }
body { padding: 12px 16px; font-family: var(--font-serif); font-size: 14px; line-height: 1.65; }

/* 标题：字重只用 400/500，600 仅指标值 */
h1 { font-size: 1.35rem; font-weight: 500; line-height: 1.25; margin: 0 0 0.6em; color: var(--text); }
h2 { font-size: 1.1rem; font-weight: 500; line-height: 1.3; margin: 0.9em 0 0.45em; color: var(--text);
     border-left: 2px solid var(--accent); padding-left: 8px; }
h3 { font-size: 0.95rem; font-weight: 500; line-height: 1.35; margin: 0.7em 0 0.35em; color: var(--text); }
p { margin: 0.45em 0; font-size: 0.9rem; line-height: 1.65; }
small { font-size: 0.75rem; color: var(--text-muted); line-height: 1.3; }
strong { font-weight: 500; color: var(--accent); }
a { color: var(--link); text-decoration: none; }
a:hover { color: var(--link-hover); }
hr { border: none; border-top: 0.5px solid var(--border); margin: 0.8em 0; }

/* 表格 */
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: 0.6em 0; }
th { text-align: left; font-weight: 500; color: var(--text-secondary); padding: 6px 8px;
     border-bottom: 1px solid var(--border); background: var(--table-head); }
td { padding: 5px 8px; border-bottom: 0.5px solid var(--border); color: var(--text); }
tr:last-child td { border-bottom: none; }

/* 列表 */
ul, ol { padding-left: 18px; margin: 0.4em 0; }
li { margin: 0.15em 0; font-size: 0.9rem; }
li::marker { color: var(--accent); }

/* 代码 */
pre { background: var(--inline-code-bg); border: 0.5px solid var(--border); border-radius: 4px;
      padding: 8px 12px; overflow-x: auto; margin: 0.5em 0; }
code { font-family: var(--font-mono); font-size: 0.82rem; color: var(--text); }

/* 引用 */
blockquote { border-left: 2px solid var(--accent); padding: 4px 0 4px 12px;
             color: var(--text-muted); font-style: italic; margin: 0.5em 0; }

/* 卡片 / 徽章 / 指标 —— 供 agent 直接用 */
.card { background: var(--bg-card); border: 0.5px solid var(--border); border-radius: 4px;
        padding: 1rem 1.25rem; }
.metric { display: inline-block; min-width: 72px; margin: 0 20px 12px 0; vertical-align: top; }
.metric-value { font-size: 1.6rem; font-weight: 600; line-height: 1.15; color: var(--accent);
                font-variant-numeric: tabular-nums; }
.metric-label { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
         font-size: 0.75rem; font-weight: 500; border-radius: 4px;
         background: var(--accent-light); color: var(--accent-hover); margin: 2px 4px 2px 0; }
.badge-blue { background: var(--accent-tertiary); color: var(--accent); }
.badge-warm { background: rgba(157,95,77,0.08); color: var(--ochre); }
.grid { display: grid; gap: 12px; }
.grid-2 { grid-template-columns: repeat(2, 1fr); }
.grid-3 { grid-template-columns: repeat(3, 1fr); }
.grid-4 { grid-template-columns: repeat(4, 1fr); }
.muted { color: var(--text-muted); font-size: 0.75rem; }

/* SVG */
svg { display: block; width: 100%; max-width: 100%; }
svg text { font-family: var(--font-serif); }
`;

/* 高度上报：内容变化时通知宿主调整 iframe 高度 */
const HEIGHT_SCRIPT = `<script>
(function(){
  var NS='dsh.card-resize'; var last=0;
  function report(){
    var h=document.documentElement.scrollHeight;
    if(h!==last){ last=h; window.parent.postMessage({type:NS,height:h},'*'); }
  }
  if(document.readyState==='complete') report(); else window.addEventListener('load',report);
  new ResizeObserver(function(){report()}).observe(document.body);
  window.addEventListener('message',function(e){ if(e.data==='dsh.card-ping'){last=0;report()} });
})();
</script>`;

/* 批注：卡片内选区 -> 浮出按钮 -> 序号标签 -> postMessage */

/* 批注：卡片内选区 -> 浮出按钮 -> 序号内联插入 -> postMessage */
const ANNOTATE_SCRIPT = "<script>\n(function(){\n  var NS_ADD='dsh.card-annotate';\n  var store=[];\n  var seq=0;\n  var btn=null, modal=null, mask=null, currentSel=null;\n  var pendingAnchor=null;\n\n  var T = {\n    annotate: '批注',\n    annotateTitle: '为选中的内容写一条批注',\n    add: '添加批注',\n    edit: '编辑批注',\n    quoteLabel: '批注的是哪句话',\n    placeholder: '写下批注…（可留空，保存后仅标记原文）',\n    save: '保存批注',\n    del: '删除这条批注',\n    cancel: '取消'\n  };\n\n  function css(){\n    var s=document.createElement('style');\n    s.textContent = [\n      '.dshann-btn{position:fixed;z-index:2147483000;display:none;align-items:center;gap:4px;padding:4px 10px;font:500 12px/1.4 var(--font-ui,system-ui);cursor:pointer;background:var(--accent,#4d6bfe);color:#fff;border:0;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.16);}',\n      '.dshann-btn:hover{opacity:.9;}',\n      '.dshann-mask{position:fixed;inset:0;z-index:2147483099;background:rgba(0,0,0,.32);}',\n      '.dshann-modal{position:fixed;z-index:2147483100;left:50%;top:50%;transform:translate(-50%,-50%);width:440px;max-width:calc(100vw - 32px);display:flex;flex-direction:column;gap:12px;padding:18px;background:var(--bg-card,#fff);border:1px solid var(--border,#e7ecf7);border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.18);}',\n      '.dshann-head{display:flex;align-items:center;justify-content:space-between;}',\n      '.dshann-title{font:500 14px/1.4 var(--font-ui,system-ui);color:var(--text,#0f1115);}',\n      '.dshann-x{width:24px;height:24px;padding:0;font:400 18px/22px system-ui;cursor:pointer;border:0;background:transparent;color:var(--text-muted,#81858c);border-radius:4px;}',\n      '.dshann-x:hover{background:rgba(127,127,127,.12);}',\n      '.dshann-field{display:flex;flex-direction:column;gap:6px;}',\n      '.dshann-label{font:400 12px/1.4 var(--font-ui,system-ui);color:var(--text-muted,#81858c);}',\n      '.dshann-quote{font:400 13px/1.6 var(--font-ui,system-ui);color:var(--text,#0f1115);background:var(--bg,#fafbff);border:1px solid var(--border,#e7ecf7);border-radius:4px;padding:8px 10px;max-height:88px;overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere;}',\n      '.dshann-input{width:100%;box-sizing:border-box;resize:vertical;min-height:88px;padding:8px 10px;font:400 13px/1.6 var(--font-ui,system-ui);color:var(--text,#0f1115);background:var(--bg,#fafbff);border:1px solid var(--border,#e7ecf7);border-radius:4px;outline:none;}',\n      '.dshann-input:focus{border-color:var(--accent,#4d6bfe);}',\n      '.dshann-row{display:flex;gap:8px;justify-content:flex-end;align-items:center;}',\n      '.dshann-spacer{flex:1;}',\n      '.dshann-ok{padding:6px 14px;font:500 13px/1.4 var(--font-ui,system-ui);cursor:pointer;border-radius:4px;border:1px solid var(--accent,#4d6bfe);background:var(--accent,#4d6bfe);color:#fff;}',\n      '.dshann-ok:hover{opacity:.9;}',\n      '.dshann-no{padding:6px 14px;font:500 13px/1.4 var(--font-ui,system-ui);cursor:pointer;border-radius:4px;border:1px solid var(--border,#e7ecf7);background:transparent;color:var(--text-muted,#81858c);}',\n      '.dshann-no:hover{background:rgba(127,127,127,.08);}',\n      '.dshann-del{padding:6px 12px;font:500 13px/1.4 var(--font-ui,system-ui);cursor:pointer;border-radius:4px;border:1px solid rgba(224,75,75,.4);background:transparent;color:#e04b4b;}',\n      '.dshann-del:hover{background:rgba(224,75,75,.08);}',\n      '.dshann-mark{display:inline-block;vertical-align:super;margin:0 1px;min-width:16px;height:16px;padding:0 4px;font:500 10px/16px var(--font-ui,system-ui);text-align:center;cursor:pointer;background:var(--accent,#4d6bfe);color:#fff;border-radius:3px;}',\n      '.dshann-mark:hover{opacity:.85;}'\n    ].join('');\n    document.head.appendChild(s);\n  }\n\n  function el(tag, cls, txt){\n    var e=document.createElement(tag);\n    if(cls) e.className=cls;\n    if(txt!==undefined) e.textContent=txt;\n    return e;\n  }\n\n  function hide(){ if(btn) btn.style.display='none'; }\n\n  function dropPending(){\n    if(pendingAnchor){\n      try{ if(pendingAnchor.parentNode) pendingAnchor.parentNode.removeChild(pendingAnchor); }catch(e){}\n      pendingAnchor=null;\n    }\n  }\n\n  function closeModal(){\n    if(modal){ try{ modal.remove(); }catch(e){} modal=null; }\n    if(mask){ try{ mask.remove(); }catch(e){} mask=null; }\n  }\n\n  // 关键：mouseup 时立刻把占位符插进选区起点，位置就此钉死\n  function captureSelection(){\n    var sel=window.getSelection();\n    if(!sel||sel.isCollapsed||sel.rangeCount===0) return null;\n    var t=String(sel).trim();\n    if(!t) return null;\n    var r=sel.getRangeAt(0);\n    var rect=r.getBoundingClientRect();\n    if(rect.width===0&&rect.height===0) return null;\n\n    dropPending();\n\n    var holder=null;\n    try{\n      var rp=r.cloneRange();\n      rp.collapse(true);\n      holder=document.createElement('span');\n      holder.className='dshann-anchor';\n      holder.style.display='none';\n      rp.insertNode(holder);\n      pendingAnchor=holder;\n    }catch(e){\n      holder=null;\n    }\n\n    return { text:t, rect:rect, holder:holder };\n  }\n\n  function placeBtn(rect){\n    if(!btn) return;\n    var top=rect.top-32;\n    if(top<8) top=rect.bottom+4;\n    btn.style.left=Math.min(window.innerWidth-110, Math.max(8, rect.left))+'px';\n    btn.style.top=top+'px';\n    btn.style.display='flex';\n  }\n\n  function openModal(sel, editItem, editIdx){\n    closeModal();\n    hide();\n\n    mask=el('div','dshann-mask');\n    document.body.appendChild(mask);\n\n    var box=el('div','dshann-modal');\n    var head=el('div','dshann-head');\n    head.appendChild(el('div','dshann-title', editItem ? T.edit : T.add));\n    var x=el('button','dshann-x','×'); x.type='button';\n    head.appendChild(x);\n\n    var f1=el('div','dshann-field');\n    f1.appendChild(el('div','dshann-label', T.quoteLabel));\n    f1.appendChild(el('div','dshann-quote', sel ? sel.text : (editItem ? editItem.quote : '')));\n\n    var f2=el('div','dshann-field');\n    var ta=el('textarea','dshann-input');\n    ta.placeholder=T.placeholder;\n    if(editItem) ta.value=editItem.note||'';\n    f2.appendChild(ta);\n\n    var row=el('div','dshann-row');\n    if(editItem){\n      var del=el('button','dshann-del', T.del); del.type='button';\n      row.appendChild(del);\n    }\n    row.appendChild(el('div','dshann-spacer'));\n    var no=el('button','dshann-no', T.cancel); no.type='button';\n    var ok=el('button','dshann-ok', T.save); ok.type='button';\n    row.appendChild(no); row.appendChild(ok);\n\n    box.appendChild(head);\n    box.appendChild(f1);\n    box.appendChild(f2);\n    box.appendChild(row);\n    document.body.appendChild(box);\n    modal=box;\n\n    setTimeout(function(){ ta.focus(); }, 30);\n\n    function close(){ closeModal(); }\n    x.addEventListener('click', close);\n    no.addEventListener('click', close);\n    mask.addEventListener('click', close);\n\n    ok.addEventListener('click', function(){\n      var v=ta.value.trim();\n      if(editItem){\n        editItem.note=v;\n        var mk=document.querySelector('.dshann-mark[data-dshann=\"'+editItem.n+'\"]');\n        if(mk) mk.setAttribute('title', (v||'仅标记原文')+'（点击修改）');\n        close();\n        window.parent.postMessage({ type:'dsh.card-annotate-sync', list:store }, '*');\n      } else {\n        commitNote(sel, v);\n        close();\n      }\n    });\n\n    if(editItem){\n      del.addEventListener('click', function(){\n        store.splice(editIdx,1);\n        var mk=document.querySelector('.dshann-mark[data-dshann=\"'+editItem.n+'\"]');\n        if(mk) mk.remove();\n        close();\n        window.parent.postMessage({ type:'dsh.card-annotate-sync', list:store }, '*');\n      });\n    }\n\n    ta.addEventListener('keydown', function(e){\n      if(e.key==='Escape') close();\n      if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) ok.click();\n    });\n  }\n\n  // 用占位符换出真正的序号，位置精确\n  function commitNote(sel, note){\n    seq+=1;\n    var n=seq;\n    store.push({ n:n, text:note||'', quote:sel.text });\n\n    var mk=el('span','dshann-mark',String(n));\n    mk.setAttribute('data-dshann', String(n));\n    mk.setAttribute('title', (note||'仅标记原文')+'（点击修改）');\n    mk.addEventListener('click', function(ev){\n      ev.stopPropagation(); ev.preventDefault();\n      openEdit(n);\n    });\n\n    var placed=false;\n    if(sel.holder && sel.holder.parentNode){\n      try{\n        sel.holder.parentNode.replaceChild(mk, sel.holder);\n        placed=true;\n      }catch(e){}\n    }\n    if(!placed){\n      // 占位符失效：退回到用 range 现插一次\n      try{\n        var s2=window.getSelection();\n        if(s2&&s2.rangeCount>0){\n          var r2=s2.getRangeAt(0).cloneRange();\n          r2.collapse(true);\n          r2.insertNode(mk);\n          placed=true;\n        }\n      }catch(e){}\n    }\n    if(!placed){\n      try{ document.body.appendChild(mk); }catch(e){}\n    }\n\n    if(pendingAnchor===sel.holder) pendingAnchor=null;\n\n    window.parent.postMessage({ type:NS_ADD, n:n, note:note||'', quote:sel.text }, '*');\n  }\n\n  function openEdit(n){\n    var item=null, idx=-1;\n    for(var i=0;i<store.length;i++){ if(store[i].n===n){ item=store[i]; idx=i; break; } }\n    if(!item) return;\n    openModal(null, item, idx);\n  }\n\n  function onDown(e){\n    if(!e.target||!e.target.closest) return;\n    if(e.target.closest('.dshann-mark')) return;\n    if(e.target.closest('.dshann-modal')) return;\n    if(e.target.closest('.dshann-mask')) return;\n    if(btn&&btn.contains(e.target)) return;\n    hide();\n  }\n\n  css();\n  btn=el('button','dshann-btn',T.annotate);\n  btn.type='button';\n  btn.setAttribute('title', T.annotateTitle);\n  document.body.appendChild(btn);\n\n  btn.addEventListener('click', function(ev){\n    ev.stopPropagation(); ev.preventDefault();\n    if(!currentSel) return;\n    openModal(currentSel, null, -1);\n  });\n\n  document.addEventListener('mouseup', function(){\n    var s=captureSelection();\n    if(s){ currentSel=s; placeBtn(s.rect); }\n    else { currentSel=null; hide(); }\n  });\n\n  document.addEventListener('mousedown', onDown);\n\n  document.addEventListener('selectionchange', function(){\n    var sel=window.getSelection();\n    if(!sel||sel.isCollapsed||sel.rangeCount===0) hide();\n  });\n\n  window.addEventListener('message', function(e){\n    try{\n      if(e.data&&e.data.type==='dsh.card-annotate-remove'){\n        var n2=e.data.n;\n        for(var i=store.length-1;i>=0;i--){ if(store[i].n===n2){ store.splice(i,1); break; } }\n        var mks=document.querySelectorAll('.dshann-mark[data-dshann=\"'+n2+'\"]');\n        for(var j=0;j<mks.length;j++) mks[j].remove();\n      }\n    }catch(err){}\n  });\n})();\n</script>"

export function buildCardDocument({ code, theme }) {
  const t = getTheme(theme)
  const varsCss = sanitizeVars(t.vars)

  return '<!DOCTYPE html>\n<html>\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<style>\n' +
    ':root {\n' + varsCss + '\n' +
    "  --font-serif: 'EB Garamond', 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', serif;\n" +
    "  --font-ui: system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;\n" +
    "  --font-mono: 'JetBrains Mono', ui-monospace, Consolas, monospace;\n" +
    '}\n' +
    BASE_CSS +
    '</style>\n</head>\n<body>\n' +
    String(code || '') + '\n' +
    ANNOTATE_SCRIPT + '\n' +
    HEIGHT_SCRIPT +
    '\n</body>\n</html>'
}
