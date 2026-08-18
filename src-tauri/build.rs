use std::{env, fs, path::PathBuf};

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
  let app_store = fs::read_to_string(root.join("src/stores/appStore.ts")).expect("read appStore.ts");
  let lib_rs = fs::read_to_string(manifest.join("src/lib.rs")).expect("read lib.rs");
  let edge = fs::read_to_string(manifest.join("src/edge_dock_native.rs")).expect("read edge_dock_native.rs");
  let commands = fs::read_to_string(manifest.join("src/commands.rs")).expect("read commands.rs");
  let cargo = fs::read_to_string(manifest.join("Cargo.toml")).expect("read Cargo.toml");

  require(&app_store, "browserRouter: defaults.browserRouter!", "appStore browserRouter default");
  require(&lib_rs, "Win32::UI::Controls::MARGINS", "MARGINS import from Win32::UI::Controls");
  require(&lib_rs, "null_mut(),", "SetWindowPos insert-after pointer");
  require(&edge, "let mut cached_main: HWND = std::ptr::null_mut();", "cached_main HWND null initialization");
  require(&edge, "let mut cached_strip: HWND = std::ptr::null_mut();", "cached_strip HWND null initialization");
  require(&edge, "Mode::AutoHidden { edge, restore_rect, hidden_rect, .. }", "AutoHidden edge binding");
  require(&commands, "if hwnd.is_null()", "commands HWND null check");
  require(&cargo, "\"Win32_UI_Controls\"", "windows-sys Win32_UI_Controls feature");

  forbid(&lib_rs, "Win32::Graphics::Dwm::{DwmExtendFrameIntoClientArea, MARGINS}", "old DWM MARGINS import");
  forbid(&edge, "cached_main == 0", "cached_main integer null comparison");
  forbid(&edge, "cached_strip == 0", "cached_strip integer null comparison");
  forbid(&commands, "if hwnd == 0", "commands integer HWND comparison");
}

fn main() {
  verify_persistent_windows_fixes();
  tauri_build::build()
}
