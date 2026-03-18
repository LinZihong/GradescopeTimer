# Gradescope Submission Stopwatch (Chrome Extension Prototype)

A lightweight Chrome extension that injects a stopwatch onto Gradescope grading pages, so you can track how long each submission takes.

## Activation URL

The extension activates on URLs matching:

- `https://www.gradescope.com/courses/*/questions/*/submissions/*/grade*`

Example:

- `https://www.gradescope.com/courses/1207608/questions/67851641/submissions/3771484204/grade`

## Features

- Clear active badge: **"Gradescope Timer • ACTIVE"**
- Per-submission timer keyed by submission ID
- Auto-starts when page loads
- Pause / Resume / Reset controls
- Uses `localStorage` so page refreshes keep elapsed time

## Install (Developer Mode)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder (`GradescopeTimer`).
5. Open a Gradescope submission grading page.

## Notes

- This is a prototype overlay and currently appears as a fixed card in the top-right corner.
- It is intentionally independent of Gradescope's internal DOM structure for reliability.
