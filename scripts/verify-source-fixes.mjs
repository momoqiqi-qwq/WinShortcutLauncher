import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const checks = [
  ['src/stores/appStore.ts', /browserRouter:\s*defaults\.browserRouter!/, 'appStore must initialize browserRouter from defaults with a non-null assertion'],
  ['src-tauri/src/lib.rs', /Win32::UI::Controls::MARGINS/, 'MARGINS must be imported from Win32::UI::Controls'],
  ['src-tauri/src/lib.rs', /if\s+hwnd\.is_null\(\)/, 'Win32 HWND checks must use is_null()'],
  ['src-tauri/src/lib.rs', /SetWindowPos\([\s\S]*?hwnd,[\s\S]*?null_mut\(\)/, 'SetWindowPos insert-after must use null_mut()'],
  ['src-tauri/src/edge_dock_native.rs', /let mut cached_main:\s*HWND\s*=\s*std::ptr::null_mut\(\)/, 'cached_main HWND must initialize with null_mut()'],
  ['src-tauri/src/edge_dock_native.rs', /let mut cached_strip:\s*HWND\s*=\s*std::ptr::null_mut\(\)/, 'cached_strip HWND must initialize with null_mut()'],
  ['src-tauri/src/edge_dock_native.rs', /Mode::AutoHidden\s*\{\s*edge,\s*restore_rect,\s*hidden_rect,\s*\.\./, 'FORCE_SHOW AutoHidden branch must bind edge'],
  ['src-tauri/src/commands.rs', /if\s+hwnd\.is_null\(\)/, 'commands HWND checks must use is_null()'],
  ['src-tauri/Cargo.toml', /"Win32_UI_Controls"/, 'windows-sys must enable Win32_UI_Controls'],
];

const forbidden = [
  ['src-tauri/src/lib.rs', /Win32::Graphics::Dwm::\{[^}]*\bMARGINS\b/, 'Do not import MARGINS from Win32::Graphics::Dwm'],
  ['src-tauri/src/edge_dock_native.rs', /\b(?:hwnd|hmon|cached_main|cached_strip)\s*(?:==|!=)\s*0\b/, 'Do not compare Win32 handles to integer 0'],
  ['src-tauri/src/commands.rs', /\bhwnd\s*(?:==|!=)\s*0\b/, 'Do not compare command HWND values to integer 0'],
];

const failures = [];
for (const [file, pattern, message] of checks) {
  const source = read(file);
  if (!pattern.test(source)) failures.push(`${file}: ${message}`);
}
for (const [file, pattern, message] of forbidden) {
  const source = read(file);
  if (pattern.test(source)) failures.push(`${file}: ${message}`);
}

if (failures.length) {
  console.error('Persistent source-fix verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Persistent Windows/Rust source fixes: OK');
