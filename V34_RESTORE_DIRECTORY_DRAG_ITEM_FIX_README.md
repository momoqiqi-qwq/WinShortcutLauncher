# V34 - Restore Directory Drag + Keep Single Click Item Fix

## Changes

1. Restored the subdirectory/tag drag behavior that was accidentally changed in V32.
   - Drag activation distance is back to 6px.
   - Directory/tag drag listeners are attached the same way as before.
   - Special directories are no longer disabled by the accidental drag-sort guard.

2. Kept the intended V33 fix for items inside subdirectories.
   - In single-click launch mode, item cards only enter sorting drag after a long press.
   - Single-clicking an item to open it no longer makes the item stick to the mouse.

3. Kept the requested special "All" behavior for adding subdirectories.
   - Adding a subdirectory while inside the All directory still shows the special-directory notice and does not create a child directory.

## Build

- Ran `npm run build` successfully.
- Rust/Tauri native build was not run in this environment.
