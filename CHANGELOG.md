# Changelog

All notable changes to this project will be documented in this file.

## [2.5.2] - 2026-03-31
### Added
- Initial project website for GitHub Pages in `docs/index.html` + `docs/styles.css` (Scherer-theme landing page, highlights, screenshots, install section).
- `docs/PAGES_SETUP.md` with step-by-step GitHub Pages activation instructions.

### Docs
- README now includes a dedicated “Website (GitHub Pages)” section.
## [2.5.1] - 2026-03-31
### Changed
- Simplified `printing.js`: official print path is now the Python bridge only (legacy JS COM/LibreOffice helper paths removed from runtime flow).
- `druckeLabel`, `druckeBoardkarte`, `druckeCheckliste` now consistently apply runtime printer fallbacks before calling Python bridge.

### Docs
- README updated to document Python bridge as the official print subsystem and list required Python dependencies (`py -3`, `pywin32`).

## [2.5.0] - 2026-03-31
### Changed
- Printing for Label/Boardkarte/Checkliste is now delegated to a dedicated Python bridge (`src/main/printing_bridge.py`) based on the proven PySide logic.
- Electron printing now prefers `py -3` and falls back to `python` for invoking the Python bridge.

### Added
- New Python print bridge CLI with JSON result output for robust integration and clearer print logs in the JS app.

## [2.4.14] - 2026-03-31
### Changed
- Job-options popup now uses direct modern glow checkboxes (`input[type=checkbox]`) instead of custom wrapped switch/mark structures for more robust rendering.

## [2.4.13] - 2026-03-31
### Fixed
- Boardkarte print now tries a Python `win32com` path first (matching the proven PySide behavior), then falls back to JS/PowerShell COM if unavailable.
- Added detailed Python print logs (`stdout/stderr/RC`) to ease duplex diagnosis.

## [2.4.12] - 2026-03-31
### Changed
- Replaced job-options popup switches with modern glow checkboxes (same IDs/behavior, new visual style).

## [2.4.11] - 2026-03-31
### Fixed
- Boardkarte print now uses workbook-level `PrintOut` (`wb.PrintOut`) for more reliable multi-page output in COM hosts.
- UI status now shows boardcard duplex diagnostics (`DUPLEX=...`) from print logs.

## [2.4.10] - 2026-03-31
### Fixed
- Job-options toggle rows now use a strict two-column grid (`text | switch`) per row, preventing text/switch separation or collapsed switch-only columns.

## [2.4.9] - 2026-03-31
### Fixed
- Job-options popup row layout corrected: each row now shows label text on the left and the corresponding toggle on the right (paired in one line).

## [2.4.8] - 2026-03-31
### Fixed
- Boardkarte duplex handling now verifies the applied duplex mode before print and falls back from `TwoSidedShortEdge` to `TwoSidedLongEdge` when the driver does not accept short-edge mode.
- Boardkarte print log now includes the effective duplex mode (`DUPLEX=...`) for easier diagnosis.

## [2.4.7] - 2026-03-31
### Fixed
- Final job-options toggle CSS fix:
  - dialog label rule now excludes `.switch-row`,
  - switch rows in the popup are explicitly flex-aligned again.

## [2.4.6] - 2026-03-31
### Fixed
- Job options toggle styling in the popup restored:
  - switch rows render correctly again after dialog-label CSS collision,
  - alignment remains clean while preserving the original toggle look.

## [2.4.5] - 2026-03-31
### Fixed
- Boardkarte Excel print now sets `ActivePrinter` explicitly (including printer port when available) and passes it to `PrintOut`, reducing cases where Excel ignores duplex queue settings.

## [2.4.4] - 2026-03-31
### Fixed
- Boardkarte print pipeline now matches the working PySide behavior more closely:
  - default printer switch prefers `WScript.Network` (with CIM fallback),
  - duplex/paper settings are applied again directly before Excel `PrintOut`.

## [2.4.3] - 2026-03-31
### Fixed
- Boardkarte Excel print call no longer forces page range `1..1`; all selected pages are printed, so duplex back side is included.

## [2.4.2] - 2026-03-31
### Added
- New "Erstellen/Drucken auswählen" popup on main and speed pages with toggle-based selection for each document type.

### Changed
- Print-mode dropdown workflow replaced by per-document create/print toggles.
- Job runner and document generation now support independent document-type control (Label, Boardkarte, Checkliste).

### Fixed
- Selection menu is now session-only and resets after app restart (no persistence).
- Floating create button now hides when either the device popup or the new options popup is open.

## [2.4.1] - 2026-03-31
### Added
- Hero area now uses the Uiverse-inspired `chilly-swan-51` loader animation (always on, theme-accent aware).

### Fixed
- Settings sidebar item no longer shows the extra nav indicator dot next to the gear icon.
- Floating create button sizing/positioning refined to avoid clipping outside viewport.

## [2.4.0] - 2026-03-31
### Changed
- Sidebar navigation restyled to a Uiverse-inspired pill/radio look with smoother active states.
- Floating "Dokumente erstellen" action aligned to the main content area and refined for hover-first green behavior.

## [2.3.1] - 2026-03-31
### Fixed
- Dark mode model input no longer turns white after datalist/autofill selection (`-webkit-autofill` override).
- Skeleton loader animation made smoother and less janky while scrolling.
- Label model replacement hardened to avoid unwanted `Ecosys` leftovers.

## [2.3.0] - 2026-03-31
### Added
- Network device double-click detail popup with technician input.
- Direct "Dokumente erstellen" flow from the network popup using merged data (Lager + detected device).
- Inline popup feedback for validation and generation errors.
- Custom settings icon asset (`assets/settings.png`) with dark-mode red + white glow styling.

### Changed
- Main "Dokumente erstellen" interaction moved to a persistent floating action button on home.
- Startup UX changed to local skeleton loading instead of global blocking overlay.
- Model selection via datalist now applies immediately on selection (no blur required).

## [2.0.0] - 2026-03-31
### Added
- Initial Electron rewrite with main UI, speed mode, files/history/settings pages.
- Data provider layer (`TxtDataProvider`, SQL scaffold), template resolution, doc generation.
- Printing pipeline with per-document printer targets and reachability checks.
- Network device scan with table + popup workflow.
- UI refinements: skeleton loaders, floating create action, custom settings icon, dark-mode icon glow.
