# Rhythm

Rhythm is a tactile, highly visual weekly planner for shaping the broad movement of a day without turning it into a meeting calendar or corporate task board. The week runs Monday through Sunday on one continuous canvas, with a horizontal timeline from 6 AM through 6 AM the following morning.

[View the private GitHub repository](https://github.com/ClaireLydiaWalton/day-planner-app)

## Install on Windows

For a normal personal installation, open:

```text
src-tauri\target\release\bundle\nsis\Rhythm_0.1.0_x64-setup.exe
```

Follow the installer prompts, then search for **Rhythm** in the Start menu. To keep it handy, open Rhythm, right-click its lotus icon on the taskbar, and choose **Pin to taskbar**.

An MSI installer is also generated at:

```text
src-tauri\target\release\bundle\msi\Rhythm_0.1.0_x64_en-US.msi
```

The NSIS `.exe` is the simplest choice for an ordinary installation. Reinstalling a newer build preserves the existing schedule because app data is stored separately from the program files.

## Using Rhythm

### Build a week

- Drag an activity from the sidebar onto any day and time.
- Double-click a sidebar activity to put it in the next open space on the currently selected day.
- Drag a scheduled block horizontally to move it in time or vertically to another day. Blocks push against neighboring blocks instead of overlapping them.
- Drag a block's left or right border to change its start or end time. Times snap to 15-minute increments.
- Drag its top or bottom border across adjacent day rows to repeat that activity at the same time on several days. Later horizontal resizing keeps the linked occurrences in sync.
- Double-click one scheduled occurrence to remove it, or drag it off the calendar and back into the sidebar removal zone.
- Click a day label to select it. The activity, planned, and open counters describe that selected day.

### Special sleep blocks

Sleep is intentionally translucent and textured. When a Sleep block reaches the end of the night, it creates a linked morning segment on the next day through 7 AM. The morning segment displays the total sleep across both sides. Removing either side removes that linked sleep pair, while other days' Sleep blocks remain untouched.

### Activity deck

- Select **+** to create a reusable activity with a name, color, and default duration.
- Select **EDIT BLOCKS**, then select any activity to rename it, recolor it, change its default duration, or remove it from the deck. Select **DONE** when finished.
- Editing a block's name or color updates already scheduled copies. Removing it from the deck does not erase activities already placed on the calendar.
- Rise and Settle are paired visual bookends; Sleep has its own behavior and appearance.

### Planner controls

- **UNDO / REDO** — move backward or forward through edits made during the current session.
- **LOCK** — prevent moving, resizing, clearing, or adding activities while leaving the week readable.
- **BACKUP** — download the complete planner state as JSON.
- **RESTORE** — load a Rhythm JSON backup.
- **CLEAR WEEK** — clear only the visible week after confirmation. It can be undone immediately.
- **Day menu (•••)** — copy, paste, or clear one day.
- **TODAY** or the displayed date range — return to the current week and focus today.
- **RESET** — restore the demo schedule and default activity deck after confirmation.
- **Hacker / Earth / Ocean / Dream / Velvet** — change the complete visual skin without changing the schedule.
- **CHANGE / RESTART** — cycle or restart the meditative drawing. **TAO** switches to the preserved Tao Te Ching chapter card.

## Saving and backups

The desktop app saves changes automatically to a local SQLite database. No account, cloud service, or internet connection is needed for planning. **BACKUP** is still recommended before experiments or major computer changes because it creates a portable copy you can restore later.

The original browser prototype and the desktop app use different storage locations. To migrate a browser schedule, choose **BACKUP** in the browser version and **RESTORE** in the desktop app once. Future desktop edits then save automatically to SQLite.

The GitHub link in the sidebar opens this repository in the computer's normal web browser; the native app permission is restricted to that exact URL.

## Technology

- [Tauri 2](https://v2.tauri.app/) for the lightweight native Windows shell and installers
- Vite and TypeScript for frontend tooling
- Handcrafted HTML, CSS, canvas animation, and native drag-and-drop interactions
- SQLite for desktop persistence
- Browser local storage as a fallback during frontend-only development

Tauri's native file-drop interception is disabled so Rhythm's HTML drag-and-drop planner interactions work correctly inside WebView2.

## Development setup

Install these prerequisites:

1. Node.js LTS
2. Rust with the stable MSVC toolchain
3. Microsoft Visual Studio Build Tools with **Desktop development with C++**
4. Microsoft Edge WebView2 Runtime

Then, from the repository root:

```powershell
npm install
npm run tauri dev
```

The first Rust compilation is substantially slower than later launches.

Useful commands:

```powershell
# Type-check and build the web frontend
npm run build

# Create the Windows EXE and MSI installers
npm run tauri build
```

The native regression harness in `scripts/desktop-smoke.mjs` attaches to a development WebView2 window. Start the app with a debugging port in one PowerShell window:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
npm run tauri dev
```

Then run a harness mode from a second PowerShell window:

```powershell
# Main drag, resize, theme, and SQLite exercise
npm run test:desktop

# Non-mutating checks
$env:WEEK_RHYTHM_TEST_MODE="inspect"; npm run test:desktop
$env:WEEK_RHYTHM_TEST_MODE="credits"; npm run test:desktop

# Focused edit-mode and undoable-clear checks (both restore their starting state)
$env:WEEK_RHYTHM_TEST_MODE="edit-blocks"; npm run test:desktop
$env:WEEK_RHYTHM_TEST_MODE="clear-week"; npm run test:desktop
```

The default exercise deliberately leaves a marker in SQLite so persistence can be checked after restarting the development app. After the restart, run the following; `verify` also restores the exact pre-test planner state:

```powershell
$env:WEEK_RHYTHM_TEST_MODE="verify"; npm run test:desktop
Remove-Item Env:\WEEK_RHYTHM_TEST_MODE
```

## Project structure

```text
index.html                 Main application markup
src/app.js                 Planner state and interactions
src/styles.css             Layout, blocks, animations, and all five skins
src/desktop-store.ts       SQLite-backed desktop persistence
src/external-links.ts      Safe system-browser GitHub link
scripts/desktop-smoke.mjs  Native regression harness
src-tauri/                 Tauri configuration, Rust shell, icons, and bundles
```

## Acknowledgments

Rhythm was conceived, directed, and iteratively designed by Claire Walton, with design exploration and software development completed in collaboration with OpenAI Codex.

## Copyright

© Claire Walton. All rights reserved.
