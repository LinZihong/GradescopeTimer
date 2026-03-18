(() => {
  const ROOT_ID = "gst-stopwatch-root";
  const STORAGE_PREFIX = "gst-stopwatch:";

  const SUBMISSION_REGEX = /\/courses\/(\d+)\/questions\/(\d+)\/submissions\/(\d+)\/grade/;
  const match = window.location.pathname.match(SUBMISSION_REGEX);
  if (!match) {
    return;
  }

  if (document.getElementById(ROOT_ID)) {
    return;
  }

  const submissionId = match[3];
  const storageKey = `${STORAGE_PREFIX}${submissionId}`;

  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  })();

  const state = {
    elapsedMs: Number(saved?.elapsedMs) || 0,
    running: saved?.running !== false,
    startedAt: Date.now()
  };

  if (state.running) {
    state.startedAt = Date.now();
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;

  root.innerHTML = `
    <div class="gst-stopwatch-card">
      <div class="gst-stopwatch-title">Gradescope Timer • ACTIVE</div>
      <div class="gst-stopwatch-time" id="gst-stopwatch-time">00:00</div>
      <div class="gst-stopwatch-meta">Submission #${submissionId}</div>
      <div class="gst-stopwatch-controls">
        <button class="gst-stopwatch-btn" id="gst-pause-resume" data-variant="primary">Pause</button>
        <button class="gst-stopwatch-btn" id="gst-reset">Reset</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const timeEl = document.getElementById("gst-stopwatch-time");
  const pauseResumeBtn = document.getElementById("gst-pause-resume");
  const resetBtn = document.getElementById("gst-reset");

  const formatDuration = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");

    return hours > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const getCurrentElapsed = () => {
    if (!state.running) {
      return state.elapsedMs;
    }

    return state.elapsedMs + (Date.now() - state.startedAt);
  };

  const persist = () => {
    const currentElapsed = getCurrentElapsed();
    const data = {
      elapsedMs: currentElapsed,
      running: state.running,
      updatedAt: Date.now()
    };

    localStorage.setItem(storageKey, JSON.stringify(data));

    if (state.running) {
      state.elapsedMs = currentElapsed;
      state.startedAt = Date.now();
    }
  };

  const render = () => {
    timeEl.textContent = formatDuration(getCurrentElapsed());
    pauseResumeBtn.textContent = state.running ? "Pause" : "Resume";
  };

  pauseResumeBtn.addEventListener("click", () => {
    if (state.running) {
      state.elapsedMs = getCurrentElapsed();
      state.running = false;
    } else {
      state.startedAt = Date.now();
      state.running = true;
    }

    persist();
    render();
  });

  resetBtn.addEventListener("click", () => {
    state.elapsedMs = 0;
    state.startedAt = Date.now();
    state.running = true;
    persist();
    render();
  });

  render();

  setInterval(() => {
    render();
  }, 250);

  setInterval(() => {
    persist();
  }, 1000);

  window.addEventListener("beforeunload", persist);
})();
