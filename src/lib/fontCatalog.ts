export interface FontPresetDefinition {
  id: string;
  label: string;
  value: string;
  hint: string;
}

export const FONT_PRESETS: FontPresetDefinition[] = [
  { id: 'theme', label: '跟随主题', value: '', hint: '恢复当前主题自带字体' },
  { id: 'yahei', label: '微软雅黑 UI', value: '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif', hint: 'Windows 中文界面清晰稳定' },
  { id: 'segoe', label: 'Segoe UI', value: '"Segoe UI", "Microsoft YaHei UI", sans-serif', hint: '适合英文、数字和按钮界面' },
  { id: 'harmony', label: 'HarmonyOS Sans', value: '"HarmonyOS Sans SC", "HarmonyOS Sans", "Microsoft YaHei UI", sans-serif', hint: '现代、紧凑的中文无衬线字体' },
  { id: 'misans', label: 'MiSans', value: 'MiSans, "Microsoft YaHei UI", sans-serif', hint: '小字号显示简洁' },
  { id: 'source-han', label: '思源黑体', value: '"Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei UI", sans-serif', hint: '中英文覆盖完整' },
  { id: 'pingfang', label: '苹方', value: '"PingFang SC", "Microsoft YaHei UI", sans-serif', hint: '安装或系统支持时使用' },
  { id: 'wenkai', label: '霞鹜文楷', value: '"LXGW WenKai Screen", "LXGW WenKai", "Microsoft YaHei UI", sans-serif', hint: '适合便签和阅读区域' },
  { id: 'cascadia', label: 'Cascadia Mono', value: '"Cascadia Mono", Consolas, "Microsoft YaHei UI", monospace', hint: '适合路径、命令和便签' },
];
