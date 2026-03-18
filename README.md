# Gradescope Submission Stopwatch (Chrome Extension)

A lightweight Manifest V3 Chrome extension that injects a stopwatch into Gradescope submission grading pages.

## What it does

- Activates on URLs that look like:
  - `https://www.gradescope.com/courses/<course_id>/questions/<question_id>/submissions/<submission_id>/grade`
- Shows a visible **"Gradescope Timer Active"** panel.
- Shows the **current submission stopwatch** prominently.
- Resets to a fresh stopwatch when Gradescope navigates to a different submission via in-page SPA routing.
- Provides **Pause/Resume** and **Reset** controls.
- Saves per-submission elapsed time in `chrome.storage.local` so refreshes keep your time.
- Computes a per-question cumulative total, shown in a secondary expandable section so it is less visually prominent.

## Install (developer mode)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder (`GradescopeTimer`).

## Files

- `manifest.json` – extension manifest and URL match pattern.
- `content.js` – timer logic, SPA route handling, persistence, and page injection.
- `styles.css` – timer panel styles.

## Note on PR compatibility

This version intentionally avoids binary assets (like PNG icons) so patch-only Git/PR tools that reject binary files can accept the diff cleanly.
