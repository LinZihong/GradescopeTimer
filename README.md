# Gradescope Submission Stopwatch

A Chrome extension that adds a grading timer directly to Gradescope submission pages.

It is designed for the common grading workflow where you move from one submission to the next inside Gradescope and want to keep track of how long each one takes.

![Example](demo.png)

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `GradescopeTimer`.
5. Open a Gradescope submission grading page.

## Features

- Shows a clear stopwatch overlay on Gradescope grading pages
- Starts a fresh timer for each submission
- Supports `Pause`, `Resume`, and `Reset`
- Remembers time for each submission if you refresh the page
- Shows the previous submission's time under the current timer
- Includes a cumulative view for question-wide and current-session stats
- Lets you drag the timer overlay anywhere on the page

## Where it appears

The extension activates on grading URLs like:

`https://www.gradescope.com/courses/<course_id>/questions/<question_id>/submissions/<submission_id>/grade`

## Cumulative View

The side arrow opens a secondary view with:

- `Question cumulative time`: total stored time for this question
- `Session total`: total for earlier submissions visited in the current page-load session
- `Session average`: average over completed submissions in the current page-load session
- `Visited this session`: how many unique submissions you have visited in the current page-load session, excluding the current one from the average

A new session starts when the grading page is loaded normally, such as opening it from elsewhere or refreshing the page. Moving between submissions inside Gradescope's SPA keeps you in the same session.


## Special Feature: W.A.N.G. Method

The Wang Assessment Normalization Grading (W.A.N.G.) Method is a state-of-the-art time-efficiency–driven evaluation framework in which any assessment item exceeding the 30-second readability threshold is automatically normalized to full credit. This approach prioritizes instructor cognitive load management while implicitly rewarding problems of sufficient length and/or opacity. Although not widely adopted (for obvious reasons), the W.A.N.G. Method represents a bold rethinking of grading scalability under real-world attention constraints. This method can be toggled in the UI.

## Project Files

- `manifest.json`: Chrome extension manifest
- `content.js`: timer logic, persistence, SPA handling, and UI behavior
- `styles.css`: overlay styling
- `icons/`: extension icons
