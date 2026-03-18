(() => {
  const ROOT_ID = "gs-stopwatch-root";
  const STORAGE_PREFIX = "gradescope-stopwatch";
  const ROUTE_PATTERN = /^\/courses\/(\d+)\/questions\/(\d+)\/submissions\/(\d+)\/grade\/?/;

  function parseRoute(pathname) {
    const match = pathname.match(ROUTE_PATTERN);
    if (!match) {
      return null;
    }

    const [, courseId, questionId, submissionId] = match;
    return { courseId, questionId, submissionId };
  }

  const initialRoute = parseRoute(window.location.pathname);
  if (!initialRoute) {
    return;
  }

  let route = initialRoute;
  let storageKey = buildStorageKey(route);
  let elapsedMs = 0;
  let running = true;
  let startedAtMs = Date.now();
  let tickerId;
  let lastKnownPath = window.location.pathname;
  let showingCumulative = false;

  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("section");
    root.id = ROOT_ID;
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.innerHTML = `
      <div class="gs-stopwatch-title-wrap">
        <span class="gs-stopwatch-dot" aria-hidden="true"></span>
        <span class="gs-stopwatch-title">Gradescope Timer Active</span>
      </div>
      <div class="gs-stopwatch-view" id="gs-stopwatch-main-view">
        <div class="gs-stopwatch-main">
          <span class="gs-stopwatch-time" id="gs-stopwatch-time">00:00</span>
          <div class="gs-stopwatch-actions">
            <button type="button" id="gs-stopwatch-toggle">Pause</button>
            <button type="button" id="gs-stopwatch-reset">Reset</button>
          </div>
        </div>
        <div class="gs-stopwatch-submission" id="gs-stopwatch-submission"></div>
        <div class="gs-stopwatch-footer">
          <span class="gs-stopwatch-footer-spacer" aria-hidden="true"></span>
          <button
            type="button"
            class="gs-stopwatch-nav"
            id="gs-stopwatch-show-cumulative"
            aria-label="Show question cumulative time"
            title="Show question cumulative time"
          >
            &#8250;
          </button>
        </div>
      </div>
      <div class="gs-stopwatch-view" id="gs-stopwatch-cumulative-view" hidden>
        <div class="gs-stopwatch-secondary-header">
          <button
            type="button"
            class="gs-stopwatch-nav"
            id="gs-stopwatch-hide-cumulative"
            aria-label="Back to submission timer"
            title="Back to submission timer"
          >
            &#8249;
          </button>
          <span class="gs-stopwatch-secondary-label">Question cumulative time</span>
        </div>
        <div class="gs-stopwatch-secondary">
          <span class="gs-stopwatch-secondary-time" id="gs-stopwatch-cumulative-time">00:00</span>
        </div>
      </div>
    `;

    attach(root);
    wireEvents();
  }

  function buildStorageKey(ids) {
    return `${STORAGE_PREFIX}:${ids.courseId}:${ids.questionId}:${ids.submissionId}`;
  }

  function buildQuestionPrefix(ids) {
    return `${STORAGE_PREFIX}:${ids.courseId}:${ids.questionId}:`;
  }

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
    const submissionNode = root.querySelector("#gs-stopwatch-submission");

    if (timeNode) {
      timeNode.textContent = formatDuration(getDisplayElapsedMs());
    }

    if (submissionNode) {
      submissionNode.textContent = `Submission #${route.submissionId}`;
    }
  }

  function renderCumulative(totalMs) {
    const cumulativeNode = root.querySelector("#gs-stopwatch-cumulative-time");
    if (cumulativeNode) {
      cumulativeNode.textContent = formatDuration(totalMs);
    }
  }

  function setView(nextView) {
    showingCumulative = nextView === "cumulative";

    const mainView = root.querySelector("#gs-stopwatch-main-view");
    const cumulativeView = root.querySelector("#gs-stopwatch-cumulative-view");

    if (showingCumulative) {
      mainView?.setAttribute("hidden", "");
      cumulativeView?.removeAttribute("hidden");
      refreshCumulative();
      return;
    }

    cumulativeView?.setAttribute("hidden", "");
    mainView?.removeAttribute("hidden");
  }

  function persist() {
    const payload = {
      elapsedMs: getDisplayElapsedMs(),
      running,
      savedAt: Date.now()
    };

    chrome.storage.local.set({ [storageKey]: payload }, refreshCumulative);
  }

  function refreshCumulative() {
    const questionPrefix = buildQuestionPrefix(route);
    chrome.storage.local.get(null, (allValues) => {
      let totalMs = 0;
      Object.entries(allValues).forEach(([key, value]) => {
        if (!key.startsWith(questionPrefix)) {
          return;
        }

        if (value && typeof value.elapsedMs === "number") {
          totalMs += value.elapsedMs;
        }
      });

      renderCumulative(totalMs);
    });
  }

  function attach(node) {
    const target =
      document.querySelector(".submissionActions") ||
      document.querySelector(".js-submissionActions") ||
      document.querySelector(".submissionStatus--bottom") ||
      document.querySelector("main") ||
      document.body;

    if (!node.isConnected) {
      target.appendChild(node);
    }
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
    const showCumulativeBtn = root.querySelector("#gs-stopwatch-show-cumulative");
    const hideCumulativeBtn = root.querySelector("#gs-stopwatch-hide-cumulative");

    toggle?.addEventListener("click", () => setRunning(!running));
    resetBtn?.addEventListener("click", reset);
    showCumulativeBtn?.addEventListener("click", () => setView("cumulative"));
    hideCumulativeBtn?.addEventListener("click", () => setView("main"));

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        persist();
      }
    });

    window.addEventListener("beforeunload", persist);
  }

  function loadRoute(nextRoute) {
    const nextKey = buildStorageKey(nextRoute);
    if (nextKey === storageKey) {
      return;
    }

    persist();

    route = nextRoute;
    storageKey = nextKey;
    elapsedMs = 0;
    running = true;
    startedAtMs = Date.now();

    const toggle = root.querySelector("#gs-stopwatch-toggle");
    if (toggle) {
      toggle.textContent = "Pause";
    }

    root.classList.remove("is-paused");
    render();

    chrome.storage.local.get(storageKey, (result) => {
      const stored = result[storageKey];
      if (stored && typeof stored.elapsedMs === "number") {
        elapsedMs = stored.elapsedMs;
        running = Boolean(stored.running);
        startedAtMs = Date.now();

        if (toggle) {
          toggle.textContent = running ? "Pause" : "Resume";
        }

        root.classList.toggle("is-paused", !running);
      }

      render();
      persist();
      refreshCumulative();
      setView(showingCumulative ? "cumulative" : "main");
    });
  }

  function checkRouteChange() {
    const nextPath = window.location.pathname;
    if (nextPath === lastKnownPath) {
      return;
    }

    lastKnownPath = nextPath;
    const nextRoute = parseRoute(nextPath);

    if (!nextRoute) {
      root.style.display = "none";
      return;
    }

    root.style.display = "";
    attach(root);
    loadRoute(nextRoute);
  }

  function installHistoryHooks() {
    if (window.__gsStopwatchHistoryHooked) {
      return;
    }

    window.__gsStopwatchHistoryHooked = true;

    const wrap = (methodName) => {
      const original = history[methodName];
      history[methodName] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        window.dispatchEvent(new Event("gs-stopwatch-route-change"));
        return result;
      };
    };

    wrap("pushState");
    wrap("replaceState");

    window.addEventListener("popstate", () => {
      window.dispatchEvent(new Event("gs-stopwatch-route-change"));
    });

    window.addEventListener("gs-stopwatch-route-change", checkRouteChange);
    setInterval(checkRouteChange, 500);
  }

  function restoreInitialStateAndStart() {
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
      refreshCumulative();
      setView(showingCumulative ? "cumulative" : "main");
      startTicker();
    });
  }

  installHistoryHooks();
  restoreInitialStateAndStart();
})();
