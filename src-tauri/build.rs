use std::{env, fs, path::{Path, PathBuf}};

const VERIFIED_INPUTS: &[&str] = &[
  "../src/stores/appStore.ts",
  "src/lib.rs",
  "src/edge_dock_native.rs",
  "src/commands.rs",
  "src/website_metadata.rs",
  "Cargo.toml",
  "src/native_browser_drop.rs",
  "tauri.conf.json",
  "src/process_integrity.rs",
  "windows-app-manifest.xml",
  "src/main.rs",
  "../src/types.ts",
  "../src/components/TopBar/MultiAccountDialog.tsx",
  "../src/stores/appStore/slices/itemSlice.ts",
  "../src/stores/appStore/slices/navigationSlice.ts",
  "../src/stores/appStore/normalizers.ts",
  "../src/lib/navigationClipboard.ts",
  "../src/components/Sidebar/Sidebar.tsx",
  "../src/components/ContextMenu/DirectoryContextMenu.tsx",
  "../src/components/ContextMenu/GroupContextMenu.tsx",
  "../src/components/TopBar/ConfigProfilesMenu.tsx",
  "../src/App.tsx",
  "../src/hooks/useWebsiteDropController.ts",
  "../src/hooks/useGlobalShortcutRouter.ts",
  "../src/hooks/useOverlayRouter.ts",
  "../src/lib/browserDrop.ts",
  "../src/lib/uiDialog.ts",
  "../src/components/UiDialog/UiDialogHost.tsx",
  "../src/components/ContentArea/ItemCard.tsx",
  "../src/components/ContextMenu/AreaContextMenu.tsx",
  "../src/components/ContextMenu/ItemContextMenu.tsx",
  "../src/components/ItemInteraction/ItemClickActionPicker.tsx",
  "../src/lib/itemClickActions.ts",
  "../src/lib/itemCopy.ts",
  "../src/components/ContentArea/ShortcutGrid/ShortcutGrid.tsx",
  "../src/lib/doubleClickTiming.ts",
  "../src/hooks/useBrowserCatalog.ts",
  "../src/hooks/useStableEdgeDock.ts",
  "src/blocking.rs",
  "src/icon.rs",
  "src/icon_native.rs",
  "src/mapped_folder.rs",
  "src/start_menu.rs",
  "src/folder_mirror.rs",
  "../src/stores/appStore/slices/mappedSlice.ts",
  "../src/stores/appStore/slices/startMenuSlice.ts",
  "src/windows_registry.rs",
  "src/transfer_station.rs",
  "src/legacy_import.rs",
];

fn read(path: impl AsRef<Path>, label: &str) -> String {
  fs::read_to_string(path).unwrap_or_else(|error| panic!("read {label}: {error}"))
}

fn require(source: &str, needle: &str, message: &str) {
  if !source.contains(needle) {
    panic!("persistent source fix missing: {message}");
  }
}

fn forbid(source: &str, needle: &str, message: &str) {
  if source.contains(needle) {
    panic!("persistent source fix regressed: {message}");
  }
}

