# v56 note line alignment and browser drop fix

- Fixed note line numbers drifting away from real textarea lines by measuring logical line height with sub-pixel DOM rects instead of rounded scrollHeight/offsetHeight.
- Removed default button appearance from note line numbers so row boxes no longer accumulate visual offset.
- Switched Tauri WebView drag drop interception off for the main window so browser URLs/tabs can be dropped into the app via normal HTML drag/drop.
- Added DOM file/link drop fallback: files still open the import dialog, browser URLs create website shortcuts in the current normal directory.
- Version bumped to 0.1.56.
