#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  if shortcut_launcher_lib::ensure_medium_integrity_before_run() {
    return;
  }
  shortcut_launcher_lib::run();
}
