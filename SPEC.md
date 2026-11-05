# dsh-card 开发规范（子代理必读）

## 目标
把 HanaAgent 的 `show_card` 交互卡片能力移植到 DSH，**替换 dsh-genui**。

## 架构（照搬 HanaAgent，已验证可行）

```
tools 侧（lib/index.js）
  show_card(title, code)  ← code 是纯 HTML/SVG 片段
  card_guide(modules?)    ← 注入设计手册

HTTP 侧（lib/cards.js）
  PUT  /card/:id  { code, title, themeVars }  ← 注册到 LRU
  GET  /card/:id                              ← 返回完整 HTML 文档

client 侧（client.js）
  监听 tool result → 拿 cardId → iframe src=/card/:id
  监听 postMessage 'dsh.card-resize' → 设显式高度（cap 900px）
```

## 关键设计决策（已确认）

1. **替换 dsh-genui** —— 不并存
2. **双主题可切换**：
   - `paper`（默认）：HanaAgent 原版纸感
   - `claude`：跟随 dsh-claude-style 配色
3. 主题通过 card 参数或设置项切换

## 主题色板（已从源码提取，勿猜）

**三套主题**，`show_card` 的 `theme` 参数切换。默认 `whale`。

### 1. `whale`（默认）—— 蓝色鲸鱼 · **当前生效主题**

来源：dsh-claude-style 的 `palette=claude` + `brand=deepseek` + 非深色。27 个变量已落库。

```js
'--bg':            '#fafbff',                     // bg-base / canvas
'--bg-card':       '#f7f9ff',                     // layer-2 / sidebar / selector
'--bg-sunken':     '#f4f7fe',                     // layer-3
'--bg-hover':      '#eef3fc',                     // interactive-bg-hover-solid
'--border':        '#e7ecf7',                     // border-l1
'--border-l2':     '#dde4f1',
'--border-l3':     '#cfd8ea',
'--accent':        '#4d6bfe',                     // brand-primary（品牌蓝）
'--accent-hover':  '#3a57e8',                     // button-primary-hover
'--accent-light':  'rgba(77,107,254,0.08)',
'--accent-active': 'rgba(77,107,254,0.22)',       // interactive-bg-active
'--accent-tertiary':'#e9eeff',                    // state-business-tertiary
'--link':          '#3b56d9',
'--link-hover':    '#2c43b8',
'--link-underline':'rgba(59,86,217,0.6)',
'--text':          '#0f1115',                     // label-primary
'--text-secondary':'#61666b',                     // label-secondary
'--text-tertiary': '#81858c',                     // label-tertiary
'--text-muted':    '#adb2b8',                     // label-caption
'--bubble':        '#eaf0fe',                     // specific-bubble
'--chip':          '#f2f6fd',                     // claude-chip
'--table-head':    '#eff3fb',
'--inline-code-bg':'rgba(38,49,72,0.05)',
'--hover-bg':      'rgba(38,49,72,0.08)',
'--scrollbar':     'rgba(206,216,233,0.9)',
'--green':         '#2e7554',                     // meter-valley
'--ochre':         '#9a5a1a',                     // meter-peak
'--danger':        '#8B2C1F',
```

**语义映射**（写卡片时用这套思维）：
- 页面底 → `--bg`（#fafbff 蓝白）
- 卡片/浮起块 → `--bg-card`（#f7f9ff）
- 强调/主按钮/品牌 → `--accent`（#4d6bfe 蓝）
- 表头 → `--table-head`（#eff3fb）
- 气泡/轻提示底 → `--bubble`（#eaf0fe）
- 标签/胶囊 → `--chip`（#f2f6fd）

### 2. `paper` —— HanaAgent 原版纸感

```js
'--bg':           '#F5EFE4',
'--bg-card':      '#FBF7EE',
'--bg-sunken':    '#EFE8DB',
'--border':       '#D8CFBE',
'--accent':       '#537D96',   // 印章蓝
'--accent-hover': '#3F6179',
'--accent-light': 'rgba(83,125,150,0.08)',
'--text':         '#2A2622',
'--text-light':   '#4A433C',
'--text-muted':   '#6B6158',
'--green':        '#4A6B4A',
'--danger':       '#8B2C1F',
'--ink-blue':     '#1B365D',
'--seal-ochre':   '#9D5F4D',
'--ink-blue-lt':  '#E4ECF5',
'--sheet-white':  '#FFFDF7',
'--sand':         '#E8E6DC',
```

