import type { Group } from '../types';

export const systemToolsGroup: Group = {
  id: 'group_system_tools',
  name: '系统工具',
  order: 0,
  directories: [
    {
      id: 'dir_basic_tools',
      name: '基础工具',
      order: 0,
      items: [
        { id: 'sys_explorer', name: '文件资源管理器', path: 'explorer.exe', type: 'command', order: 0 },
        { id: 'sys_taskmgr', name: '任务管理器', path: 'taskmgr.exe', type: 'command', order: 1 },
        { id: 'sys_cmd', name: '命令提示符', path: 'cmd.exe', type: 'command', order: 2 },
        { id: 'sys_powershell', name: 'PowerShell', path: 'powershell.exe', type: 'command', order: 3 },
        { id: 'sys_calc', name: '计算器', path: 'calc.exe', type: 'command', order: 4 },
        { id: 'sys_notepad', name: '记事本', path: 'notepad.exe', type: 'command', order: 5 },
        { id: 'sys_mspaint', name: '画图', path: 'mspaint.exe', type: 'command', order: 6 },
        { id: 'sys_snipping', name: '截图工具', path: 'snippingtool.exe', type: 'command', order: 7 }
      ]
    },
    {
      id: 'dir_system_settings',
      name: '系统设置',
      order: 1,
      items: [
        { id: 'sys_control', name: '控制面板', path: 'control.exe', type: 'command', order: 0 },
        { id: 'sys_devmgmt', name: '设备管理器', path: 'devmgmt.msc', type: 'command', order: 1 },
        { id: 'sys_diskmgmt', name: '磁盘管理', path: 'diskmgmt.msc', type: 'command', order: 2 },
        { id: 'sys_services', name: '服务管理', path: 'services.msc', type: 'command', order: 3 },
        { id: 'sys_regedit', name: '注册表编辑器', path: 'regedit.exe', type: 'command', order: 4 },
        { id: 'sys_gpedit', name: '组策略编辑器', path: 'gpedit.msc', type: 'command', order: 5 },
        { id: 'sys_msinfo32', name: '系统信息', path: 'msinfo32.exe', type: 'command', order: 6 },
        { id: 'sys_env', name: '环境变量设置', path: 'SystemPropertiesAdvanced.exe', type: 'command', order: 7 }
      ]
    },
    {
      id: 'dir_network_tools',
      name: '网络工具',
      order: 2,
      items: [
        { id: 'sys_ncpa', name: '网络连接', path: 'ncpa.cpl', type: 'command', order: 0 },
        { id: 'sys_firewall', name: '防火墙设置', path: 'firewall.cpl', type: 'command', order: 1 },
        { id: 'sys_mstsc', name: '远程桌面', path: 'mstsc.exe', type: 'command', order: 2 },
        { id: 'sys_network_diag', name: '网络诊断', path: 'msdt.exe -id NetworkDiagnosticsNetworkAdapter', type: 'command', order: 3 }
      ]
    }
  ]
};
