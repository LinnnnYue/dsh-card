window.__ModuleLoader__.load({
  id: 'dsh-card',
  factory: (require) => {

    /*
     * dsh-card - browser side iframe renderer (replaces dsh-genui card duty)
     *
     * data flow: show_card result -> presentationMeta.dshCard -> turn data -> turnTail card
     *            iframe ResizeObserver reports height -> host sets explicit height (cap 900)
     *
     * why src not srcdoc: srcdoc inherits parent script-src self CSP,
     * inline scripts (height report + interaction) get silently blocked.
     *
     * ── 0.2.1-rc.2 适配说明 ──
     * 本文件按 DSH 0.2.1-rc.2 的真实架构编写（依据 app.asar 内官方插件反证）：
     *   1. 服务名是 uiConversation（含 .events.register），不是 conversationEvents
     *      —— 后者在本版本不存在，inject 它会让 web boot 永久 pending 直至崩溃。
     *   2. 正文节点用 conversation.chat.turnTail slot（id 而非 key），
     *      不是 conversation.chat.node —— 后者在本版本不存在。
     *      turnTail 天然只在 turn 关闭时渲染，不需要旧的 turn/end + displayReady 机制。
     *   3. tool.call.toolview 的 owner props 形状变了：phase/block 在 props.call 上。
     * 参考先例：@deepseek-ai/dsh-client-ui-deliverables / dsh-client-ui-plan（asar 内源码）。
     */

    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    /*
     * 诊断探针（2026-10-23 21:2x 加固）
     * 走 console.error 而非 info：宿主的崩溃报告只收 error 级别，
     * 这样 factory 抛错时能在 crash log 的 renderer console 段留下确切位置。
     * 若崩溃报告里一条 [dsh-card] 都没有 ⇒ 模块从未 materialize（boot graph 层），
     * 不是 factory 抛错。
     */
    const diag = (m, e) => {
      try {
        console.error('[dsh-card] ' + m + (e === undefined ? '' : ' :: ' + String((e && e.stack) || e)))
      } catch {}
    }
    diag('factory entered')

    // React 加固：拿不到就用同形桩，绝不让 factory 抛错炸掉整个 web boot
    let React = null
    try {
      React = require('react')
      diag('react loaded, keys=' + (React ? Object.keys(React).slice(0, 10).join(',') : 'null'))
    } catch (err) {
      diag('require(react) FAILED', err)
      React = null
    }
    if (!React || typeof React.createElement !== 'function') {
      diag('react unusable, installing inert stub')
      const noop = function () {}
      React = {
        createElement: function () { return null },
        useRef: function () { return { current: null } },
        useState: function (v) { return [v, noop] },
        useMemo: function (f) { try { return f() } catch (e) { return undefined } },
        useCallback: function (f) { return f },
        useEffect: noop,
        Component: class { constructor(p) { this.props = p; this.state = {} } render() { return null } },
        Fragment: 'fragment',
      }
    }

    const h = React.createElement

    // ── 常量 ──────────────────────────────────────────────
    const NS = 'dsh-card'
    const TOOL_NAME = 'show_card'
    const HEIGHT_CAP = 900
    const RESIZE_TYPE = 'dsh.card-resize'
    const PING_MESSAGE = 'dsh.card-ping'
    const CARD_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
    // 卡片载入后多久没收到高度上报就做一次兜底探测（LRU 淘汰 / 服务重启）
    const RESIZE_TIMEOUT = 2000
    // turnTail 上本方卡片的唯一 id（slot 注册用，keyed 语义不适用于 turnTail）
    const TAIL_ID = 'dsh-card'
    // 事件定义 kind，同时是 turn.data 上的存取键
    const EVENT_KIND = 'dshCard'
    const MAX_RECORDS = 32

    // 宿主注入 iframe 的主题 CSS 变量（照 InteractiveCard.collectThemeVars）。
    // 主题最终由 lib/cards.js 的 getTheme 决定，这里只是让 PUT 侧知道
    // 宿主当前的观感，缺项时服务端回落到默认主题。
    const THEME_VARS = [
      '--bg', '--bg-card', '--bg-sunken',
      '--text', '--text-secondary', '--text-muted',
      '--border',
      '--accent', '--accent-hover', '--accent-light',
      '--link', '--link-hover',
      '--table-head', '--chip', '--bubble',
    ]

    // ── 样式注入（照 genui 的 style tag 模式，不依赖构建产物） ──

    // 2026-10-26 修：外壳配色与卡片内层 dark 主题对齐，不再吃宿主的浅色变量。
    //
    // 原因：外壳原先用 --dsw-alias-bg-layer-1，宿主浅色下该值 = var(--dsw-static-neutral-bluish-00)
    //   即近白 #f7f9ff；而内层 iframe 用 dsh-card 自己的主题（默认已改 dark #1a1d23）。
    //   两套配色体系不同源 → 「白框套深内容」，深色界面里白框刺眼、灰字看不清。
    // 现在：外壳固定跟随 dark 主题（--bg-card #22262e / --border #323842 / 文字 #e6e9ef 系），
    //   与 lib/themes.js 里 dark 的取值保持同步。若日后改 dark 主题，这里要一起改。
    const CSS = [
      '.dsh-card-root{display:block;width:100%;min-width:0;}',
      '.dsh-card-frame{position:relative;width:100%;min-height:96px;overflow:hidden;',
      'border-radius:8px;border:0.5px solid #323842;',
      'background:#22262e;}',
      '.dsh-card-frame[data-scroll="true"]{overflow-y:auto;}',
      '.dsh-card-frame>iframe{display:block;width:100%;height:100%;border:0;}',
      '.dsh-card-fallback{margin:8px 0;padding:12px;border-radius:8px;',
      'background:#22262e;',
      'color:#a8b0be;',
      'font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;}',
      '.dsh-card-hint{display:block;font-size:12px;line-height:1.5;',
      'color:#8b93a1;}',
      '.dsh-card-notes{margin-top:8px;display:flex;flex-direction:column;gap:4px;}',,
      '.dsh-card-note{display:flex;gap:8px;align-items:flex-start;font-size:12px;',
      'line-height:1.6;color:#a8b0be;}',,
      '.dsh-card-note-n{flex:none;min-width:20px;height:16px;padding:0 4px;',
      'font:500 10px/16px system-ui;text-align:center;border-radius:2px;',
      'background:#6b8aff;color:#fff;}',,
      '.dsh-card-note-t{flex:1;min-width:0;overflow-wrap:anywhere;}',
      '.dsh-card-note-edit,.dsh-card-note-del{flex:none;margin-left:4px;padding:0 6px;',
      'font:500 10px/16px system-ui;cursor:pointer;border:1px solid #323842;',
      'border-radius:2px;background:transparent;color:#8b93a1;}',
      '.dsh-card-note-edit:hover,.dsh-card-note-del:hover{color:#6b8aff;',
      'border-color:#6b8aff;}',
      '.dsh-card-editor{position:fixed;z-index:2147483100;display:flex;flex-direction:column;gap:8px;' +
      'padding:10px;background:#22262e;' +
      'border:1px solid #323842;border-radius:2px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.14);min-width:320px;max-width:360px;}',
      '.dsh-card-editor-label{font:500 12px/1.5 system-ui;color:#a8b0be;}',
      '.dsh-card-editor-input{width:100%;box-sizing:border-box;min-height:64px;padding:6px 8px;' +
      'font:400 13px/1.6 system-ui;color:#e6e9ef;' +
      'background:#1a1d23;border:1px solid #323842;' +
      'border-radius:2px;outline:none;resize:vertical;}',
      '.dsh-card-editor-row{display:flex;gap:6px;justify-content:flex-end;}',
      '.dsh-card-editor-cancel,.dsh-card-editor-save{padding:3px 12px;font:500 12px/1.6 system-ui;' +
      'cursor:pointer;border-radius:2px;border:1px solid #323842;background:transparent;}',
      '.dsh-card-editor-save{background:#6b8aff;color:#fff;' +
      'border-color:#6b8aff;}',
      '.dsh-card-sendbar{margin-top:10px;display:flex;align-items:center;gap:10px;',
      'padding-top:8px;border-top:1px solid #323842;},',
      '.dsh-card-sendcount{font-size:12px;color:#8b93a1;},',
      '.dsh-card-sendbtn{padding:3px 12px;font:500 12px/1.6 system-ui;cursor:pointer;',
      'border:0;border-radius:2px;background:#6b8aff;color:#fff;},',
      '.dsh-card-sendbtn:hover{opacity:.88;},',
      '.dsh-card-node{display:block;width:100%;min-width:0;}',
    ].join('')


    var annotateEnterBound = false
    var cardRuntimeRef = null

    const CSS_TAG_ID = 'dsh-card/client.css'

    function ensureCss() {
      if (typeof document === 'undefined') return
      const selector = 'style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']'
      if (document.querySelector(selector) !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = NS
      tag.dataset.pluginCss = CSS_TAG_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    function collectThemeVars() {
      if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return {}
      const root = getComputedStyle(document.documentElement)
      const out = {}
      for (const name of THEME_VARS) {
        const val = root.getPropertyValue(name).trim()
        if (val) out[name] = val
      }
      return out
    }

    // ── 工具结果解析 ──────────────────────────────────────

    /** 把 content blocks 拍平成文本：text 原样，其他形状走 JSON。 */
    function textOf(block) {
      const parts = []
      const content = block && block.content
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part && part.type === 'text' && typeof part.text === 'string') parts.push(part.text)
          else parts.push(JSON.stringify(part, null, 2))
        }
      }
      if (parts.length === 0 && block && block.error) {
        parts.push(block.error.name + ': ' + block.error.code)
      }
      return parts.join('\n')
    }

    /** 宽松 JSON：失败返回 null，绝不抛。 */
    function looseJson(text) {
      try { return JSON.parse(text) } catch { return null }
    }

    /** 从任意对象里按优先级抠 cardId。 */
    function pickCardId(obj) {
      if (!obj || typeof obj !== 'object') return null
      for (const key of ['cardId', 'card_id', 'id']) {
        const val = obj[key]
        if (typeof val === 'string' && CARD_ID_RE.test(val)) return val
      }
      // 形如 { card: { id } } / { data: { cardId } } 的嵌套
      for (const key of ['card', 'data', 'result', 'payload']) {
        const nested = pickCardId(obj[key])
        if (nested) return nested
      }
      return null
    }

    /** 从 tool result 文本里抠 cardId，兼容多种宿主半的输出形状。 */
    function extractCardId(block) {
      if (!block) return null
      // 1) presentationMeta（工具侧可显式发布）
      const fromMeta = pickCardId(block.meta)
      if (fromMeta) return fromMeta

      const text = textOf(block)
      if (!text) return null

      // 2) 整段是 JSON
      const whole = looseJson(text)
      if (whole) {
        const id = pickCardId(whole)
        if (id) return id
      }

      // 3) 逐行尝试 JSON + 键值对 + URL 片段
      const patterns = [
        /"card[_-]?id"\s*:\s*"([A-Za-z0-9_-]{1,128})"/i,
        /"id"\s*:\s*"([A-Za-z0-9_-]{1,128})"/i,
        /card[_-]?id\s*[=:]\s*["']?([A-Za-z0-9_-]{1,128})/i,
        /\/card\/([A-Za-z0-9_-]{1,128})/,
      ]
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        const json = looseJson(trimmed)
        if (json) {
          const id = pickCardId(json)
          if (id) return id
        }
        for (const re of patterns) {
          const m = re.exec(trimmed)
          if (m && CARD_ID_RE.test(m[1])) return m[1]
        }
      }

      // 4) 兜底：独占一行、形状像 id 的 token
      for (const line of text.split('\n')) {
        const t = line.trim()
        if (t.length >= 6 && CARD_ID_RE.test(t) && !/\s/.test(t)) return t
      }
      return null
    }

    /** 取本次调用的参数对象（result 阶段在 block.call 上，start 阶段在 block 上）。 */
    function callArgsOf(block) {
      if (!block) return {}
      const raw = block.call ? block.call.argsRaw : block.argsRaw
      if (typeof raw !== 'string' || raw === '') return {}
      const parsed = looseJson(raw)
      if (parsed && typeof parsed === 'object') return parsed
      return {}
    }

    // ── 注册去重 ──────────────────────────────────────────
    // 会话内同一 cardId 只 PUT 一次；历史回放（LRU 已被淘汰或服务重启）
    // 时靠这次 PUT 把卡片重新灌回内存，与 HanaAgent 的行为一致。
    const registered = new Set()

    async function ensureRegistered(cardId, args) {
      if (registered.has(cardId)) return
      registered.add(cardId)
      const body = {
        code: String(args.code || ''),
        title: String(args.title || ''),
        theme: String(args.theme || ''),
        themeVars: collectThemeVars(),
      }
      if (!body.code) return
      try {
        await fetch('/card/' + encodeURIComponent(cardId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch {
        // 注册失败不阻塞渲染：GET 仍可能命中服务端已有缓存
      }
    }

    // ── CardView：iframe + 高度自适应 ────────────────────

    // ── i18n：zh / en / ru，由 DSH locale 服务驱动 ──
    const STR = {
      zh: {
        annotate: '批注',
        annotateTitle: '为选中的内容写一条批注',
        addTitle: '添加批注',
        editTitle: '编辑批注',
        quoteLabel: '批注的是哪句话',
        placeholder: '写下批注…（可留空，保存后仅标记原文）',
        save: '保存批注',
        del: '删除这条批注',
        cancel: '取消',
        bubbleTag: '批注 ×{n}',
        chipCount: ' 条批注',
        tipTitle: '批注（{n} 条）',
        notePrefix: '批注：',
        blockHead: '我批注了以下 {n} 处内容（编号与原文对应），请针对它们回答我的问题：',
        blockFormat: '请用「Annotation 1：…」到「Annotation {n}：…」的格式，逐条回应上面每一条批注，最后再回答我的问题。',
        // 无提问时的变体：必须是字面量。写成 t('blockHeadOnly') 会在 STR 初始化期间
        // 调用 t()，而 t() 读取 STR → TDZ ReferenceError → factory 抛错 → import failed。
        blockHeadOnly: '我批注了以下内容（编号与原文对应），请逐条回应每一条批注：',
        blockFormatOnly: '请用「Annotation N：…」的格式，逐条回应上面每一条批注。',
        marker: '提问：',
      },
      en: {
        annotate: 'Annotate',
        annotateTitle: 'Write a note about the selected text',
        addTitle: 'Add annotation',
        editTitle: 'Edit annotation',
        quoteLabel: 'Annotated passage',
        placeholder: 'Write a note… (optional; saving only marks the passage)',
        save: 'Save annotation',
        del: 'Delete this annotation',
        cancel: 'Cancel',
        bubbleTag: 'Annotations ×{n}',
        chipCount: ' annotation(s)',
        tipTitle: 'Annotations ({n})',
        notePrefix: 'Note: ',
        blockHead: 'I annotated the following {n} passage(s) (the numbers match the quotes below); please respond to them when answering my question:',
        blockFormat: 'Please respond to each annotation in the format "Annotation 1: …" through "Annotation {n}: …", then answer my question.',
        blockHeadOnly: 'I annotated the following passages; please respond to each annotation:',
        blockFormatOnly: 'Please respond to each annotation above in the format "Annotation N: …".',
        marker: 'Ask:',
      },
      ru: {
        annotate: 'Аннотировать',
        annotateTitle: 'Написать примечание к выделенному тексту',
        addTitle: 'Добавить аннотацию',
        editTitle: 'Изменить аннотацию',
        quoteLabel: 'Аннотируемый фрагмент',
        placeholder: 'Напишите примечание… (необязательно; сохранение только отметит фрагмент)',
        save: 'Сохранить аннотацию',
        del: 'Удалить эту аннотацию',
        cancel: 'Отмена',
        bubbleTag: 'Аннотации ×{n}',
        chipCount: ' аннотаций',
        tipTitle: 'Аннотации ({n})',
        notePrefix: 'Примечание: ',
        blockHead: 'Я аннотировал следующие {n} фрагмент(ов) (номера соответствуют цитатам ниже); прошу ответить на них при ответе на мой вопрос:',
        blockFormat: 'Прошу ответить на каждую аннотацию в формате "Annotation 1: …" до "Annotation {n}: …", затем ответить на мой вопрос.',
        blockHeadOnly: 'Я аннотировал следующие фрагменты; прошу ответить на каждую аннотацию:',
        blockFormatOnly: 'Прошу ответить на каждую аннотацию выше в формате "Annotation N: …".',
        marker: 'Вопрос:',
      },
    }

    let currentLang = 'zh'

    function t(key, vars) {
      const dict = STR[currentLang] || STR.zh
      let v = dict[key]
      if (v === undefined) v = STR.zh[key]
      if (v === undefined) return ''
      if (vars) {
        for (const k of Object.keys(vars)) {
          v = v.split('{' + k + '}').join(String(vars[k]))
        }
      }
      return v
    }

    function setLang(id) {
      if (id === 'zh' || id === 'en' || id === 'ru') currentLang = id
      else currentLang = 'en'
    }

    // ── 卡片批注：iframe 内选区 -> 宿主收集 -> 发送时随消息带上 ──
    const ANNOTATE_ADD = 'dsh.card-annotate'
    const ANNOTATE_SYNC = 'dsh.card-annotate-sync'
    const cardAnnotations = new Map()

    // ── 批注持久化：localStorage，刷新/重启不丢 ──
    const CARD_ANN_KEY = 'dsh-card.annotations'

    function loadAnnotations() {
      try {
        if (typeof localStorage === 'undefined') return
        const raw = localStorage.getItem(CARD_ANN_KEY)
        if (!raw) return
        const obj = JSON.parse(raw)
        if (!obj || typeof obj !== 'object') return
        for (const k of Object.keys(obj)) {
          const list = obj[k]
          if (!Array.isArray(list) || list.length === 0) continue
          const clean = []
          for (const x of list) {
            if (!x || typeof x !== 'object') continue
            const n = Number(x.n)
            if (!Number.isFinite(n)) continue
            clean.push({
              n: n,
              note: String(x.note || ''),
              quote: String(x.quote || ''),
            })
          }
          if (clean.length) {
            clean.sort(function (a, b) { return a.n - b.n })
            cardAnnotations.set(String(k), clean)
          }
        }
      } catch (e) {}
    }

    function saveAnnotations() {
      try {
        if (typeof localStorage === 'undefined') return
        const obj = {}
        cardAnnotations.forEach(function (list, k) {
          if (list && list.length) obj[k] = list
        })
        if (Object.keys(obj).length === 0) localStorage.removeItem(CARD_ANN_KEY)
        else localStorage.setItem(CARD_ANN_KEY, JSON.stringify(obj))
      } catch (e) {}
    }

    loadAnnotations()
    const annotateListeners = new Set()

    /** 卡片内改完/删完批注后，用它的完整列表覆盖宿主侧。
     */
    function syncAnnotations(cardId, list) {
      const k = String(cardId || '')
      if (!k || !Array.isArray(list)) return
      const out = []
      for (const x of list) {
        if (!x || typeof x !== 'object') continue
        const n = Number(x.n)
        const t = String(x.text || '')
        if (!Number.isFinite(n) || !t) continue
        out.push({ n: n, note: t, quote: String(x.quote || '') })
      }
      out.sort(function (a, b) { return a.n - b.n })
      if (out.length === 0) cardAnnotations.delete(k)
      else cardAnnotations.set(k, out)
      saveAnnotations()
      annotateListeners.forEach(function (f) {
        try { f(k) } catch (e) {}
      })
      updateComposerChip()
    }

    function annotationsOf(cardId) {
      return cardAnnotations.get(String(cardId || '')) || []
    }

    function addAnnotation(cardId, entry) {
      const k = String(cardId || '')
      if (!k || !entry || !entry.note) return
      const list = cardAnnotations.get(k) || []
      if (list.some(function (x) { return x.n === entry.n })) return
      list.push({ n: entry.n, note: String(entry.note), quote: String(entry.quote || '') })
      list.sort(function (a, b) { return a.n - b.n })
      cardAnnotations.set(k, list)
      saveAnnotations()
      annotateListeners.forEach(function (fn) {
        try { fn(k) } catch (e) {}
      })
      updateComposerChip()
    }

    /** 删除某条批注（宿主侧直接改 Map，同时通知卡片）。 */
    function removeNote(cardId, n) {
      const k = String(cardId || '')
      const list = cardAnnotations.get(k) || []
      const next = list.filter(function (x) { return x.n !== n })
      if (next.length === 0) cardAnnotations.delete(k)
      else cardAnnotations.set(k, next)
      saveAnnotations()
      annotateListeners.forEach(function (f) {
        try { f(k) } catch (e) {}
      })
      // 通知卡片把它自己的标签也去掉
      try {
        const frames = document.querySelectorAll('iframe[data-dsh-card-frame]')
        frames.forEach(function (f) {
          try { if (f.contentWindow) f.contentWindow.postMessage({ type: 'dsh.card-annotate-remove', n: n }, '*') } catch (e) {}
        })
      } catch (e) {}
    }

    /** 卡片下方内联编辑：不弹 window.prompt（CSP 无 allow-modals）。 */
    function editNoteInline(cardId, item) {
      const k = String(cardId || '')
      const list = cardAnnotations.get(k) || []
      const idx = list.findIndex(function (x) { return x.n === item.n })
      if (idx < 0) return

      // 用一个浮层输入框替代 prompt
      const old = document.querySelector('.dsh-card-editor')
      if (old) old.remove()

      const box = document.createElement('div')
      box.className = 'dsh-card-editor'

      const label = document.createElement('div')
      label.className = 'dsh-card-editor-label'
      label.textContent = '修改批注 #' + item.n

      const ta = document.createElement('textarea')
      ta.className = 'dsh-card-editor-input'
      ta.value = item.note || ''

      const row = document.createElement('div')
      row.className = 'dsh-card-editor-row'

      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'dsh-card-editor-cancel'
      cancel.textContent = '取消'

      const save = document.createElement('button')
      save.type = 'button'
      save.className = 'dsh-card-editor-save'
      save.textContent = '保存'

      row.appendChild(cancel)
      row.appendChild(save)
      box.appendChild(label)
      box.appendChild(ta)
      box.appendChild(row)
      document.body.appendChild(box)

      // 定位到视口中上部，避免被裁
      box.style.left = Math.max(8, (window.innerWidth - 340) / 2) + 'px'
      box.style.top = '80px'

      setTimeout(function () { ta.focus(); ta.select() }, 30)

      function close() { box.remove() }
      cancel.addEventListener('click', close)
      save.addEventListener('click', function () {
        const v = ta.value.trim()
        if (!v) return
        list[idx] = { n: item.n, note: v, quote: item.quote || '' }
        cardAnnotations.set(k, list)
        annotateListeners.forEach(function (f) {
          try { f(k) } catch (e) {}
        })
        close()
      })
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close()
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save.click()
      })
    }

    /** 在卡片下方内联编辑某条批注。 */
    function startEdit(cardId, item) {
      const k = String(cardId || '')
      const list = cardAnnotations.get(k) || []
      const idx = list.findIndex(function (x) { return x.n === item.n })
      if (idx < 0) return
      const next = editNoteInline(cardId, item)
      if (!next || next === item.note) return
      list[idx] = { n: item.n, note: next, quote: item.quote || '' }
      cardAnnotations.set(k, list)
      saveAnnotations()
      annotateListeners.forEach(function (f) {
        try { f(k) } catch (e) {}
      })
      updateComposerChip()
    }

    function annotationsToText(hasQuestion) {
      const items = []
      cardAnnotations.forEach(function (list) {
        if (!list || !list.length) return
        list.forEach(function (x) {
          const q = String(x.quote || '').replace(/\s+/g, ' ').trim()
          const note = String(x.note || '').trim()
          items.push({ quote: q, note: note })
        })
      })
      if (items.length === 0) return ''

      const n = items.length
      const parts = items.map(function (it, i) {
        let s = (i + 1) + '. ' + (it.quote || '（原文略）')
        if (it.note) s += '\n   批注：' + it.note
        return s
      })

      const head = hasQuestion
        ? t('blockHead', { n: n })
        : t('blockHeadOnly')
      const fmt = hasQuestion
        ? t('blockFormat', { n: n })
        : t('blockFormatOnly')

      let out = head + '\n\n' + parts.join('\n\n') + '\n\n' + fmt
      if (hasQuestion) out += '\n\n' + t('marker')
      return out
    }

    function hasAnnotations() {
      let n = 0
      cardAnnotations.forEach(function (l) { n += (l || []).length })
      return n > 0
    }

    /** 把当前所有卡片批注作为一条用户消息发出去。 */
    /**
     * 把批注块前置进 composer 草稿（不覆盖用户已打的字），
     * 用户按回车时随消息一起发出。照 @changfenhuang/dsh-annotation 的做法。
     */
    function attachAnnotationsToDraft(ctx, sessionId) {
      try {
        var hasQuestion = (function () {
          try {
            var scoped0 = ctx.sessions && ctx.sessions.scope ? ctx.sessions.scope(sessionId) : undefined
            if (!scoped0) return false
            var sh0 = ctx.conversation.input.for(scoped0)
            var st0 = sh0 && sh0.state ? sh0.state.getSnapshot() : null
            return !!(st0 && String(st0.draft || '').trim())
          } catch (e) { return false }
        })()
        var text = annotationsToText(hasQuestion)
        if (!text) return false
        if (!ctx || !ctx.conversation || !ctx.conversation.input) return false
        var scoped = ctx.sessions && ctx.sessions.scope ? ctx.sessions.scope(sessionId) : undefined
        if (!scoped) return false
        var shell = ctx.conversation.input.for(scoped)
        if (!shell || !shell.state) return false
        var st = shell.state.getSnapshot()
        var draft = (st && st.draft) || ''
        // 已有批注块就不重复追加
        if (draft.indexOf('【卡片批注】') >= 0) return false
        var block = '【卡片批注】' + String.fromCharCode(10) + text
        shell.setDraft(block + (hasQuestion ? String.fromCharCode(10) + String.fromCharCode(10) + draft : ''))
        return true
      } catch (e) {
        return false
      }
    }

    function sendAnnotationsNow(sendPrompt) {
      try {
        const text = annotationsToText()
        if (!text) return false
        if (typeof sendPrompt === 'function') {
          sendPrompt('以下是我在卡片上写的批注：' + NL + text)
          clearAnnotations()
          return true
        }
      } catch (e) {}
      return false
    }

    function clearAnnotations() {
      cardAnnotations.clear()
      saveAnnotations()
      annotateListeners.forEach(function (fn) {
        try { fn('') } catch (e) {}
      })
    }

    function CardView({ cardId, title }) {
      const iframeRef = React.useRef(null)
      const [height, setHeight] = React.useState(null)
      const [failed, setFailed] = React.useState(false)

      // 高度上报：只认自己 iframe 发来的消息
      const handleMessage = React.useCallback((e) => {
        const frame = iframeRef.current
        if (!frame || e.source !== frame.contentWindow) return
        const data = e.data
        if (data && data.type === ANNOTATE_SYNC) {
          syncAnnotations(cardId, data.list)
          return
        }
        if (data && data.type === ANNOTATE_ADD) {
          addAnnotation(cardId, data)
          return
        }
        if (!data || data.type !== RESIZE_TYPE) return
        const contentH = Number(data.height)
        if (contentH > 0) setHeight(Math.min(contentH, HEIGHT_CAP))
      }, [])

      React.useEffect(() => {
        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
      }, [handleMessage])

      // load 后 ping 兜底首报竞态；再补一次延时 ping 双保险
      React.useEffect(() => {
        const frame = iframeRef.current
        if (!frame) return
        let retry = null
        const ping = () => {
          if (frame.contentWindow) frame.contentWindow.postMessage(PING_MESSAGE, '*')
        }
        const onLoad = () => {
          ping()
          retry = setTimeout(ping, 150)
        }
        frame.addEventListener('load', onLoad)
        return () => {
          frame.removeEventListener('load', onLoad)
          if (retry !== null) clearTimeout(retry)
        }
      }, [cardId])

      // 兜底探测：迟迟没有高度上报，且卡片已不在服务端，明确告诉用户
      React.useEffect(() => {
        if (height !== null || failed) return
        let alive = true
        const timer = setTimeout(async () => {
          if (!alive) return
          try {
            const res = await fetch('/card/' + encodeURIComponent(cardId))
            if (alive && !res.ok) setFailed(true)
          } catch {
            if (alive) setFailed(true)
          }
        }, RESIZE_TIMEOUT)
        return () => { alive = false; clearTimeout(timer) }
      }, [cardId, height, failed])

      const [notes, setNotes] = React.useState(function () { return annotationsOf(cardId) })
      React.useEffect(function () {
        const fn = function (id) { if (!id || id === cardId) setNotes(annotationsOf(cardId).slice()) }
        annotateListeners.add(fn)
        return function () { annotateListeners.delete(fn) }
      }, [cardId])

      const scrollable = height !== null && height >= HEIGHT_CAP
      const frameStyle = height !== null ? { height: height + 'px' } : null

      return h('div', { className: 'dsh-card-root', 'data-dsh-card': cardId },
        h('div', {
          className: 'dsh-card-frame',
          style: frameStyle,
          'data-scroll': scrollable ? 'true' : 'false',
        },
          h('iframe', {
            ref: iframeRef,
            src: '/card/' + encodeURIComponent(cardId),
            sandbox: 'allow-scripts',
            title: title || 'Interactive card',
            'data-dsh-card-frame': '',
          })
        ),
        notes.length > 0
          ? h('div', { className: 'dsh-card-notes' },
              notes.map(function (x) {
                return h('div', { className: 'dsh-card-note', key: x.n },
                  h('span', { className: 'dsh-card-note-n' }, '#' + x.n),
                  h('span', { className: 'dsh-card-note-t' }, x.note),
                  h('button', {
                    type: 'button',
                    className: 'dsh-card-note-edit',
                    title: '修改这条批注',
                    onClick: function () {
                      try { startEdit(cardId, x) } catch (e) {}
                    },
                  }, '改'),
                  h('button', {
                    type: 'button',
                    className: 'dsh-card-note-del',
                    title: '删除这条批注',
                    onClick: function () {
                      try { removeNote(cardId, x.n) } catch (e) {}
                    },
                  }, '删'))
              }))
          : null,
                failed ? h('span', { className: 'dsh-card-hint' }, '卡片已失效（可能已被清理），可重新调用 show_card 生成。') : null
      )
    }

    // ── show_card 的 tool view（工具行回退路径） ──────────
    //
    // 0.2.1 起 tool.call.toolview 的 owner props 形状变化：
    // phase / block 从 props 顶层移到了 props.call 上（toolCallPhase 的结果）。
    // 渲染位置仍是工具调用折叠行内部——这是回退路径，正文路径见 turnTail。

    function ShowCardToolView(props) {
      const call = props && props.call
      // keyed tool view 在调用还处于 preparing 时就挂载，此刻没有结果可判
      if (!call || call.phase !== 'result') {
        return h('span', { className: 'dsh-card-hint' }, '正在生成卡片…')
      }

      const block = call.block
      if (block && block.isError) {
        const errText = textOf(block).trim()
        return h('span', { className: 'dsh-card-hint' },
          '卡片生成失败' + (errText ? '：' + errText.slice(0, 300) : ''))
      }

      const cardId = extractCardId(block)
      if (!cardId) {
        // 解析不出 cardId 时不吞结果：退回纯文本，信息不丢
        const raw = textOf(block)
        return h('pre', { className: 'dsh-card-fallback' }, raw || '（空结果）')
      }

      const args = callArgsOf(block)
      ensureRegistered(cardId, args)

      return h(CardView, { cardId, title: String(args.title || '') })
    }

    // ── turn 级自定义节点：把卡片放进正文 ──────────────────
    //
    // 为什么不用 tool.call.toolview：那个 slot 渲染在工具调用折叠行内部，
    // 用户必须展开才能看到卡片。AssistantMarkdown 把工具块从正文里显式丢弃，
    // 所以走工具行永远进不了正文。
    //
    // 正解（0.2.1 版，照 @deepseek-ai/dsh-client-ui-deliverables 的写法）：
    // 1. 向 ctx.uiConversation.events 注册一个自定义事件定义，
    //    把带 presentationMeta.dshCard 的 tool/result 聚合进 turn.data；
    // 2. 向 conversation.chat.turnTail slot 注册渲染器，
    //    turnTail 天然只在 turn 关闭时渲染，半截卡片不会出现。
    // 全程不覆盖任何内置渲染器，出错最坏是卡片不显示，对话本身不受影响。

    /** 从工具结果事件里安全取 dshCard 载荷，取不到返回 null。 */
    function payloadOf(event) {
      const meta = event && event.data && event.data.meta
      const raw = meta && meta.dshCard
      if (!raw || typeof raw !== 'object') return null
      const cardId = typeof raw.cardId === 'string' ? raw.cardId : ''
      if (!CARD_ID_RE.test(cardId)) return null
      return {
        cardId,
        title: typeof raw.title === 'string' ? raw.title : '',
        theme: typeof raw.theme === 'string' ? raw.theme : '',
      }
    }

    /**
     * turn 定位。
     *
     * PTC（Mode Code）下 show_card 是 run_code 的子调用，结果只写成
     * tool/ptc-dispatch，载荷里没有 turn 字段；而事件流严格按 seq 递增回放，
     * turn/start 一定先于本轮的派发事件到达。所以记住最近一个带 turn 的事件
     * （lastTurn），再用 turn/start~turn/end 之间的 activeTurn 收窄：只有落在
     * 当前开张 turn 里的派发结果才算数。
     *
     * 这层收窄同时挡住“历史窗口被截断、update 没有 start”的情形——宿主遇到
     * update-before-start 会直接抛错，卡片不显示也比炸掉整条转录好。
     */
    let lastTurn
    let activeTurn

    function turnOf(event) {
      const turn = event && event.data && event.data.turn
      if (Number.isSafeInteger(turn) && turn >= 0) {
        lastTurn = turn
        return turn
      }
      return lastTurn
    }

    /** 事件定义：match / start / update / buildLocationData，全程 no-throw。 */
    const cardEventDefinition = {
      kind: EVENT_KIND,

      match(event) {
        try {
          if (!event || typeof event !== 'object') return null
          const type = event.type
          const turn = turnOf(event)
          if (type === 'turn/start') {
            if (turn === undefined || turn === null) return null
            activeTurn = turn
            return { id: String(turn), role: 'start' }
          }
          if (type === 'turn/end') {
            activeTurn = undefined
            return null
          }
          if (type === 'tool/result') {
            if (turn === undefined || turn === null) return null
            const message = event.data && event.data.message
            if (message && message.isError === true) return null
            if (!payloadOf(event)) return null
            return { id: String(turn), role: 'update' }
          }
          // PTC（Mode Code）下 show_card 是 run_code 的子调用，
          // 结果只出现在 tool/ptc-dispatch，不会再有独立的 tool/result。
          if (type === 'tool/ptc-dispatch') {
            if (activeTurn === undefined || turn === null || turn === undefined) return null
            if (turn !== activeTurn) return null
            if (event.data && event.data.isError === true) return null
            if (!payloadOf(event)) return null
            return { id: String(turn), role: 'update' }
          }
          return null
        } catch {
          return null
        }
      },

      start(_context, match) {
        try {
          const turn = match && match.event && match.event.data
            ? match.event.data.turn
            : undefined
          return { turn, records: [] }
        } catch {
          return { turn: undefined, records: [] }
        }
      },

      update(context, match) {
        try {
          const state = (context && context.state) || { records: [] }
          const event = match && match.event
          if (!event) return state
          if (event.type !== 'tool/result' && event.type !== 'tool/ptc-dispatch') return state

          const payload = payloadOf(event)
          if (!payload) return state
          // 同一 cardId 只收一次（流式/重放可能重复投递）
          if (state.records.some((r) => r.cardId === payload.cardId)) return state

          const raw = event.data || {}
          const content = event.type === 'tool/result'
            ? (raw.message && raw.message.content) || []
            : raw.content || []
          let fallback = ''
          if (Array.isArray(content)) {
            const parts = []
            for (const c of content) {
              if (c && c.type === 'text' && typeof c.text === 'string') parts.push(c.text)
            }
            fallback = parts.join('\n')
          }

          const records = state.records.concat([{
            seq: event.seq,
            cardId: payload.cardId,
            title: payload.title,
            theme: payload.theme,
            fallback: fallback,
          }])
          return { ...state, records: records.slice(-MAX_RECORDS) }
        } catch {
          return (context && context.state) || { records: [] }
        }
      },

      buildLocationData(context, scope, previous) {
        try {
          if (scope !== 'turn') return null
          const state = context && context.state
          if (!state || !Array.isArray(state.records)) return null
          if (previous && previous.key === EVENT_KIND && previous.value === state.records) {
            return previous
          }
          return {
            kind: 'turn',
            turn: state.turn,
            key: EVENT_KIND,
            value: state.records,
          }
        } catch {
          return null
        }
      },
    }

    /**
     * turnTail 节点：把 records 逐条渲染成卡片。
     *
     * props 本身就是 closing owner（照 @deepseek-ai/dsh-client-ui-deliverables
     * 的 DeliverablesTail 写法）：props.turn.data 是 Map，键为事件定义 kind。
     * 注意不要写成 props.owner —— 那是错的，owner 就是 props 本体。
     */
    function CardTailView(props) {
      // 宿主引擎对节点生命周期没有 try/catch，这里整体兜底：任何意外都只让卡片不显示
      try {
        const owner = props
        const turn = owner && owner.turn
        const data = turn && turn.data
        let records = null
        if (data && typeof data.get === 'function') records = data.get(EVENT_KIND)
        else if (data && typeof data === 'object') records = data[EVENT_KIND]
        if (!Array.isArray(records)) return null

        const visible = []
        for (const r of records) {
          if (!r || typeof r !== 'object') continue
          if (typeof r.cardId !== 'string' || !CARD_ID_RE.test(r.cardId)) continue
          visible.push(r)
        }
        if (visible.length === 0) return null

        const totalNotes = (function () {
          let n = 0
          for (const r of visible) n += annotationsOf(r.cardId).length
          return n
        })()

        const sendBar = totalNotes > 0
          ? h('div', { className: 'dsh-card-sendbar' },
              h('span', { className: 'dsh-card-sendcount' }, '共 ' + totalNotes + ' 条批注'),
              h('button', {
                type: 'button',
                className: 'dsh-card-sendbtn',
                onClick: function () {
                  try {
                    const rt = owner && owner.cardRuntime
                    if (rt && attachAnnotationsToDraft(rt.ctx, rt.sessionId)) {
                      clearAnnotations()
                    }
                  } catch (e) {}
                },
              }, '写入输入框'))
          : null

        return h('div', { className: 'dsh-card-node' },
          visible.map(function (r) {
            return h(CardView, {
              key: r.cardId,
              cardId: r.cardId,
              title: r.title || '',
            })
          }),
          sendBar)
      } catch {
        return null
      }
    }

    // ── 错误边界：节点渲染抛错会炸掉整条转录，必须兜住 ──────
    class CardBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      componentDidCatch() {
        // 静默：不打印到控制台污染，也不向上抛
      }
      render() {
        if (this.state.failed) {
          return h('span', { className: 'dsh-card-hint' }, '卡片渲染异常，内容仍可通过上方工具结果查看。')
        }
        return this.props.children
      }
    }

    function GuardedCardTailView(props) {
      return h(CardBoundary, null, h(CardTailView, props))
    }

    // ── 注册 ─────────────────────────────────────────────


    // ── 消息气泡：隐藏批注块，改贴「批注 ×N」标签 ──
    // 照 @changfenhuang/dsh-annotation 的做法：MutationObserver 微任务阶段
    // 在绘制前切掉批注块，用户看不到闪烁。
    const BLOCK_HEADS = [
      '我批注了以下',
    ]
    const BLOCK_MARKERS = ['\n\n提问：', '\n\n问题：']

    function hasAnnotationBlock(text) {
      if (!text) return false
      for (const h of BLOCK_HEADS) {
        if (text.indexOf(h) !== -1) return true
      }
      return false
    }

    /** 从气泡文本里数出批注条数。 */
    function countAnnotations(text) {
      const m = text.match(/我批注了以下\s*(\d+)\s*处/)
      if (m) return Number(m[1])
      if (text.indexOf('我批注了以下内容') >= 0) {
        const n = (text.match(/^\s*\d+\.\s/gm) || []).length
        return n > 0 ? n : 1
      }
      return 0
    }

    /** 切掉批注块，只保留用户的正文提问。返回是否改动了。 */
    function hideAnnotationBlock(row) {
      try {
        const bubble = row.querySelector('[class*="bubble"]')
        if (!bubble) return false
        const nodes = []
        let full = ''
        const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT)
        let n
        while ((n = walker.nextNode()) !== null) {
          nodes.push(n)
          full += n.nodeValue || ''
        }
        if (!hasAnnotationBlock(full)) return false

        // 找正文分隔标记：批注块之后才是用户真正的问题
        let cut = -1
        for (const mk of BLOCK_MARKERS) {
          const at = full.indexOf(mk)
          if (at >= 0 && (cut < 0 || at < cut)) cut = at
        }

        let keep = ''
        if (cut >= 0) {
          const mkm = BLOCK_MARKERS.find(function (m) { return full.indexOf(m) === cut })
          const skip = mkm ? mkm.length : 0
          keep = full.slice(cut + skip).trim()
        }

        // 逐节点重写：第一段放保留内容，其余清空
        let placed = false
        for (const node of nodes) {
          const v = node.nodeValue || ''
          if (!placed && v.trim()) {
            node.nodeValue = keep
            placed = true
          } else if (placed || v.trim()) {
            node.nodeValue = ''
          }
        }
        return true
      } catch (e) {
        return false
      }
    }

    /** 给消息行贴「批注 ×N」标签。 */
    function attachBubbleTag(row, count, items) {
      if (row.querySelector('[data-dsh-card-bubble-tag]')) return
      const bubble = row.querySelector('[class*="bubble"]') || row
      const tag = document.createElement('span')
      tag.setAttribute('data-dsh-card-bubble-tag', '')
      tag.textContent = t('bubbleTag', { n: count })
      tag.style.cssText = 'display:inline-flex;align-items:center;height:18px;padding:0 8px;margin:4px 0 0 4px;border-radius:9px;border:1px solid #323842;background:#f2f6fd;color:#a8b0be;font-family:system-ui;font-size:10px;cursor:default;'
      tag.__dshCardItems = items
      bubble.appendChild(tag)
    }

    /** 扫描所有消息行，隐藏批注块并贴标签。 */
    /** 从气泡文本反解析批注条目（编号 + 原文 + 批注）。 */
    function parseBubbleItems(bubble) {
      try {
        const text = bubble.textContent || ''
        const out = []
        const re = /(\d+)\.\s+([\s\S]*?)(?=\n\s*批注：|\n\n\d+\.|\n\n请用|\n\n请按|$)/g
        let m
        while ((m = re.exec(text)) !== null) {
          const num = parseInt(m[1], 10)
          let body = (m[2] || '').trim()
          let note = ''
          const ni = body.indexOf('批注：')
          if (ni >= 0) {
            note = body.slice(ni + 3).trim()
            body = body.slice(0, ni).trim()
          }
          out.push({ n: num, quote: body, note: note })
        }
        return out
      } catch (e) { return [] }
    }

    function decorateBubbles() {
      try {
        const all = document.querySelectorAll('[data-chat-flow-kind]')
        // 只看最近 60 行：历史消息早就装饰过了，全量扫在长会话里是纯浪费
        const start = Math.max(0, all.length - 60)
        for (let i = all.length - 1; i >= start; i--) {
          const row = all[i]
          if (row.querySelector('[data-dsh-card-bubble-tag]')) continue
          const bubble = row.querySelector('[class*="bubble"]')
          if (!bubble) continue
          const text = bubble.textContent || ''
          if (!hasAnnotationBlock(text)) continue
          const cnt = countAnnotations(text)
          if (hideAnnotationBlock(row)) attachBubbleTag(row, cnt || 1, parseBubbleItems(bubble))
        }
        decorateAssistantChips()
        updateComposerChip()
      } catch (e) {}
    }

    let decoratePending = null
    let lastDecorateAt = 0
    let decorating = false          // 装饰进行中：期间产生的 mutation 全部忽略
    let decorateSuspendedUntil = 0  // 装饰后静默窗口

    /** 只有「消息行插入」这类批次才值得全量扫描；文本/属性变更直接跳过。 */
    function mutationRelevant(muts) {
      for (const m of muts) {
        if (m.type !== 'childList') continue
        const t = m.target
        const el = t instanceof Element ? t : (t && t.parentElement)
        if (!el || !el.closest) continue
        // 自己改的节点一律忽略
        if (el.closest('[data-dsh-card-bubble-tag]')) continue
        if (el.closest('[data-dsh-card-reply-chip]')) continue
        if (el.closest('[data-dsh-card-composer-chip]')) continue
        if (el.closest('[data-dsh-card-composer-tip]')) continue
        if (el.closest('[data-dsh-card-reply-tip]')) continue
        if (el.closest('[data-composer-card]')) continue
        return true
      }
      return false
    }

    function scheduleDecorate(force) {
      // 装饰中或静默窗口内：不重入
      if (decorating) return
      if (!force && performance.now() < decorateSuspendedUntil) return
      const now = performance.now()
      if (now - lastDecorateAt >= 400) {
        lastDecorateAt = now
        runDecorate()
        return
      }
      if (decoratePending !== null) return
      decoratePending = setTimeout(function () {
        decoratePending = null
        lastDecorateAt = performance.now()
        runDecorate()
      }, 400)
    }

    function runDecorate() {
      if (decorating) return
      decorating = true
      try { decorateBubbles() } catch (e) {}
      // 装饰后 600ms 内不响应任何 mutation：给 DOM 稳定时间
      decorateSuspendedUntil = performance.now() + 600
      decorating = false
    }

    // ── 回复里「Annotation N：」替换成可悬浮芯片 ──
    // 照 @changfenhuang/dsh-annotation 的 decorateAnnotationLabels。
    const REPLY_CHIP_RE = /Annotation[\s\u200b\u200c\u200d\u00ad]*(\d+)[\s\u200b\u200c\u200d\u00ad]*[:：]?/gi

    function makeReplyChip(num, item) {
      const chip = document.createElement('span')
      chip.setAttribute('data-dsh-card-reply-chip', '')
      chip.style.cssText = 'display:inline-flex;align-items:center;height:18px;padding:0 6px;margin:0 2px;border-radius:9px;border:1px solid #323842;background:#f2f6fd;color:#6b8aff;font-family:system-ui;font-size:11px;font-weight:500;cursor:default;vertical-align:middle;'
      chip.textContent = 'Annotation ' + num

      // 悬浮显示原文与批注
      let tip = null
      chip.addEventListener('mouseenter', function () {
        try {
          if (tip) return
          tip = document.createElement('div')
          tip.className = 'dsh-card-reply-tip'
          tip.style.cssText = 'position:fixed;z-index:1160;width:300px;max-width:calc(100vw - 16px);padding:10px 12px;border-radius:8px;border:1px solid #323842;background:#22262e;box-shadow:0 4px 16px rgba(0,0,0,.14);font-family:system-ui;font-size:12px;line-height:1.6;color:#e6e9ef;'
          const q = String(item.quote || '').slice(0, 160)
          const nt = String(item.note || '')
          tip.innerHTML = ''
          const qd = document.createElement('div')
          qd.style.cssText = 'color:#a8b0be;border-left:2px solid #6b8aff;padding-left:6px;margin-bottom:6px;'
          qd.textContent = q
          tip.appendChild(qd)
          if (nt) {
            const nd = document.createElement('div')
            nd.textContent = t('notePrefix') + nt
            tip.appendChild(nd)
          }
          document.body.appendChild(tip)
          const r = chip.getBoundingClientRect()
          tip.style.left = Math.max(8, Math.min(window.innerWidth - 316, r.left)) + 'px'
          tip.style.top = (r.bottom + 6) + 'px'
        } catch (e) {}
      })
      chip.addEventListener('mouseleave', function () {
        try { if (tip) { tip.remove(); tip = null } } catch (e) {}
      })
      return chip
    }

    /** 找这条助手回复之前最近的带批注用户消息里的条目。 */
    function findPrevAnnotationItems(row) {
      try {
        const rows = Array.prototype.slice.call(document.querySelectorAll('[data-chat-flow-kind]'))
        const idx = rows.indexOf(row)
        if (idx < 0) return null
        for (let i = idx - 1; i >= 0; i--) {
          const tag = rows[i].querySelector('[data-dsh-card-bubble-tag]')
          if (tag && Array.isArray(tag.__dshCardItems) && tag.__dshCardItems.length) {
            return tag.__dshCardItems
          }
        }
      } catch (e) {}
      return null
    }

    /** 在助手行内把「Annotation N：」换成芯片。 */
    function decorateReplyChips(row, items) {
      try {
        const nodes = []
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
        let n
        while ((n = walker.nextNode()) !== null) nodes.push(n)

        for (const node of nodes) {
          if (!node.parentNode) continue
          const v = node.nodeValue || ''
          REPLY_CHIP_RE.lastIndex = 0
          if (!REPLY_CHIP_RE.test(v)) continue

          const frag = document.createDocumentFragment()
          let last = 0
          let replaced = 0
          REPLY_CHIP_RE.lastIndex = 0
          let m
          while ((m = REPLY_CHIP_RE.exec(v)) !== null) {
            if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)))
            const num = parseInt(m[1], 10)
            const item = items[num - 1]
            if (item !== undefined) {
              frag.appendChild(makeReplyChip(num, item))
              replaced++
            } else {
              frag.appendChild(document.createTextNode(m[0]))
            }
            last = m.index + m[0].length
          }
          if (replaced === 0) continue
          if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)))
          try { node.parentNode.replaceChild(frag, node) } catch (e) {}
        }
      } catch (e) {}
    }

    /** 扫描所有已结束流式的助手行。 */
    function decorateAssistantChips() {
      try {
        const allA = document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')
        const startA = Math.max(0, allA.length - 40)
        for (let ai = allA.length - 1; ai >= startA; ai--) {
          const el = allA[ai]
          if (el.hasAttribute('data-streaming') || el.querySelector('[data-streaming]')) continue
          if (el.hasAttribute('data-dsh-card-chip-done')) continue
          if (el.querySelector('[data-dsh-card-reply-chip]')) continue
          if ((el.textContent || '').indexOf('Annotation') === -1) continue
          const items = findPrevAnnotationItems(el)
          if (!items || !items.length) {
            el.setAttribute('data-dsh-card-chip-done', '1')
            continue
          }
          decorateReplyChips(el, items)
          el.setAttribute('data-dsh-card-chip-done', '1')
        }
      } catch (e) {}
    }

    // ── 输入框旁的「批注 ×N」标签 ──
    // 照 @changfenhuang/dsh-annotation：固定定位浮层，跟随 composer 定位。
    let composerChip = null
    let composerChipLastAt = 0
    let composerChipTip = null

    function ensureComposerChip() {
      if (composerChip) return composerChip
      composerChip = document.createElement('div')
      composerChip.setAttribute('data-dsh-card-composer-chip', '')
      composerChip.style.cssText = 'position:fixed;z-index:1150;display:none;align-items:center;gap:4px;height:22px;padding:0 10px;border-radius:11px;border:1px solid #323842;background:#f2f6fd;font-family:system-ui;font-size:11px;color:#a8b0be;cursor:default;'
      document.body.appendChild(composerChip)

      composerChip.addEventListener('mouseenter', function () { showComposerTip() })
      composerChip.addEventListener('mouseleave', function () { hideComposerTip() })
      return composerChip
    }

    function showComposerTip() {
      try {
        hideComposerTip()
        const all = []
        cardAnnotations.forEach(function (list, cardId) {
          (list || []).forEach(function (x) { all.push({ cardId: cardId, item: x }) })
        })
        if (!all.length) return

        const tip = document.createElement('div')
        tip.setAttribute('data-dsh-card-composer-tip', '')
        tip.style.cssText = 'position:fixed;z-index:1160;width:340px;max-width:calc(100vw - 16px);max-height:300px;overflow-y:auto;padding:10px 12px;border-radius:8px;border:1px solid #323842;background:#22262e;box-shadow:0 4px 16px rgba(0,0,0,.14);font-family:system-ui;font-size:12px;line-height:1.6;color:#e6e9ef;'

        for (const it of all) {
          const row = document.createElement('div')
          row.style.cssText = 'padding:6px 0;border-bottom:1px solid #323842;'
          const q = document.createElement('div')
          q.style.cssText = 'color:#a8b0be;font-size:11px;margin-bottom:3px;'
          q.textContent = '#' + it.item.n + ' ' + String(it.item.quote || '').slice(0, 80)
          row.appendChild(q)
          if (it.item.note) {
            const nd = document.createElement('div')
            nd.textContent = it.item.note
            row.appendChild(nd)
          }
          tip.appendChild(row)
        }
        document.body.appendChild(tip)
        composerChipTip = tip

        const r = composerChip.getBoundingClientRect()
        tip.style.left = Math.max(8, Math.min(window.innerWidth - 356, r.left)) + 'px'
        tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px'
      } catch (e) {}
    }

    function hideComposerTip() {
      try { if (composerChipTip) { composerChipTip.remove(); composerChipTip = null } } catch (e) {}
    }

    /** 刷新 composer 旁标签：有批注才显示，并跟随输入框位置。 */
    function updateComposerChip() {
      try {
        const chip = ensureComposerChip()
        let total = 0
        cardAnnotations.forEach(function (l) { total += (l || []).length })
        if (total === 0) {
          chip.style.display = 'none'
          hideComposerTip()
          return
        }
        chip.textContent = t('bubbleTag', { n: total })

        // 用缓存避免每次都读布局（getBoundingClientRect 会强制重排）
        const card = document.querySelector('[data-composer-card]')
        if (!card) { chip.style.display = 'none'; return }
        const now2 = performance.now()
        if (now2 - composerChipLastAt < 300) {
          chip.style.display = 'flex'
          return
        }
        composerChipLastAt = now2
        const r = card.getBoundingClientRect()
        chip.style.display = 'flex'
        chip.style.left = Math.max(8, r.right - 100) + 'px'
        chip.style.top = Math.max(8, r.top - 30) + 'px'
      } catch (e) {}
    }

    function apply(ctx) {
      diag('apply entered')
      try { console.info('[dsh-card] client active') } catch (e) {}

      // 接 DSH locale 服务：切换语言时更新文案
      try {
        if (ctx.locale && typeof ctx.locale.getSnapshot === 'function') {
          const snap = ctx.locale.getSnapshot()
          if (snap && snap.active) setLang(snap.active)
          if (typeof ctx.locale.subscribe === 'function') {
            ctx.locale.subscribe(function () {
              try {
                const s2 = ctx.locale.getSnapshot()
                if (s2 && s2.active) setLang(s2.active)
              } catch (e2) {}
            })
          }
        }
      } catch (e) {}
      ensureCss()

      // 启动气泡装饰：MutationObserver + 120ms 合并调度
      try {
        if (!window.__dshCardDecorateBound) {
          window.__dshCardDecorateBound = true
          new MutationObserver(function (muts) {
            if (!mutationRelevant(muts)) return
            scheduleDecorate()
          }).observe(document.body, { childList: true, subtree: true })
          scheduleDecorate(true)
        }
      } catch (e) {}

      // 1) 正文节点（主路径）：turn 级自定义事件 + turnTail 渲染器
      try {
        const hasEvents = !!(ctx.uiConversation && ctx.uiConversation.events
          && typeof ctx.uiConversation.events.register === 'function')
        diag('uiConversation.events available=' + hasEvents)
        if (hasEvents) {
          ctx.uiConversation.events.register(cardEventDefinition)
          diag('events.register(' + EVENT_KIND + ') ok')
          ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
            name: 'conversation.chat.turnTail',
            id: TAIL_ID,
            inject: (sessionId) => { const rt = { ctx: ctx, sessionId: sessionId }; cardRuntimeRef = rt; return { cardRuntime: rt } },
          }, GuardedCardTailView))
          diag('turnTail slot registered')
        }
      } catch (err) {
        diag('body-node registration failed', err)
        // 注册失败不阻塞下面的工具行回退
      }

      // 3) Enter 自动 prepend：用户按回车时把批注块拼进草稿，随消息一起发出
      //    照 @changfenhuang/dsh-annotation 的做法：capture 阶段拦截，
      //    但必须在宿主 composer 之前，且不能干扰输入法合成。
      try {
        if (!annotateEnterBound) {
          annotateEnterBound = true
          var imeOn = false
          var imeAt = 0
          document.addEventListener('compositionstart', function () { imeOn = true; imeAt = Date.now() }, true)
          document.addEventListener('compositionend', function () { imeOn = false; imeAt = Date.now() }, true)
          document.addEventListener('keydown', function (e) {
            try {
              if (e.key !== 'Enter' || e.shiftKey || e.altKey) return
              if (!hasAnnotations()) return
              // 输入法守卫：合成中或上屏确认的 Enter 绝不 setDraft
              if (e.isComposing === true || e.keyCode === 229) return
              if (imeOn) return
              if (Date.now() - imeAt < 60) return
              // 只在 composer 输入区内触发
              var t = e.target
              if (!(t instanceof Element)) return
              var inComposer = t.closest('[data-composer-input]') || t.closest('[data-composer-card]')
              if (!inComposer) return
              var rt = cardRuntimeRef
              if (rt && attachAnnotationsToDraft(rt.ctx, rt.sessionId)) {
                clearAnnotations()
              }
            } catch (err) {}
          }, true)
        }
      } catch (e) {}

      // 2) 工具行回退：即使正文节点不可用，展开工具调用仍能看到卡片
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: TOOL_NAME,
      }, ShowCardToolView))
      diag('apply done')
    }

    exports.apply = apply
    exports.inject = ['slots', 'sessions', 'conversation', 'uiConversation', 'configForms', 'locale']
    diag('factory done, exports ready')
    return module.exports
  },
})
