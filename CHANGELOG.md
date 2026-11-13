# Changelog

## 0.2.1 — 2026-11-13

### Added
- `docs/` 示例产物：用 dsh-card 渲染并导出的真实卡片（含可复现的 body 片段与视觉决策说明）

### Changed
- 示例卡片经历四轮设计迭代后的最终版，与 Stripe Press / Linear 的克制风格对齐：
  - 字号收敛到四阶（12/14/16/20px），间距进入 8/12/16/20/24 体系
  - 发丝线（1px `--border`）替代色块边界做板块分隔
  - 条形数据高度 8px + 2px 圆角，四根左沿严格对齐（实测 x=76）
  - 条形长度改为真实比例（4:8:2:55），不再是各自归一化的假比例
  - 时序导轨改为容器级连续线，修复原逐行拼接导致的短桩断裂

### Notes
- 设计迭代中确认的两条经验：
  1. **每根条各自归一化会让比例失真** —— 多序列对比必须共原点共标度
  2. **抽象几何隐喻会增加理解成本** —— 「线以下是没看见的」这类编码需要先学，
     而「每格一件」「条越长越多」是普世的，不需要解释

## 0.2.0 — 2026-11-07

### Added
- **AMWH 图解方法论**（Answer Me With HTML）：
  - `card_guide` 新增 §15：该一页就一页该一句就一句 / 图解优先 / 重复样式从模型手里拿走 / 措辞纪律四条铁律
  - 四个内置图解组件：`.compare` 打勾打叉对照表（含 `.c-yes` / `.c-no` / `.c-mid`）、`.verdict` 结论条、`.seq` 时序条、`.flag` 措辞标注
  - `show_card` 工具描述同步 AMWH 组件与用法，模型开箱即用
- **卡片右上角下载工具条**：
  - PNG 导出：foreignObject 2 倍清晰度逐像素渲染，自动剔除按钮 / 脚本 / 批注弹层，按 body 内容紧裁切
  - 自包含 HTML 导出：断网双击可开，批注序号样式保留
  - 文件名 = 卡片 title + 时间戳；导出带 toast 反馈
- `buildCardDocument` 新增 `title` 参数：写入 `<title>` 与 `data-card-title`（HTML 转义，防注入）
- iframe sandbox 增补 `allow-downloads`

### Security
- 卡片 title 全链路 HTML 转义后才进文档（`escapeHtml`）

## 0.1.0 — 2026-11-05

- 首版：show_card / card_guide / card_themes 三工具，whale / paper / claude 三主题，
  iframe 沙箱渲染 + 高度自适应 + 卡片内批注
