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
        { id: 'sys_terminal', name: 'Windows Terminal', path: 'wt.exe', type: 'command', order: 2 },
        { id: 'sys_cmd', name: '命令提示符', path: 'cmd.exe', type: 'command', order: 3 },
        { id: 'sys_powershell', name: 'PowerShell', path: 'powershell.exe', type: 'command', order: 4 },
        { id: 'sys_calc', name: '计算器', path: 'calc.exe', type: 'command', order: 5 },
        { id: 'sys_notepad', name: '记事本', path: 'notepad.exe', type: 'command', order: 6 },
        { id: 'sys_mspaint', name: '画图', path: 'mspaint.exe', type: 'command', order: 7 },
        { id: 'sys_snipping', name: '截图工具', path: 'snippingtool.exe', type: 'command', order: 8 }
      ]
    },
    {
      id: 'dir_common_locations',
      name: '常用位置',
      order: 1,
      items: [
        { id: 'sys_desktop', name: '桌面', path: 'explorer.exe shell:Desktop', type: 'command', order: 0 },
        { id: 'sys_downloads', name: '下载', path: 'explorer.exe shell:Downloads', type: 'command', order: 1 },
        { id: 'sys_documents', name: '文档', path: 'explorer.exe shell:Personal', type: 'command', order: 2 },
        { id: 'sys_pictures', name: '图片', path: 'explorer.exe shell:My Pictures', type: 'command', order: 3 },
        { id: 'sys_startup_folder', name: '启动文件夹', path: 'explorer.exe shell:Startup', type: 'command', order: 4 },
        { id: 'sys_recycle_bin', name: '回收站', path: 'explorer.exe shell:RecycleBinFolder', type: 'command', order: 5 }
      ]
    },
    {
      id: 'dir_modern_settings',
      name: 'Windows 设置',
      order: 2,
      items: [
        { id: 'sys_settings_home', name: 'Windows 设置', path: 'ms-settings:', type: 'command', order: 0 },
        { id: 'sys_display_settings', name: '显示设置', path: 'ms-settings:display', type: 'command', order: 1 },
        { id: 'sys_sound_settings', name: '声音设置', path: 'ms-settings:sound', type: 'command', order: 2 },
        { id: 'sys_bluetooth_settings', name: '蓝牙和设备', path: 'ms-settings:bluetooth', type: 'command', order: 3 },
        { id: 'sys_network_settings', name: '网络和 Internet', path: 'ms-settings:network-status', type: 'command', order: 4 },
        { id: 'sys_apps_settings', name: '已安装的应用', path: 'ms-settings:appsfeatures', type: 'command', order: 5 },
        { id: 'sys_startup_apps', name: '启动应用', path: 'ms-settings:startupapps', type: 'command', order: 6 },
        { id: 'sys_default_apps', name: '默认应用', path: 'ms-settings:defaultapps', type: 'command', order: 7 },
        { id: 'sys_clipboard_settings', name: '剪贴板设置', path: 'ms-settings:clipboard', type: 'command', order: 8 },
        { id: 'sys_windows_update', name: 'Windows 更新', path: 'ms-settings:windowsupdate', type: 'command', order: 9 },
        { id: 'sys_storage_settings', name: '存储设置', path: 'ms-settings:storagesense', type: 'command', order: 10 },
        { id: 'sys_datetime_settings', name: '日期和时间', path: 'ms-settings:dateandtime', type: 'command', order: 11 }
      ]
    },
    {
      id: 'dir_system_settings',
      name: '管理工具',
      order: 3,
      items: [
        { id: 'sys_control', name: '控制面板', path: 'control.exe', type: 'command', order: 0 },
        { id: 'sys_devmgmt', name: '设备管理器', path: 'devmgmt.msc', type: 'command', order: 1 },
        { id: 'sys_diskmgmt', name: '磁盘管理', path: 'diskmgmt.msc', type: 'command', order: 2 },
        { id: 'sys_services', name: '服务管理', path: 'services.msc', type: 'command', order: 3 },
        { id: 'sys_eventvwr', name: '事件查看器', path: 'eventvwr.msc', type: 'command', order: 4 },
        { id: 'sys_resmon', name: '资源监视器', path: 'resmon.exe', type: 'command', order: 5 },
        { id: 'sys_msconfig', name: '系统配置', path: 'msconfig.exe', type: 'command', order: 6 },
        { id: 'sys_cleanmgr', name: '磁盘清理', path: 'cleanmgr.exe', type: 'command', order: 7 },
        { id: 'sys_power', name: '电源选项', path: 'powercfg.cpl', type: 'command', order: 8 },
        { id: 'sys_regedit', name: '注册表编辑器', path: 'regedit.exe', type: 'command', order: 9 },
        { id: 'sys_gpedit', name: '组策略编辑器', path: 'gpedit.msc', type: 'command', order: 10 },
        { id: 'sys_msinfo32', name: '系统信息', path: 'msinfo32.exe', type: 'command', order: 11 },
        { id: 'sys_env', name: '环境变量设置', path: 'SystemPropertiesAdvanced.exe', type: 'command', order: 12 }
      ]
    },
    {
      id: 'dir_network_tools',
      name: '网络工具',
      order: 4,
      items: [
        { id: 'sys_ncpa', name: '网络连接', path: 'ncpa.cpl', type: 'command', order: 0 },
        { id: 'sys_firewall', name: '防火墙设置', path: 'firewall.cpl', type: 'command', order: 1 },
        { id: 'sys_mstsc', name: '远程桌面', path: 'mstsc.exe', type: 'command', order: 2 },
        { id: 'sys_network_diag', name: '网络诊断', path: 'msdt.exe -id NetworkDiagnosticsNetworkAdapter', type: 'command', order: 3 }
      ]
    },
    {
      id: 'dir_accessibility_tools',
      name: '辅助工具',
      order: 5,
      items: [
        { id: 'sys_osk', name: '屏幕键盘', path: 'osk.exe', type: 'command', order: 0 },
        { id: 'sys_magnify', name: '放大镜', path: 'magnify.exe', type: 'command', order: 1 },
        { id: 'sys_charmap', name: '字符映射表', path: 'charmap.exe', type: 'command', order: 2 },
        { id: 'sys_narrator', name: '讲述人', path: 'narrator.exe', type: 'command', order: 3 },
        { id: 'sys_accessibility', name: '辅助功能设置', path: 'ms-settings:easeofaccess', type: 'command', order: 4 }
      ]
    }
  ]
};
