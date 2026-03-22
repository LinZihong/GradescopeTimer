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
  let previousSubmission = null;
  let dragState = null;
  let autoActioned = false;
  let wangEnabled = false;
  const AUTO_ACTION_MS = 30000;
  const sessionVisitedSubmissions = {
    [initialRoute.submissionId]: true
  };

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
        <label class="gs-stopwatch-wang">
          <span class="gs-stopwatch-wang-text">W.A.N.G. method</span>
          <span class="gs-stopwatch-wang-tooltip">Wang Assessment Normalization Grading (W.A.N.G.) Method: Any problem that takes longer than 30 seconds to read is automatically normalized to full credit.</span>
          <span class="gs-stopwatch-wang-switch">
            <input type="checkbox" id="gs-stopwatch-wang-toggle">
            <span class="gs-stopwatch-wang-slider"></span>
          </span>
        </label>
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
    const titleNode = root.querySelector(".gs-stopwatch-title");

    if (timeNode) {
      timeNode.textContent = formatDuration(getDisplayElapsedMs());
    }

    if (titleNode) {
      titleNode.textContent = running ? "Gradescope Timer Active" : "Gradescope Timer Inactive";
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
    safeStorageGet("local", null, (allValues) => {
      const values = allValues ?? {};
      let questionTotalMs = 0;
      let sessionTotalMs = 0;

      Object.entries(values).forEach(([key, value]) => {
        if (!key.startsWith(questionPrefix) || !value || typeof value.elapsedMs !== "number") {
          return;
        }

        const submissionId = key.slice(questionPrefix.length);
        const submissionElapsedMs = key === storageKey ? getDisplayElapsedMs() : value.elapsedMs;
        questionTotalMs += submissionElapsedMs;

        if (sessionVisitedSubmissions[submissionId] && submissionId !== route.submissionId) {
          sessionTotalMs += submissionElapsedMs;
        }
      });

      const sessionCount = Math.max(Object.keys(sessionVisitedSubmissions).length - 1, 0);
      renderCumulative({
        questionTotalMs,
        sessionTotalMs,
        sessionAverageMs: sessionCount > 0 ? Math.round(sessionTotalMs / sessionCount) : 0,
        sessionCount
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
        triggerAutoAction();
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
    autoActioned = false;
    render();
    persist();
  }

  function applyFirstRubric() {
    // Case 1: simple rubric item 1
    const toggleBtn = document.querySelector(
      'button[aria-label="Toggle rubric item 1"]'
    );
    if (toggleBtn) {
      if (toggleBtn.getAttribute("aria-pressed") !== "true") {
        toggleBtn.click();
      }
      return Promise.resolve();
    }

    // Case 2: rubric group 1
    const groupBtn = document.querySelector(
      'button[aria-label="Expand rubric item group 1"]'
    );
    if (!groupBtn) return Promise.resolve();

    const regionId = groupBtn.getAttribute("aria-controls");
    if (groupBtn.getAttribute("aria-expanded") !== "true") {
      groupBtn.click();
    }

    // Wait for group to expand, then click first child item
    return new Promise((resolve) => {
      setTimeout(() => {
        const region = regionId && document.getElementById(regionId);
        if (region) {
          const childBtn = region.querySelector("button[aria-pressed]");
          if (childBtn && childBtn.getAttribute("aria-pressed") !== "true") {
            childBtn.click();
          }
        }
        resolve();
      }, 200);
    });
  }

  function clickNextUngraded() {
    const btn = document.querySelector("button.js-nextUngraded");
    if (btn) btn.click();
  }

  function triggerAutoAction() {
    if (!wangEnabled || !running || autoActioned || getDisplayElapsedMs() < AUTO_ACTION_MS) {
      return;
    }

    autoActioned = true;
    applyFirstRubric().then(() => setTimeout(clickNextUngraded, 300));
  }

  function triggerAutoSkip() {
    if (!wangEnabled) return;
    if (getDisplayElapsedMs() >= AUTO_ACTION_MS) {
      autoActioned = true;
      setTimeout(clickNextUngraded, 300);
    }
  }

  function wireEvents() {
    const titleWrap = root.querySelector(".gs-stopwatch-title-wrap");
    const toggle = root.querySelector("#gs-stopwatch-toggle");
    const resetBtn = root.querySelector("#gs-stopwatch-reset");
    const showCumulativeBtn = root.querySelector("#gs-stopwatch-show-cumulative");
    const hideCumulativeBtn = root.querySelector("#gs-stopwatch-hide-cumulative");

    const wangToggle = root.querySelector("#gs-stopwatch-wang-toggle");

    titleWrap?.addEventListener("pointerdown", startDragging);
    toggle?.addEventListener("click", () => setRunning(!running));
    resetBtn?.addEventListener("click", reset);
    showCumulativeBtn?.addEventListener("click", () => setView("cumulative"));
    hideCumulativeBtn?.addEventListener("click", () => setView("main"));
    wangToggle?.addEventListener("change", () => {
      wangEnabled = wangToggle.checked;
      safeStorageSet("local", { "gradescope-stopwatch:wang-enabled": wangEnabled });
    });

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
    autoActioned = false;
    sessionVisitedSubmissions[route.submissionId] = true;

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
      triggerAutoSkip();
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
      triggerAutoSkip();
      startTicker();
    });

    safeStorageGet("local", "gradescope-stopwatch:wang-enabled", (result) => {
      wangEnabled = result?.["gradescope-stopwatch:wang-enabled"] === true;
      const wangToggle = root.querySelector("#gs-stopwatch-wang-toggle");
      if (wangToggle) wangToggle.checked = wangEnabled;
    });
  }

  installHistoryHooks();
  restoreInitialStateAndStart();
})();
