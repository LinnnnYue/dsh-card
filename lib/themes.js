/**
 * dsh-card 主题色板
 *
 * 三套主题，全部色值从宿主插件源码中提取，不是拍脑袋定的：
 *   whale —— dsh-claude-style 的 palette=claude + brand=deepseek（当前生效）
 *   paper —— HanaAgent 设计手册 §3 的纸感配色
 *   claude —— dsh-claude-style 的 palette=claude 默认橙
 */

export const THEMES = {
  /**
   * 深色主题（2026-10-26 新增，设为默认）。
   *
   * 为什么加：原先三套主题全是浅色，--bg-card 接近纯白（#f7f9ff / #fcfcfb），
   *   深色界面里弹出一张白卡非常刺眼；且 --text-muted 在白底上只有约 2.2:1
   *   对比度（WCAG AA 正文要求 4.5:1），用户明确反馈「灰色看不清、白底难受」。
   *
   * 设计依据：
   *   - 底色取 #1a1d23 系（非纯黑，避免 OLED 上的拖影与硬边）
   *   - 层次靠 3 级递进：#1a1d23 → #22262e → #282d36
   *   - 文字对比度全部 ≥ 4.5:1：#e6e9ef 主文 (14.8:1)、#a8b0be 次级 (7.1:1)、
   *     #838b9a 弱化 (4.6:1) —— 弱化色也守住 AA 线，不再「灰得看不见」
   *   - 强调色沿用鲸鱼蓝但提亮到 #6b8aff，暗底上才有足够亮度
   *   - 语义色同步提亮，保证暗底可读
   */
  dark: {
    name: '深色',
    vars: {
      '--bg': '#1a1d23',
      '--bg-card': '#22262e',
      '--bg-sunken': '#171a1f',
      '--bg-hover': '#2a2f38',
      '--border': '#323842',
      '--border-l2': '#3b424e',
      '--border-l3': '#474f5c',
      '--accent': '#6b8aff',
      '--accent-hover': '#869eff',
      '--accent-light': 'rgba(107,138,255,0.14)',
      '--accent-active': 'rgba(107,138,255,0.26)',
      '--accent-tertiary': '#2a3450',
      '--link': '#8aa4ff',
      '--link-hover': '#a7bbff',
      '--link-underline': 'rgba(138,164,255,0.6)',
      '--text': '#e6e9ef',
      '--text-secondary': '#bcc4d0',
      '--text-tertiary': '#a8b0be',
      '--text-muted': '#8b93a1',
      '--bubble': '#2a3345',
      '--chip': '#282d36',
      '--table-head': '#2a2f38',
      '--inline-code-bg': 'rgba(255,255,255,0.07)',
      '--hover-bg': 'rgba(255,255,255,0.06)',
      '--scrollbar': 'rgba(90,100,116,0.9)',
      '--green': '#5fbf8a',
      '--ochre': '#e0a458',
      '--danger': '#e8746a',
      '--danger-light':  'rgba(232,116,106,0.12)',
    },
  },

  whale: {
    name: '蓝色鲸鱼',
    vars: {
      '--bg': '#fafbff',
      '--bg-card': '#f7f9ff',
      '--bg-sunken': '#f4f7fe',
      '--bg-hover': '#eef3fc',
      '--border': '#e7ecf7',
      '--border-l2': '#dde4f1',
      '--border-l3': '#cfd8ea',
      '--accent': '#4d6bfe',
      '--accent-hover': '#3a57e8',
      '--accent-light': 'rgba(77,107,254,0.08)',
      '--accent-active': 'rgba(77,107,254,0.22)',
      '--accent-tertiary': '#e9eeff',
      '--link': '#3b56d9',
      '--link-hover': '#2c43b8',
      '--link-underline': 'rgba(59,86,217,0.6)',
      '--text': '#0f1115',
      '--text-secondary': '#61666b',
      '--text-tertiary': '#81858c',
      '--text-muted': '#adb2b8',
      '--bubble': '#eaf0fe',
      '--chip': '#f2f6fd',
      '--table-head': '#eff3fb',
      '--inline-code-bg': 'rgba(38,49,72,0.05)',
      '--hover-bg': 'rgba(38,49,72,0.08)',
      '--scrollbar': 'rgba(206,216,233,0.9)',
      '--green': '#2e7554',
      '--ochre': '#9a5a1a',
      '--danger': '#8B2C1F',
      '--danger-light':  'rgba(139,44,31,0.07)',
    },
  },

  paper: {
    name: '纸感',
    vars: {
      '--bg': '#F5EFE4',
      '--bg-card': '#FBF7EE',
      '--bg-sunken': '#EFE8DB',
      '--bg-hover': '#EFE8DB',
      '--border': '#D8CFBE',
      '--border-l2': '#CFC4AF',
      '--border-l3': '#C4B79E',
      '--accent': '#537D96',
      '--accent-hover': '#3F6179',
      '--accent-light': 'rgba(83,125,150,0.08)',
      '--accent-active': 'rgba(83,125,150,0.22)',
      '--accent-tertiary': '#E4ECF5',
      '--link': '#3F6179',
      '--link-hover': '#2E4A5C',
      '--link-underline': 'rgba(63,97,121,0.6)',
      '--text': '#2A2622',
      '--text-secondary': '#4A433C',
      '--text-tertiary': '#5A524A',
      '--text-muted': '#6B6158',
      '--bubble': '#EEF2F7',
      '--chip': '#FAF9F5',
      '--table-head': '#EFE8DB',
      '--inline-code-bg': 'rgba(0,0,0,0.04)',
      '--hover-bg': 'rgba(0,0,0,0.05)',
      '--scrollbar': 'rgba(216,207,190,0.9)',
      '--green': '#4A6B4A',
      '--ochre': '#9D5F4D',
      '--danger': '#8B2C1F',
      '--danger-light':  'rgba(139,44,31,0.07)',
      '--ink-blue': '#1B365D',
      '--seal-ochre': '#9D5F4D',
      '--ink-blue-lt': '#E4ECF5',
      '--sheet-white': '#FFFDF7',
      '--sand': '#E8E6DC',
    },
  },

  claude: {
    name: 'Claude',
    vars: {
      '--bg': '#faf9f5',
      '--bg-card': '#fcfcfb',
      '--bg-sunken': '#fbfbf9',
      '--bg-hover': '#f0f0ef',
      '--border': '#e8e6dc',
      '--border-l2': '#dedcd2',
      '--border-l3': '#d4d1c5',
      '--accent': '#d97757',
      '--accent-hover': '#e08a6d',
      '--accent-light': 'rgba(217,119,87,0.08)',
      '--accent-active': 'rgba(217,119,87,0.22)',
      '--accent-tertiary': '#fdf2ec',
      '--link': '#c26844',
      '--link-hover': '#a85736',
      '--link-underline': 'rgba(194,104,68,0.6)',
      '--text': '#141413',
      '--text-secondary': '#2e2c29',
      '--text-tertiary': '#5a5750',
      '--text-muted': '#8f8d84',
      '--bubble': '#f0f0ef',
      '--chip': '#f6f6f4',
      '--table-head': '#f3f2ee',
      '--inline-code-bg': 'rgba(0,0,0,0.04)',
      '--hover-bg': 'rgba(0,0,0,0.05)',
      '--scrollbar': 'rgba(232,230,220,0.9)',
      '--green': '#4A6B4A',
      '--ochre': '#a4621d',
      '--danger': '#8B2C1F',
      '--danger-light':  'rgba(139,44,31,0.07)',
    },
  },
}

export const DEFAULT_THEME = 'dark'

export function getTheme(name) {
  return THEMES[name] || THEMES[DEFAULT_THEME]
}

export function listThemes() {
  return Object.keys(THEMES).map(k => ({ id: k, name: THEMES[k].name }))
}
