# Changelog

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
