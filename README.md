# Rhythm Desktop

The standalone Windows edition of Rhythm: a tactile, highly visual weekly planner for composing the shape of a day without turning it into a corporate calendar.

## Foundation

- Tauri 2 desktop shell
- Vite and TypeScript tooling
- The original handcrafted HTML, CSS, and canvas interface
- SQLite persistence in the desktop app
- Browser local-storage fallback during frontend development

The desktop window disables Tauri's native file-drop interception so Rhythm's HTML drag-and-drop interactions continue to work on Windows.

## Install on Windows

Builds are written under `src-tauri/target/release/bundle`. For a normal personal installation, open the `nsis/Rhythm_0.1.0_x64-setup.exe` package and follow the prompts. The MSI package in the neighboring `msi` folder is available for Windows Installer-based deployment.

After installation, search for **Rhythm** from the Start menu. To keep it on the taskbar, right-click the running lotus icon and choose **Pin to taskbar**.

## Development

Prerequisites: Node.js LTS, Rust with the MSVC toolchain, Microsoft C++ Build Tools with **Desktop development with C++**, and WebView2.

```powershell
npm install
npm run tauri dev
```

The first Rust build is substantially slower than later launches.

The native regression harness in `scripts/desktop-smoke.mjs` attaches to a development WebView2 window and exercises HTML drag-and-drop, edge resizing, theme switching, SQLite saving, process restart persistence, and exact pre-test state restoration.

```powershell
npm run tauri build
```

## Existing schedule

The browser prototype and desktop app use different storage locations. Use **BACKUP** in the prototype and **RESTORE** in the desktop app once; subsequent desktop changes are written to SQLite automatically.
