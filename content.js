(() => {
  const ROOT_ID = "gs-stopwatch-root";
  const STORAGE_PREFIX = "gradescope-stopwatch";
  const SESSION_PREFIX = `${STORAGE_PREFIX}:session`;
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
  let previousSubmission = null;
  let dragState = null;

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
        <div class="gs-stopwatch-previous" id="gs-stopwatch-previous" hidden></div>
        <button
          type="button"
          class="gs-stopwatch-nav gs-stopwatch-nav-side"
          id="gs-stopwatch-show-cumulative"
          aria-label="Show question cumulative time"
          title="Show question cumulative time"
        >
          &#8250;
        </button>
      </div>
      <div class="gs-stopwatch-view" id="gs-stopwatch-cumulative-view" hidden>
        <div class="gs-stopwatch-secondary-header">
          <span class="gs-stopwatch-secondary-label">Question cumulative time</span>
        </div>
        <div class="gs-stopwatch-secondary">
          <span class="gs-stopwatch-secondary-time" id="gs-stopwatch-cumulative-time">00:00</span>
        </div>
        <div class="gs-stopwatch-stats">
          <div class="gs-stopwatch-stat">
            <span class="gs-stopwatch-stat-label">Session total</span>
            <span class="gs-stopwatch-stat-value" id="gs-stopwatch-session-time">00:00</span>
          </div>
          <div class="gs-stopwatch-stat">
            <span class="gs-stopwatch-stat-label">Session average</span>
            <span class="gs-stopwatch-stat-value" id="gs-stopwatch-session-average">00:00</span>
          </div>
          <div class="gs-stopwatch-stat">
            <span class="gs-stopwatch-stat-label">Visited this session</span>
            <span class="gs-stopwatch-stat-value" id="gs-stopwatch-session-count">0</span>
          </div>
        </div>
        <button
          type="button"
          class="gs-stopwatch-nav gs-stopwatch-nav-side"
          id="gs-stopwatch-hide-cumulative"
          aria-label="Back to submission timer"
          title="Back to submission timer"
        >
          &#8249;
        </button>
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

  function buildQuestionSessionKey(ids) {
    return `${SESSION_PREFIX}:${ids.courseId}:${ids.questionId}`;
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
    const previousNode = root.querySelector("#gs-stopwatch-previous");

    if (timeNode) {
      timeNode.textContent = formatDuration(getDisplayElapsedMs());
    }

    if (submissionNode) {
      submissionNode.textContent = `Submission #${route.submissionId}`;
    }

    if (previousNode) {
      if (previousSubmission) {
        previousNode.textContent = `Last submission #${previousSubmission.submissionId}: ${formatDuration(previousSubmission.elapsedMs)}`;
        previousNode.removeAttribute("hidden");
      } else {
        previousNode.textContent = "";
        previousNode.setAttribute("hidden", "");
      }
    }
  }

  function renderCumulative(stats) {
    const cumulativeNode = root.querySelector("#gs-stopwatch-cumulative-time");
    const sessionNode = root.querySelector("#gs-stopwatch-session-time");
    const averageNode = root.querySelector("#gs-stopwatch-session-average");
    const countNode = root.querySelector("#gs-stopwatch-session-count");

    cumulativeNode.textContent = formatDuration(stats.questionTotalMs);
    sessionNode.textContent = formatDuration(stats.sessionTotalMs);
    averageNode.textContent = formatDuration(stats.sessionAverageMs);
    countNode.textContent = String(stats.sessionCount);
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

  function getStorageArea(areaName) {
    try {
      if (!chrome?.runtime?.id || !chrome?.storage?.[areaName]) {
        return null;
      }

      return chrome.storage[areaName];
    } catch {
      return null;
    }
  }

  function safeStorageGet(areaName, keys, callback) {
    const area = getStorageArea(areaName);
    if (!area) {
      callback(null);
      return;
    }

    try {
      area.get(keys, (result) => {
        if (chrome.runtime?.lastError) {
          callback(null);
          return;
        }

        callback(result ?? {});
      });
    } catch {
      callback(null);
    }
  }

  function safeStorageSet(areaName, items, callback) {
    const area = getStorageArea(areaName);
    if (!area) {
      callback?.(false);
      return;
    }

    try {
      area.set(items, () => {
        if (chrome.runtime?.lastError) {
          callback?.(false);
          return;
        }

        callback?.(true);
      });
    } catch {
      callback?.(false);
    }
  }

  function persist() {
    const payload = {
      elapsedMs: getDisplayElapsedMs(),
      running,
      savedAt: Date.now()
    };

    safeStorageSet("local", { [storageKey]: payload }, () => {
      refreshCumulative();
    });
  }

  function refreshCumulative() {
    const questionPrefix = buildQuestionPrefix(route);
    const sessionKey = buildQuestionSessionKey(route);

    safeStorageGet("local", null, (allValues) => {
      safeStorageGet("session", sessionKey, (sessionValues) => {
        const values = allValues ?? {};
        const sessionState = sessionValues?.[sessionKey];
        const visitedSubmissions = sessionState?.submissionIds ?? {};
        let questionTotalMs = 0;
        let sessionTotalMs = 0;

        Object.entries(values).forEach(([key, value]) => {
          if (!key.startsWith(questionPrefix) || !value || typeof value.elapsedMs !== "number") {
            return;
          }

          const submissionId = key.slice(questionPrefix.length);
          const submissionElapsedMs = key === storageKey ? getDisplayElapsedMs() : value.elapsedMs;
          questionTotalMs += submissionElapsedMs;

          if (visitedSubmissions[submissionId]) {
            sessionTotalMs += submissionElapsedMs;
          }
        });

        const sessionCount = Object.keys(visitedSubmissions).length;
        renderCumulative({
          questionTotalMs,
          sessionTotalMs,
          sessionAverageMs: sessionCount > 0 ? Math.round(sessionTotalMs / sessionCount) : 0,
          sessionCount
        });
      });
    });
  }

  function markSubmissionVisited(ids) {
    const sessionKey = buildQuestionSessionKey(ids);

    safeStorageGet("session", sessionKey, (result) => {
      const currentState = result?.[sessionKey] ?? {};
      const submissionIds = {
        ...(currentState.submissionIds ?? {}),
        [ids.submissionId]: true
      };

      safeStorageSet("session", {
        [sessionKey]: {
          submissionIds
        }
      });
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

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function updateDraggedPosition(clientX, clientY) {
    if (!dragState) {
      return;
    }

    const maxLeft = Math.max(window.innerWidth - dragState.width, 0);
    const maxTop = Math.max(window.innerHeight - dragState.height, 0);
    const nextLeft = clamp(clientX - dragState.offsetX, 0, maxLeft);
    const nextTop = clamp(clientY - dragState.offsetY, 0, maxTop);

    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
    root.style.right = "auto";
  }

  function startDragging(event) {
    if (event.button !== 0) {
      return;
    }

    const rect = root.getBoundingClientRect();
    dragState = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height
    };

    root.classList.add("is-dragging");
    updateDraggedPosition(event.clientX, event.clientY);
  }

  function handleDragMove(event) {
    if (!dragState) {
      return;
    }

    updateDraggedPosition(event.clientX, event.clientY);
  }

  function stopDragging() {
    if (!dragState) {
      return;
    }

    dragState = null;
    root.classList.remove("is-dragging");
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
    const titleWrap = root.querySelector(".gs-stopwatch-title-wrap");
    const toggle = root.querySelector("#gs-stopwatch-toggle");
    const resetBtn = root.querySelector("#gs-stopwatch-reset");
    const showCumulativeBtn = root.querySelector("#gs-stopwatch-show-cumulative");
    const hideCumulativeBtn = root.querySelector("#gs-stopwatch-hide-cumulative");

    titleWrap?.addEventListener("pointerdown", startDragging);
    toggle?.addEventListener("click", () => setRunning(!running));
    resetBtn?.addEventListener("click", reset);
    showCumulativeBtn?.addEventListener("click", () => setView("cumulative"));
    hideCumulativeBtn?.addEventListener("click", () => setView("main"));

    window.addEventListener("pointermove", handleDragMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

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

    previousSubmission = {
      submissionId: route.submissionId,
      elapsedMs: getDisplayElapsedMs()
    };
    persist();

    route = nextRoute;
    storageKey = nextKey;
    elapsedMs = 0;
    running = true;
    startedAtMs = Date.now();
    markSubmissionVisited(route);

    const toggle = root.querySelector("#gs-stopwatch-toggle");
    if (toggle) {
      toggle.textContent = "Pause";
    }

    root.classList.remove("is-paused");
    render();

    safeStorageGet("local", storageKey, (result) => {
      const stored = result?.[storageKey];
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
    markSubmissionVisited(route);

    safeStorageGet("local", storageKey, (result) => {
      const stored = result?.[storageKey];

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
