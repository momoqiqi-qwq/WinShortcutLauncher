# V39 - Help and Sponsor Settings

## Changes

1. Added a new **说明** settings tab.
   - Shows the current modification version: `v39`.
   - Shows the app/package version: `0.1.39`.
   - Adds usage notes for adding items, launching items, tag/subdirectory management, notes, search/transfer/image preview, and backup/export.

2. Added a new **赞助** settings tab.
   - Includes the uploaded WeChat/Alipay payment QR code.
   - QR code is bundled as a local asset under `src/assets/sponsor-qr.png`, so it displays offline and follows the current UI theme panel style.

3. Added Vite asset type declaration.
   - `src/vite-env.d.ts` allows TypeScript to import image assets.

4. Updated app version metadata.
   - `package.json`: `0.1.39`
   - `src-tauri/tauri.conf.json`: `0.1.39`

## Verification

- Ran `npm run build` successfully.
- Rust/Tauri native build was not run in this environment.