### 3. `claude` —— Claude Code 陶土橙

```js
'--bg':           '#faf9f5',
'--bg-card':      '#fcfcfb',
'--bg-sunken':    '#fbfbf9',
'--border':       '#e8e6dc',
'--accent':       '#d97757',   // 陶土橙
'--accent-hover': '#e08a6d',
'--accent-light': 'rgba(217,119,87,0.08)',
'--text':         '#141413',
'--text-light':   '#2e2c29',
'--text-muted':   '#8f8d84',
'--green':        '#4A6B4A',
'--danger':       '#8B2C1F',
```

## 排版铁律（两套主题共用，来自设计手册 §4）

| 元素 | 字号 | 字重 | 行高 |
|---|---|---|---|
| h1 | 1.35rem | 500 | 1.25 |
| h2 | 1.1rem | 500 | 1.3 + 左边框 2px |
| h3 | 0.95rem | 500 | 1.35 |
| 正文 | 0.9rem | 400 | 1.65 |
| 标注 | 0.75rem | 400 | 1.3 |
| 指标值 | 1.6rem | **600** | 1.15 |

**硬规则：**
- 字重**只用 400 / 500**，600 仅指标值，**永不 700**
- **禁止 Title Case / 全大写**，一律句首大写
- 字号**不小于 11px**
- 正文段落**不许加粗**
- 数字必须取整（toFixed / Math.round），浮点残留不许上屏
- **禁止渐变、阴影、模糊、发光、噪点**，只用实色填充
- 动效只用 opacity，时长 ≤0.15s，**禁止弹跳/弹簧/缩放**

## 组件规格（照抄手册 §6）

```css
/* 卡片 */
background: var(--bg-card); border-radius: 4px; padding: 1rem 1.25rem;

/* 分隔线 */
border: none; border-top: 0.5px solid var(--border); margin: 0.8em 0;

/* 表格 */
table { width:100%; border-collapse:collapse; font-size:0.85rem; }
th { text-align:left; font-weight:500; color:var(--text-light); padding:6px 8px; border-bottom:1px solid var(--border); }
td { padding:5px 8px; border-bottom:0.5px solid rgba(0,0,0,0.06); }

/* 指标 */
.metric-value { font-size:1.6rem; font-weight:600; color:var(--accent); font-variant-numeric:tabular-nums; }
.metric-label { font-size:0.75rem; color:var(--text-muted); }

/* 徽章 */
display:inline-flex; align-items:center; gap:4px; padding:2px 8px;
font-size:0.75rem; font-weight:500; border-radius:4px;
background:var(--accent-light); color:var(--accent-hover);
```

## 安全约束（不可妥协）

iframe 必须带 CSP：
```
default-src 'none'; sandbox allow-scripts;
script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; font-src data:; media-src data: blob:;
connect-src 'none'; object-src 'none'; frame-src 'none';
child-src 'none'; worker-src 'none'; form-action 'none';
base-uri 'none'; navigate-to 'none'
```

iframe 标签：`sandbox="allow-scripts"`

## 编码纪律（血泪教训）

1. **TS 模板字符串里嵌 JS/HTML 会转义地狱** → 用 `write` 工具直接写文件，或 Python 生成
2. **每次改完必须跑**：
   - `node --check` 语法
   - 数一遍 interface/route 数量，确认没删漏
3. **不能只做语法检查** —— UI 问题语法查不出来，要实际验证逻辑
4. Python 里 `%` 格式化时字面量百分号要写 `%%`

## 交付标准

- [ ] `show_card` 工具可调用，返回 cardId
- [ ] `GET /card/:id` 返回带 CSP 的完整 HTML
- [ ] client 侧 iframe 渲染成功
- [ ] 高度自适应（ResizeObserver + 宿主 ping 兜底）
- [ ] 两套主题可切换且都符合色板
- [ ] `node --check` 全过