fn verify_persistent_windows_fixes() {
  let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
  let root = manifest.parent().expect("project root");
  let app_store = read(root.join("src/stores/appStore.ts"), "appStore.ts");
  let lib_rs = read(manifest.join("src/lib.rs"), "lib.rs");
  let edge = read(manifest.join("src/edge_dock_native.rs"), "edge_dock_native.rs");
  let commands = read(manifest.join("src/commands.rs"), "commands.rs");
  let website_metadata = read(manifest.join("src/website_metadata.rs"), "website_metadata.rs");
  let cargo = read(manifest.join("Cargo.toml"), "Cargo.toml");
  let native_drop = read(manifest.join("src/native_browser_drop.rs"), "native_browser_drop.rs");
  let tauri_conf = read(manifest.join("tauri.conf.json"), "tauri.conf.json");
  let process_integrity = read(manifest.join("src/process_integrity.rs"), "process_integrity.rs");
  let windows_manifest = read(manifest.join("windows-app-manifest.xml"), "windows-app-manifest.xml");
  let main_rs = read(manifest.join("src/main.rs"), "main.rs");
  let app_types = read(root.join("src/types.ts"), "types.ts");
  let multi_account = read(root.join("src/components/TopBar/MultiAccountDialog.tsx"), "MultiAccountDialog.tsx");
  let item_slice = read(root.join("src/stores/appStore/slices/itemSlice.ts"), "itemSlice.ts");
  let navigation_slice = read(root.join("src/stores/appStore/slices/navigationSlice.ts"), "navigationSlice.ts");
  let normalizers = read(root.join("src/stores/appStore/normalizers.ts"), "normalizers.ts");
  let navigation_clipboard = read(root.join("src/lib/navigationClipboard.ts"), "navigationClipboard.ts");
  let sidebar = read(root.join("src/components/Sidebar/Sidebar.tsx"), "Sidebar.tsx");
  let directory_menu = read(root.join("src/components/ContextMenu/DirectoryContextMenu.tsx"), "DirectoryContextMenu.tsx");
  let group_menu = read(root.join("src/components/ContextMenu/GroupContextMenu.tsx"), "GroupContextMenu.tsx");
  let config_profiles = read(root.join("src/components/TopBar/ConfigProfilesMenu.tsx"), "ConfigProfilesMenu.tsx");
  let app = read(root.join("src/App.tsx"), "App.tsx");
  let website_drop = read(root.join("src/hooks/useWebsiteDropController.ts"), "useWebsiteDropController.ts");
  let shortcut_router = read(root.join("src/hooks/useGlobalShortcutRouter.ts"), "useGlobalShortcutRouter.ts");
  let overlay_router = read(root.join("src/hooks/useOverlayRouter.ts"), "useOverlayRouter.ts");
  let browser_drop = read(root.join("src/lib/browserDrop.ts"), "browserDrop.ts");
  let ui_dialog = read(root.join("src/lib/uiDialog.ts"), "uiDialog.ts");
  let ui_dialog_host = read(root.join("src/components/UiDialog/UiDialogHost.tsx"), "UiDialogHost.tsx");
  let item_card = read(root.join("src/components/ContentArea/ItemCard.tsx"), "ItemCard.tsx");
  let area_menu = read(root.join("src/components/ContextMenu/AreaContextMenu.tsx"), "AreaContextMenu.tsx");
  let item_menu = read(root.join("src/components/ContextMenu/ItemContextMenu.tsx"), "ItemContextMenu.tsx");
  let item_click_picker = read(root.join("src/components/ItemInteraction/ItemClickActionPicker.tsx"), "ItemClickActionPicker.tsx");
  let item_click_actions = read(root.join("src/lib/itemClickActions.ts"), "itemClickActions.ts");
  let item_copy = read(root.join("src/lib/itemCopy.ts"), "itemCopy.ts");
  let shortcut_grid = read(root.join("src/components/ContentArea/ShortcutGrid/ShortcutGrid.tsx"), "ShortcutGrid.tsx");
  let double_click_timing = read(root.join("src/lib/doubleClickTiming.ts"), "doubleClickTiming.ts");
  let browser_catalog = read(root.join("src/hooks/useBrowserCatalog.ts"), "useBrowserCatalog.ts");
  let stable_edge = read(root.join("src/hooks/useStableEdgeDock.ts"), "useStableEdgeDock.ts");
  let blocking = read(manifest.join("src/blocking.rs"), "blocking.rs");
  let icon = read(manifest.join("src/icon.rs"), "icon.rs");
  let icon_native = read(manifest.join("src/icon_native.rs"), "icon_native.rs");
  let mapped_folder = read(manifest.join("src/mapped_folder.rs"), "mapped_folder.rs");
  let start_menu = read(manifest.join("src/start_menu.rs"), "start_menu.rs");
  let folder_mirror = read(manifest.join("src/folder_mirror.rs"), "folder_mirror.rs");
  let mapped_slice = read(root.join("src/stores/appStore/slices/mappedSlice.ts"), "mappedSlice.ts");
  let start_menu_slice = read(root.join("src/stores/appStore/slices/startMenuSlice.ts"), "startMenuSlice.ts");
  let windows_registry = read(manifest.join("src/windows_registry.rs"), "windows_registry.rs");
  let transfer_station = read(manifest.join("src/transfer_station.rs"), "transfer_station.rs");
  let legacy_import = read(manifest.join("src/legacy_import.rs"), "legacy_import.rs");

  require(&app_store, "browserRouter: defaults.browserRouter!", "appStore browserRouter default");
  require(&lib_rs, "Win32::UI::Controls::MARGINS", "MARGINS import from Win32::UI::Controls");
  require(&lib_rs, "null_mut(),", "SetWindowPos insert-after pointer");
  require(&edge, "let mut cached_main: HWND = std::ptr::null_mut();", "cached_main HWND null initialization");
  require(&edge, "let mut cached_strip: HWND = std::ptr::null_mut();", "cached_strip HWND null initialization");
  require(&edge, "Mode::AutoHidden { edge, restore_rect, hidden_rect, .. }", "AutoHidden edge binding");
  require(&commands, "if hwnd.is_null()", "commands HWND null check");
  require(&cargo, "\"Win32_UI_Controls\"", "windows-sys Win32_UI_Controls feature");
  require(&cargo, "\"Win32_Security\"", "windows-sys security APIs for Integrity Level diagnostics");
  require(&cargo, "windows = { version = \"0.61\"", "windows crate for native OLE browser drops");
  require(&lib_rs, "native_browser_drop::install(app.handle())", "native browser drop installer");
  require(&native_drop, "RegisterDragDrop", "Windows OLE drop target registration");
  require(&native_drop, "UniformResourceLocatorW", "Firefox/Chromium native URL clipboard format");
  require(&native_drop, "text/x-moz-url", "Firefox Gecko URL clipboard format");
  require(&native_drop, "HTML Format", "Firefox/Floorp HTML URL fallback format");
  require(&native_drop, "text/x-moz-text-internal", "Firefox/Floorp internal text drag fallback");
  require(&native_drop, "application/x-moz-tabbrowser-tab", "Firefox/Floorp tab drag flavor");
  require(&native_drop, "DROPEFFECT_LINK", "browser link drag cursor effect");
  require(&native_drop, "native-external-drop", "native drop frontend event bridge");
  require(&tauri_conf, "\"dragDropEnabled\": false", "native OLE bridge owns Windows external drops");

  require(&windows_manifest, "requestedExecutionLevel level=\"asInvoker\"", "Windows manifest keeps Yue Launcher on the standard-user execution path");
  require(&windows_manifest, "Microsoft.Windows.Common-Controls", "custom Windows manifest preserves Common Controls v6");
  require(&main_rs, "ensure_medium_integrity_before_run()", "integrity guard runs before Tauri/WebView2 startup");
  require(&process_integrity, "TokenIntegrityLevel", "runtime Integrity Level diagnostics");
  require(&process_integrity, "SECURITY_MANDATORY_MEDIUM_PLUS_RID", "Medium Plus must not be mistaken for standard Medium");
  require(&process_integrity, "GetShellWindow", "desktop shell token source for de-elevation");
  require(&process_integrity, "CreateProcessWithTokenW", "automatic Medium-integrity relaunch path");
  require(&process_integrity, "--yue-medium-relaunch", "integrity relaunch loop guard");

  require(&app_types, "multiAccount", "multi-account top-right control id");
  require(&multi_account, "mode: 'specified'", "multi-account projects bind to a concrete browser/Profile route");
  require(&multi_account, "\\p{N}", "multi-account account-name cleanup strips numbers");
  require(&item_slice, "copyItemsToClipboard", "internal project clipboard copy action");
  require(&item_slice, "pasteItemsToDirectory", "internal project clipboard paste action");
  require(&navigation_slice, "copyDirectoryToClipboard", "child-directory clipboard copy action");
  require(&navigation_slice, "pasteDirectoryToGroup", "child-directory cross-parent paste action");
  require(&navigation_slice, "copyGroupToClipboard", "parent-directory clipboard copy action");
  require(&navigation_slice, "pasteGroupFromClipboard", "parent-directory paste action");
  require(&navigation_slice, "moveDirectoryToGroup", "child-directory cross-parent move action");
  require(&navigation_clipboard, "cloneGroupForPaste", "navigation clipboard must regenerate nested ids on paste");
  require(&navigation_clipboard, "batchIds", "copied multi-account batches must receive fresh ids");
  require(&directory_menu, "复制子目录", "directory context menu must expose copy-directory");
  require(&directory_menu, "移动到父目录", "directory context menu must expose cross-parent move");
  require(&group_menu, "粘贴子目录", "group context menu must accept copied child directories");
  require(&config_profiles, "pasteCopiedGroup", "multi-config menu must paste copied parent directories into another profile");
  require(&sidebar, "hardResetDragSession", "sidebar drag must have a hard recovery path for stale drag sessions");
  require(&sidebar, "pointercancel", "sidebar drag must recover from pointer cancellation");
  require(&app_types, "MultiAccountTemplate", "v121 multi-account template model");
  require(&app_types, "MultiAccountBatchMeta", "v121 multi-account batch metadata model");
  require(&multi_account, "parseUrlLines", "v121 URL matrix parser");
  require(&multi_account, "settings.templates", "v121 template persistence UI");
  require(&multi_account, "setProfileAlias", "v121 account alias editor");
  require(&multi_account, "replaceBatchUrl", "v121 batch URL replacement");
  require(&multi_account, "reassignBatchTarget", "v121 batch Profile reassignment");
  require(&multi_account, "deleteBatch", "v121 batch deletion");
  require(&item_slice, "deleteItemsByIds", "v121 bulk item deletion for batch manager");
  require(&normalizers, "multiAccountBatch", "v121 persisted batch metadata normalization");
  require(&ui_dialog, "uiWebsiteNameChoice", "v122 dropped website title/address naming chooser");
  require(&ui_dialog_host, "标签页标题", "v122 title naming source");
  require(&ui_dialog_host, "网站地址", "v122 address naming source");
  require(&browser_drop, "websiteAddressName", "v122 website address display-name formatter");
  require(&website_drop, "uiWebsiteNameChoice(", "v122 browser drop naming-choice integration");
  require(&ui_dialog, "websiteTitleLoader", "dropped website title lookup is deferred until naming UI is visible");
  require(&ui_dialog_host, "requestAnimationFrame", "deferred website title lookup waits until after dialog render");
  require(&edge, "WAKE_REQUIRES_POINTER_VISIT", "v122 wake pointer-visit protection state");
  require(&edge, "wake_requires_pointer_visit = false", "v122 wake protection is armed until pointer visits the window");
  require(&stable_edge, "data-ui-dialog-open", "v122 UI dialog pauses native edge docking");
  require(&website_metadata, "Client::builder()", "website metadata uses Rust HTTP client");
  require(&website_metadata, "pool_max_idle_per_host", "website metadata reuses HTTP connections");
  require(&website_metadata, "TITLE_IN_FLIGHT", "title request deduplication");
  require(&website_metadata, "FAVICON_IN_FLIGHT", "favicon request deduplication");
  require(&website_drop, "targetFromClientPoint", "native OLE coordinates resolve frontend drop targets");
  require(&website_drop, "website-drop-timing", "website drop timing diagnostics");
  require(&shortcut_router, "copyItemsToClipboard", "global shortcut router owns project clipboard shortcuts");
  require(&overlay_router, "closeTopOverlay", "overlay router owns overlay close routing");
  require(&app, "useWebsiteDropController", "App delegates website drop routing");
  require(&app_types, "ItemClickAction", "v129 project click-action model");
  require(&normalizers, "normalizeItemClickAction", "v129 persisted click-action normalization");
  require(&item_click_actions, "resolveItemClickAction", "v129 click-action resolver");
  require(&item_click_actions, "copy-name-path", "v129 combined name/path copy action");
  require(&item_card, "scheduleSingleAction", "v129 single/double click arbitration");
  require(&item_card, "getSystemDoubleClickTimeMs", "v129 system double-click timing integration");
  require(&item_menu, "点击动作", "v129 per-project click-action editor");
  require(&item_click_picker, "复制名称 +", "v129 click-action picker copy options");
  require(&area_menu, "浏览器打开方式", "v129 manual website browser route picker");
  require(&area_menu, "项目点击动作", "v129 manual website click-action picker");
  require(&ui_dialog_host, "浏览器打开方式", "v129 dropped website browser route picker");
  require(&ui_dialog_host, "项目点击动作", "v129 dropped website click-action picker");
  require(&website_drop, "choice.browserRoute", "v129 dropped website route persistence");
  require(&commands, "GetDoubleClickTime", "v129 native Windows double-click interval");
  require(&lib_rs, "commands::get_double_click_time_ms", "v129 double-click timing command registration");
  require(&double_click_timing, "get_double_click_time_ms", "v129 frontend double-click timing bridge");
  require(&browser_catalog, "enabled = true", "v129 browser scan can be deferred until the creation dialog needs it");
  require(&item_menu, "使用多选", "v130 project context menu exposes explicit multi-select mode");
  require(&item_slice, "beginMultiSelect", "v130 item store retains explicit multi-select state");
  require(&item_card, "if (multiSelectMode)", "v130 item click actions are suspended while multi-select is active");
  require(&shortcut_grid, "finishMultiSelect", "v130 multi-select UI exposes a clear completion path");
  require(&item_copy, "cloneShortcutItemsForCopy", "v130 item copy path centralizes fresh ids and batch remapping");
  require(&item_slice, "copyItemsToDirectory", "v130 multi-project copy is atomic at the store layer");

  forbid(&item_menu, "取消选择此项", "v130 removes the old per-item deselect menu command");
  forbid(&item_menu, "清除多选", "v130 removes the old clear-multi-select menu command");

  // V145：映射文件夹卡顿。三条不变量必须同时成立，否则卡顿会回来：
  // 1) 重活命令必须是 async（Tauri 里同步命令跑在主线程上）；
  // 2) 图标走原生提取，不再每个图标起一个 PowerShell 进程；
  // 3) 前端不再对镜像目录的全部条目预取图标（交给视口懒加载）。
  require(&blocking, "spawn_blocking", "v145 blocking offload helper keeps heavy commands off the main thread");
  require(&icon, "pub async fn get_file_icon", "v145 icon extraction command must be async so it never blocks the UI thread");
  require(&icon, "crate::icon_native::extract_icon_data_url", "v145 icons must prefer native extraction over PowerShell");
  require(&icon_native, "SHGetFileInfoW", "v145 native icon extraction uses the shell icon API");
  require(&icon_native, "DrawIconEx", "v145 native icon extraction composites alpha through GDI");
  require(&cargo, "png = \"0.17\"", "v145 native icon extraction encodes PNG without shelling out");
  require(&mapped_folder, "pub async fn list_mapped_folder", "v145 mapped-folder commands must not run on the main thread");
  require(&start_menu, "pub async fn list_start_menu_shortcuts", "v145 start-menu commands must not run on the main thread");
  require(&folder_mirror, "link_commands.join", "v145 shortcut creation batches every link into one PowerShell run");

  forbid(&icon, "#[tauri::command]\npub fn get_file_icon", "v145 the icon command must stay async");
  forbid(&mapped_slice, "resolveIconDataUrl", "v145 mapped folders must not eagerly resolve icons for every entry");
  forbid(&start_menu_slice, "resolveIconDataUrl", "v145 the start menu must not eagerly resolve icons for every entry");
  forbid(&mapped_folder, "#[tauri::command]\npub fn ", "v145 mapped-folder commands must stay async");

  // V146：主线程阻塞清零（第二批）。三类回归都要挡住：
  // 1) 开机自启动 / App Paths 查询回到「起 PowerShell 读注册表」（单次 330–400 ms）；
  // 2) 中转站复制、旧版库导入这两个重活命令回到同步（同步命令跑在主线程上）；
  // 3) 纯 I/O 命令（扫浏览器 / 读写配置）回到同步。
  require(&windows_registry, "RegGetValueW", "v146 registry reads must stay native instead of spawning PowerShell");
  require(&windows_registry, "RegSetValueExW", "v146 registry writes must stay native instead of spawning PowerShell");
  require(&windows_registry, "RegDeleteValueW", "v146 registry value removal must stay native");
  // 不加 `RRF_NOEXPAND` 时 `RegGetValueW` 会替我们展开 `REG_EXPAND_SZ`，但 `pcbData` 仍是
  // 未展开长度的口径 —— 实测读 `%SystemRoot%\System32` 会得到 "C:\Windows\System32\0" 再加一个
  // 类型数字（那正是 REG_EXPAND_SZ = 2）。展开必须由 expand_environment 自己做。
  require(&windows_registry, "RRF_NOEXPAND", "v146 REG_EXPAND_SZ reads must expand in our own code, not via RegGetValueW's stale size reporting");
  require(&cargo, "Win32_System_Registry", "v146 the native registry module needs the windows-sys registry feature");
  require(&commands, "crate::windows_registry::read_run_entry", "v146 auto-start detection must read the registry natively");
  require(&commands, "crate::windows_registry::write_run_entry", "v146 auto-start toggling must write the registry natively");
  require(&commands, "crate::windows_registry::find_app_path", "v146 browser App Paths lookup must stay native");
  require(&commands, "pub async fn scan_browsers", "v146 browser scanning must not run on the main thread");
  require(&commands, "pub async fn save_config", "v146 config writes must not run on the main thread");
  require(&commands, "pub async fn load_config", "v146 config reads must not run on the main thread");
  require(&transfer_station, "pub async fn copy_transfer_paths_to_folder", "v146 transfer-station copies must not run on the main thread");
  require(&legacy_import, "pub async fn import_legacy_db_config", "v146 legacy imports must not run on the main thread");

  forbid(&commands, "foreach($k in $keys)", "v146 removes the PowerShell App Paths lookup");
  forbid(&commands, "Get-ItemProperty -Path $runKey", "v146 removes the PowerShell auto-start read");
  forbid(&commands, "Remove-ItemProperty -Path $runKey", "v146 removes the PowerShell auto-start write");
  forbid(&transfer_station, "#[tauri::command]\npub fn copy_transfer_paths_to_folder", "v146 the transfer-station copy command must stay async");
  forbid(&legacy_import, "#[tauri::command]\npub fn import_legacy_db_config", "v146 the legacy import command must stay async");
  forbid(&lib_rs, "Win32::Graphics::Dwm::{DwmExtendFrameIntoClientArea, MARGINS}", "old DWM MARGINS import");
  forbid(&edge, "cached_main == 0", "cached_main integer null comparison");
  forbid(&edge, "cached_strip == 0", "cached_strip integer null comparison");
  forbid(&commands, "if hwnd == 0", "commands integer HWND comparison");
  forbid(&website_metadata, "Invoke-WebRequest", "website metadata PowerShell HTTP fallback");
  forbid(&website_metadata, "powershell.exe", "website metadata PowerShell process launch");
  forbid(&windows_manifest, "requireAdministrator", "Yue Launcher main process must never request permanent administrator elevation");
  forbid(&windows_manifest, "highestAvailable", "Yue Launcher main process must stay on the standard-user execution path");
}

fn main() {
  // Once cargo:rerun-if-changed is emitted, Cargo only watches declared inputs. Keep this list
  // aligned with the source files read by the persistent regression guard above.
  for input in VERIFIED_INPUTS {
    println!("cargo:rerun-if-changed={input}");
  }

  verify_persistent_windows_fixes();

  let windows = tauri_build::WindowsAttributes::new()
    .app_manifest(include_str!("windows-app-manifest.xml"));
  let attributes = tauri_build::Attributes::new().windows_attributes(windows);
  tauri_build::try_build(attributes).expect("failed to build Tauri application resources");
}
