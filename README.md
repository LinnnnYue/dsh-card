# dsh-card · 交互卡片

> 让模型在对话里直接渲染一张**可交互的 HTML/SVG 卡片**，而不是一段文字。

移植自 HanaAgent 的 `show_card`，替换 `dsh-genui` 的卡片职责。

---

## 与 dsh-genui 的区别

| | dsh-genui | dsh-card |
|---|---|---|
| 输入 | `schemaJson`（JSON 描述） | **纯 HTML/SVG 片段** |
| 渲染 | OpenTiny Vue 组件树 | **iframe 沙箱** |
| 排版自由度 | 受组件白名单限制 | **任意 HTML/CSS** |
| 主题 | 跟随宿主 | **三套可选** |

---

## 三套主题

| id | 名称 | 主色 | 来源 |
|---|---|---|---|
| **whale**（默认） | 蓝色鲸鱼 | `#4d6bfe` | dsh-claude-style 的 palette=claude + brand=deepseek |
| paper | 纸感 | `#537D96` 印章蓝 | HanaAgent 设计手册 |
| claude | Claude | `#d97757` 陶土橙 | dsh-claude-style 默认 |

切换方式：`show_card` 的 `theme` 参数。


---

## AMWH · 图解优先方法论（v0.2.0 起）

设计目标一句话：**拒绝纯文字输出**。能受益于结构的回答不再写段落，直接排成一页图解。

### 内置图解组件（宿主提供样式，模型只写内容）

| 组件 | 用途 | 写法 |
|---|---|---|
| `.compare` 对照表 | 二选一决策 | `<td class="c-yes">✓ 低</td>` / `.c-no` / `.c-mid` |
| `.verdict` 结论条 | 表尾落一句结论 | `<div class="verdict">结论：…</div>` |
| `.seq` 时序条 | 流程 / 因果链 | `<ol class="seq"><li><b>步</b> — 说明</li>…</ol>` |
| `.flag` 措辞标注 | 标出坏词再给改法 | `<span class="flag">赋能闭环</span>` |

完整铁律见 `card_guide` 的 **§15 AMWH 方法论**：该一页就一页该一句就一句、
重复的样式从模型手里拿走、短句禁空洞词。

### 卡片右上角下载

每张卡片右上角有两个半透明小按钮（hover 变清晰）：

- **↓图** —— 导出 PNG（2 倍清晰度，foreignObject 逐像素渲染，自动剔除按钮与脚本）
- **↓码** —— 导出自包含 HTML（断网双击可开，批注序号样式保留）

文件名自动取卡片 title + 时间戳：`redis_vs_memcached-20261107-0218.png`。

---


## 三个工具

| 工具 | 用途 |
|---|---|
| `show_card(title, code, theme?)` | 渲染一张卡片。code 是 HTML 片段，**不要写 DOCTYPE/html/head/body** |
| `card_guide()` | 返回完整设计手册（19KB，§0~§11） |
| `card_themes()` | 列出可用主题 |

---

## 架构

```
tools 层（lib/index.js）
  show_card(title, code, theme) → 生成 cardId，存进 LRU
  card_guide()                  → 返回设计手册

HTTP 层（lib/cards.js）
  PUT /card/:id  {code, title, theme}  → 注册
  GET /card/:id                         → 返回带 CSP 的完整 HTML

client 层（client.js）
  挂 tool.call.toolview（key='show_card'）
  渲染 iframe src=/card/:id, sandbox=allow-scripts
  监听 dsh.card-resize 消息 → 设显式高度（cap 900）
```

---

## 安全

iframe 带完整 CSP：

```
default-src 'none'; sandbox allow-scripts;
script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; font-src data:; media-src data: blob:;
connect-src 'none'; object-src 'none'; frame-src 'none';
child-src 'none'; worker-src 'none'; form-action 'none';
base-uri 'none'; navigate-to 'none'
```

卡片可以跑内联脚本（换高度、做交互），但**不能联网、不能开子框架、不能提交表单、不能导航**。

---

## 安装

```sh
# 先卸掉 genui（本插件替换它）
dsh plugin --profile desktop remove dsh-genui
# 装本插件
dsh plugin --profile desktop add @linnnnyue/dsh-card
# 重启 DSH
```

---

## 文件

```
dsh-card/
├── package.json
├── cordis.patch.yml
├── client.js          浏览器侧 iframe 渲染器（325 行）
├── SPEC.md            开发规范（含色板）
├── README.md
└── lib/
    ├── index.js       工具层 + 设计手册（594 行）
    ├── cards.js       LRU + HTML 包装（194 行）
    └── themes.js      三套主题色板
```

---

## 开发与测试

```bash
npm run test          # 构建契约测试（30 项，零依赖，无需浏览器）
npm run test:e2e      # 端到端测试（25 项，需 Chrome/Chromium + playwright）
npm run test:all      # 两个都跑
```

端到端测试覆盖：AMWH 四组件渲染、三态勾叉颜色、**真实点击下载按钮并拦截产物**、
PNG/HTML 产物内容与安全性校验（无脚本残留 / 无工具条 / 有 DOCTYPE）、四主题变量解析。

需要自定义浏览器路径时：
```bash
CHROME_PATH=/path/to/chrome PLAYWRIGHT_PATH=/path/to/playwright npm run test:e2e
```

视觉复检（生成四主题预览图到 `preview/`）：
```bash
node test/preview-themes.mjs
```

---

## 版本

- **0.2.0** —— AMWH 图解方法论 + 下载工具条 + 设计评审 F1-F8 返工
- 0.1.0 —— 首版三工具三主题
