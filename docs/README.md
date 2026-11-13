# 示例产物

## session-summary-final.png

一张用 `dsh-card` 渲染、再通过卡片右上角下载按钮导出的真实卡片（1800×1390）。

内容是对 `dsh-card` v0.1.0 → v0.2.0 开发过程的总结，可当作：
- **组件能力演示** —— 展示了条形数据、发丝线分隔、时序导轨、结论块的实际效果
- **设计参考** —— 与 Stripe Press / Linear 的克制风格对齐后的样子

配套文件：
- `session-summary-final.fragment.html` —— 生成这张卡片的 body 片段源码（可复现）
- `session-summary-final-notes.md` —— 14 处视觉决策的逐条说明

### 复现方式

```javascript
import { buildCardDocument } from '@linnnnyue/dsh-card/lib/cards.js';
import { readFileSync, writeFileSync } from 'node:fs';

writeFileSync('out.html', buildCardDocument({
  code: readFileSync('session-summary-final.fragment.html', 'utf8'),
  theme: 'whale',
  title: '会话总结',
}));
```

然后用浏览器打开 `out.html`，点右上角 **↓图** 即可导出同样的 PNG。

## archive/

早期迭代版本（v2 基线 / v3 合并 / v4 pictogram / v5 单位图），仅供追溯设计演进，不是推荐用法。
