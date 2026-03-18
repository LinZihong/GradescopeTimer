(() => {
  const ROOT_ID = "gs-stopwatch-root";
  const STORAGE_PREFIX = "gradescope-stopwatch";

  const match = window.location.pathname.match(
    /^\/courses\/(\d+)\/questions\/(\d+)\/submissions\/(\d+)\/grade\/?/
  );

  if (!match || document.getElementById(ROOT_ID)) {
    return;
  }

  const [, courseId, questionId, submissionId] = match;
  const storageKey = `${STORAGE_PREFIX}:${courseId}:${questionId}:${submissionId}`;

  let elapsedMs = 0;
  let running = true;
  let startedAtMs = Date.now();
  let tickerId;

  const root = document.createElement("section");
  root.id = ROOT_ID;
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
    <div class="gs-stopwatch-title-wrap">
      <span class="gs-stopwatch-dot" aria-hidden="true"></span>
      <span class="gs-stopwatch-title">Gradescope Timer Active</span>
    </div>
    <div class="gs-stopwatch-main">
      <span class="gs-stopwatch-time" id="gs-stopwatch-time">00:00</span>
      <div class="gs-stopwatch-actions">
        <button type="button" id="gs-stopwatch-toggle">Pause</button>
        <button type="button" id="gs-stopwatch-reset">Reset</button>
      </div>
    </div>
    <div class="gs-stopwatch-submission">Submission #${submissionId}</div>
  `;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    return `${pad(minutes)}:${pad(seconds)}`;
  }

  function getDisplayElapsedMs() {
    if (!running) {
      return elapsedMs;
    }

    return elapsedMs + (Date.now() - startedAtMs);
  }

  function render() {
    const timeNode = root.querySelector("#gs-stopwatch-time");
    if (!timeNode) return;
    timeNode.textContent = formatDuration(getDisplayElapsedMs());
  }

  function persist() {
    const payload = {
      elapsedMs: getDisplayElapsedMs(),
      running,
      savedAt: Date.now()
    };

    chrome.storage.local.set({ [storageKey]: payload });
  }

  function attach() {
    const target =
      document.querySelector(".submissionActions") ||
      document.querySelector(".js-submissionActions") ||
      document.querySelector(".submissionStatus--bottom") ||
      document.querySelector("main") ||
      document.body;

    target.appendChild(root);
  }

  function startTicker() {
    clearInterval(tickerId);
    tickerId = setInterval(() => {
      render();
      if (running) {
        persist();
      }
    }, 1000);
  }

  function setRunning(nextRunning) {
    if (running === nextRunning) {
      return;
    }

    if (nextRunning) {
      startedAtMs = Date.now();
    } else {
      elapsedMs = getDisplayElapsedMs();
    }

    running = nextRunning;
    const toggle = root.querySelector("#gs-stopwatch-toggle");
    if (toggle) {
      toggle.textContent = running ? "Pause" : "Resume";
    }

    root.classList.toggle("is-paused", !running);
    render();
    persist();
  }

  function reset() {
    elapsedMs = 0;
    startedAtMs = Date.now();
    render();
    persist();
  }

  function wireEvents() {
    const toggle = root.querySelector("#gs-stopwatch-toggle");
    const resetBtn = root.querySelector("#gs-stopwatch-reset");

    toggle?.addEventListener("click", () => setRunning(!running));
    resetBtn?.addEventListener("click", reset);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        persist();
      }
    });

    window.addEventListener("beforeunload", persist);
  }

  function restoreAndStart() {
    chrome.storage.local.get(storageKey, (result) => {
      const stored = result[storageKey];

      if (stored && typeof stored.elapsedMs === "number") {
        elapsedMs = stored.elapsedMs;
        running = Boolean(stored.running);
        startedAtMs = Date.now();

        const toggle = root.querySelector("#gs-stopwatch-toggle");
        if (toggle) {
          toggle.textContent = running ? "Pause" : "Resume";
        }
      }

      root.classList.toggle("is-paused", !running);
      render();
      persist();
      startTicker();
    });
  }

  attach();
  wireEvents();
  restoreAndStart();
})();
