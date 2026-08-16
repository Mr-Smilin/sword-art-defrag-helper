// ==UserScript==
// @name         Sword Art 經典服輔助工具
// @description  行動記錄 / 循環行動順序 / 樓層獎勵覆蓋
// @namespace    sword-art-defrag-helper
// @version      1.4.0
// @license      MIT
// @author       smilin
// @match        https://betawtf.swordartdefrag.page
// @grant        none
// ==/UserScript==

(() => {
  // src/bus.js
  var handlers = /* @__PURE__ */ new Map();
  var STATE_CHANGED = "state-changed";
  var ACTION_RESULT = "action-result";
  function on(event, handler) {
    if (!handlers.has(event)) handlers.set(event, /* @__PURE__ */ new Set());
    handlers.get(event).add(handler);
    return () => off(event, handler);
  }
  function off(event, handler) {
    handlers.get(event)?.delete(handler);
  }
  function emit(event, payload) {
    const set = handlers.get(event);
    if (!set) return;
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        console.warn(`[SAO 輔助工具] 事件 ${event} 的處理器發生錯誤：`, err);
      }
    }
  }

  // src/constants.js
  var ACTION_NAMES = [
    "狩獵兔肉",
    "自主訓練",
    "外出野餐",
    "汁妹",
    "做善事",
    "坐下休息",
    "釣魚"
  ];
  var REWARD_NAME = "領取獎勵";
  var RAW_RECORD_PREFIX = "行動";
  var STORAGE_KEY = "saoDefragHelper_v3";
  var ACTION_ID_STORAGE_KEY = "saoDefragHelper_actionIds_v1";

  // src/action-api.js
  var ACTION_API_PATH = "/api/actions/";
  var SEED_ACTION_IDS = {
    self_training: "自主訓練"
  };
  var FALLBACK_ORIGIN = "https://betawtf.swordartdefrag.page";
  function toPathname(url) {
    try {
      const base = typeof location !== "undefined" && location.href ? location.href : FALLBACK_ORIGIN;
      return new URL(String(url), base).pathname;
    } catch (e) {
      return String(url).split("?")[0];
    }
  }
  function isActionRequest(url, method) {
    if (!url) return false;
    if (String(method || "GET").toUpperCase() !== "POST") return false;
    return toPathname(url).endsWith(ACTION_API_PATH);
  }
  function safeJson(text) {
    if (typeof text !== "string" || text.trim() === "") return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }
  function extractActionId(body) {
    if (body == null) return null;
    if (typeof body === "string") {
      const parsed = safeJson(body);
      return typeof parsed?.actionId === "string" ? parsed.actionId : null;
    }
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return body.get("actionId");
    }
    if (typeof body === "object" && typeof body.actionId === "string") {
      return body.actionId;
    }
    return null;
  }
  function parseActionResponse({ status, bodyText }) {
    const body = safeJson(bodyText);
    if (body && typeof body.error === "string") {
      return { success: false, actionId: null, expGained: null, error: body.error };
    }
    const httpOk = Number(status) >= 200 && Number(status) < 300;
    if (!httpOk) {
      return {
        success: false,
        actionId: null,
        expGained: null,
        error: `HTTP ${status}`
      };
    }
    return {
      success: true,
      actionId: typeof body?.updatedPlayer?.lastActionId === "string" ? body.updatedPlayer.lastActionId : null,
      expGained: typeof body?.expGained === "number" ? body.expGained : null,
      error: null
    };
  }
  var idToName = null;
  function ensureMap() {
    if (idToName) return idToName;
    idToName = { ...SEED_ACTION_IDS };
    try {
      const raw = localStorage.getItem(ACTION_ID_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        for (const [id, name] of Object.entries(parsed)) {
          if (typeof id === "string" && typeof name === "string") {
            idToName[id] = name;
          }
        }
      }
    } catch (e) {
    }
    return idToName;
  }
  function actionNameFromId(actionId) {
    if (!actionId) return null;
    return ensureMap()[actionId] ?? null;
  }
  function learnActionId(actionId, name) {
    if (!actionId || !name) return;
    const map = ensureMap();
    if (map[actionId] === name) return;
    map[actionId] = name;
    try {
      localStorage.setItem(ACTION_ID_STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
    }
  }

  // src/dom.js
  function getAllButtons() {
    return Array.from(document.querySelectorAll("button:not([data-sao-helper])"));
  }
  function getActionButtonMap() {
    const all = getAllButtons();
    const map = {};
    ACTION_NAMES.forEach((n) => {
      map[n] = all.find((b) => b.textContent.trim() === n) || null;
    });
    return map;
  }
  function getRewardButton() {
    return getAllButtons().find((b) => b.textContent.trim() === REWARD_NAME) || null;
  }
  function getActionButtonsRow() {
    const map = getActionButtonMap();
    const first = ACTION_NAMES.map((n) => map[n]).find(Boolean);
    return first ? first.parentElement : null;
  }
  function findLeafByExactText(text) {
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      if (el.children.length === 0 && el.textContent.trim() === text) return el;
    }
    return null;
  }
  function waitForLeafByExactText(text, { timeout = 5e3, interval = 150 } = {}) {
    return new Promise((resolve) => {
      const start2 = Date.now();
      (function tryFind() {
        const found = findLeafByExactText(text);
        if (found) return resolve(found);
        if (Date.now() - start2 >= timeout) return resolve(null);
        setTimeout(tryFind, interval);
      })();
    });
  }
  function getActionHeading() {
    return waitForLeafByExactText("行動");
  }
  function getRewardHeading() {
    return waitForLeafByExactText("樓層獎勵");
  }
  function getRecordArticles() {
    return Array.from(document.querySelectorAll("article"));
  }
  function findLeadingTextNode(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while (n = walker.nextNode()) {
      if (n.nodeValue && n.nodeValue.trim() !== "") return n;
    }
    return null;
  }

  // src/records.js
  var labels = [];
  var awaiting = [];
  var lastCount = 0;
  var lastTopRaw = null;
  var lastSignature = null;
  var AWAITING_TIMEOUT_MS = 15e3;
  var RECORD_SEPARATOR = "\0";
  function queueLabel(name) {
    awaiting.push({ name: name ?? null, at: Date.now() });
  }
  function dropExpired() {
    const now = Date.now();
    while (awaiting.length && now - awaiting[0].at > AWAITING_TIMEOUT_MS) {
      awaiting.shift();
    }
  }
  function rawTextOf(article, labelName) {
    if (!article) return null;
    const node = findLeadingTextNode(article);
    if (!node) return null;
    const raw = node.nodeValue;
    const trimmed = raw.trimStart();
    if (trimmed.startsWith(RAW_RECORD_PREFIX)) return raw;
    if (labelName && trimmed.startsWith(labelName)) {
      const lead = raw.length - trimmed.length;
      return raw.slice(0, lead) + RAW_RECORD_PREFIX + raw.slice(lead + labelName.length);
    }
    return raw;
  }
  function detectShiftAmount(raws) {
    if (lastTopRaw === null) return 0;
    const max = Math.min(raws.length - 1, awaiting.length);
    for (let k = max; k >= 1; k--) {
      if (raws[k] === lastTopRaw) return k;
    }
    return 0;
  }
  function applyLabels(articles) {
    articles.forEach((article, i) => {
      const name = labels[i];
      if (!name) return;
      const node = findLeadingTextNode(article);
      if (!node) return;
      const raw = node.nodeValue;
      const trimmed = raw.trimStart();
      if (!trimmed.startsWith(RAW_RECORD_PREFIX)) return;
      const lead = raw.length - trimmed.length;
      node.nodeValue = raw.slice(0, lead) + name + raw.slice(lead + RAW_RECORD_PREFIX.length);
    });
  }
  function scanRecords() {
    const articles = getRecordArticles();
    const n = articles.length;
    if (!n) {
      lastCount = 0;
      lastTopRaw = null;
      lastSignature = null;
      return;
    }
    dropExpired();
    const raws = articles.map((a, i) => rawTextOf(a, labels[i]));
    const signature = raws.join(RECORD_SEPARATOR);
    let newCount = 0;
    if (n > lastCount) {
      newCount = n - lastCount;
    } else if (awaiting.length && signature !== lastSignature) {
      newCount = detectShiftAmount(raws);
    }
    for (let k = 0; k < newCount; k++) {
      labels.unshift(awaiting.length ? awaiting.shift().name : null);
    }
    labels.length = n;
    applyLabels(articles);
    lastCount = n;
    lastTopRaw = raws[0];
    lastSignature = signature;
  }
  function startRecordObserver(target = document.body) {
    const observer = new MutationObserver(() => scanRecords());
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });
    return observer;
  }

  // src/state.js
  var defaultSequence = () => ACTION_NAMES.map((n) => ({ name: n, count: 1 }));
  var defaultState = () => ({
    orderMode: false,
    // 只顯示當前輪到的行動（其餘隱藏）
    sequence: defaultSequence(),
    // 自訂循環順序（可重複、可設定連續次數）
    stepIndex: 0,
    // 目前在序列的第幾步
    stepProgress: 0,
    // 目前這一步已經點了幾次
    rewardOverlay: false
    // 可領取時，覆蓋在行動按鈕上
  });
  function sanitizeSequence(seq) {
    if (!Array.isArray(seq) || seq.length === 0) return null;
    const cleaned = seq.filter((s) => s && ACTION_NAMES.includes(s.name)).map((s) => ({
      name: s.name,
      count: Math.max(1, Math.min(99, parseInt(s.count, 10) || 1))
    }));
    return cleaned.length ? cleaned : null;
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      const seq = sanitizeSequence(parsed.sequence);
      return {
        ...base,
        ...parsed,
        sequence: seq || defaultSequence(),
        stepIndex: Number.isInteger(parsed.stepIndex) ? parsed.stepIndex : 0,
        stepProgress: Number.isInteger(parsed.stepProgress) ? parsed.stepProgress : 0
      };
    } catch (e) {
      return defaultState();
    }
  }
  var state = loadState();
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("[SAO 輔助工具] 設定存檔失敗：", err);
    }
  }
  function currentStep() {
    if (!state.sequence.length) return null;
    state.stepIndex = (state.stepIndex % state.sequence.length + state.sequence.length) % state.sequence.length;
    return state.sequence[state.stepIndex];
  }
  function resetProgress() {
    state.stepIndex = 0;
    state.stepProgress = 0;
  }
  function advanceStep() {
    const step = currentStep();
    if (!step) return false;
    state.stepProgress += 1;
    if (state.stepProgress < step.count) return false;
    state.stepProgress = 0;
    state.stepIndex = (state.stepIndex + 1) % state.sequence.length;
    return true;
  }

  // src/action-tracker.js
  var pendingClicks = [];
  var MAX_PENDING = 20;
  function handleClick(e) {
    const btn = e.target?.closest?.("button");
    if (!btn) return;
    if (btn.closest("[data-sao-helper]")) return;
    const text = btn.textContent.trim();
    if (!ACTION_NAMES.includes(text)) return;
    pendingClicks.push(text);
    if (pendingClicks.length > MAX_PENDING) pendingClicks.shift();
  }
  function handleActionResult({ actionId, success }) {
    const clicked = pendingClicks.shift() ?? null;
    let name = actionNameFromId(actionId);
    if (!name && actionId && clicked) {
      learnActionId(actionId, clicked);
      name = clicked;
    }
    if (!name) name = clicked;
    if (!success) return;
    queueLabel(name);
    if (state.orderMode && name) {
      const step = currentStep();
      if (step && name === step.name) {
        advanceStep();
        save();
      }
    }
    emit(STATE_CHANGED);
  }
  function installActionTracker(target = document) {
    target.addEventListener("click", handleClick, true);
    const offActionResult = on(ACTION_RESULT, handleActionResult);
    return () => {
      target.removeEventListener("click", handleClick, true);
      offActionResult();
    };
  }

  // src/network.js
  var installed = false;
  function report({ actionId, success, expGained = null, error = null }) {
    emit(ACTION_RESULT, { actionId: actionId ?? null, success, expGained, error });
  }
  function resolveUrl(input) {
    if (typeof input === "string") return input;
    if (input && typeof input.url === "string") return input.url;
    if (input && typeof input.href === "string") return input.href;
    return "";
  }
  function resolveMethod(input, init) {
    if (init && init.method) return init.method;
    if (input && typeof input.method === "string") return input.method;
    return "GET";
  }
  async function readRequestBody(input, init) {
    if (init && init.body != null) return init.body;
    if (typeof Request !== "undefined" && input instanceof Request) {
      try {
        return await input.clone().text();
      } catch (e) {
        return null;
      }
    }
    return null;
  }
  function patchFetch(target) {
    const original = target.fetch;
    if (typeof original !== "function") return;
    target.fetch = function patchedFetch(input, init, ...rest) {
      const url = resolveUrl(input);
      const method = resolveMethod(input, init);
      if (!isActionRequest(url, method)) {
        return original.call(this, input, init, ...rest);
      }
      const actionIdPromise = readRequestBody(input, init).then(extractActionId).catch(() => null);
      let promise;
      try {
        promise = original.call(this, input, init, ...rest);
      } catch (err) {
        actionIdPromise.then(
          (actionId) => report({ actionId, success: false, error: String(err) })
        );
        throw err;
      }
      return Promise.resolve(promise).then(
        (res) => {
          let bodyTextPromise;
          try {
            bodyTextPromise = res.clone().text();
          } catch (e) {
            bodyTextPromise = Promise.resolve("");
          }
          Promise.all([actionIdPromise, bodyTextPromise.catch(() => "")]).then(
            ([actionId, bodyText]) => {
              const parsed = parseActionResponse({
                status: res.status,
                bodyText
              });
              report({ ...parsed, actionId: parsed.actionId || actionId });
            }
          );
          return res;
        },
        (err) => {
          actionIdPromise.then(
            (actionId) => report({ actionId, success: false, error: String(err) })
          );
          throw err;
        }
      );
    };
  }
  function patchXhr(target) {
    const XHR = target.XMLHttpRequest;
    if (typeof XHR !== "function") return;
    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;
    XHR.prototype.open = function patchedOpen(method, url, ...rest) {
      this.__saoMethod = method;
      this.__saoUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    XHR.prototype.send = function patchedSend(body) {
      if (isActionRequest(this.__saoUrl, this.__saoMethod)) {
        const actionId = extractActionId(body);
        this.addEventListener("loadend", () => {
          if (this.status === 0) {
            report({ actionId, success: false, error: "network error" });
            return;
          }
          let bodyText = "";
          try {
            bodyText = this.responseType === "" || this.responseType === "text" ? this.responseText : JSON.stringify(this.response);
          } catch (e) {
            bodyText = "";
          }
          const parsed = parseActionResponse({ status: this.status, bodyText });
          report({ ...parsed, actionId: parsed.actionId || actionId });
        });
      }
      return originalSend.call(this, body);
    };
  }
  function installNetworkHooks(target = typeof window !== "undefined" ? window : globalThis) {
    if (installed) return false;
    installed = true;
    patchFetch(target);
    patchXhr(target);
    return true;
  }

  // src/order.js
  var ENLARGED_BUTTON_STYLE = {
    minWidth: "200px",
    minHeight: "60px",
    fontSize: "22px",
    padding: "16px 28px"
  };
  function clearEnlargedButton(btn) {
    btn.style.minWidth = "";
    btn.style.minHeight = "";
    btn.style.fontSize = "";
    btn.style.padding = "";
  }
  function applyOrderVisibility() {
    const map = getActionButtonMap();
    if (!state.orderMode) {
      ACTION_NAMES.forEach((n) => {
        if (!map[n]) return;
        map[n].style.removeProperty("display");
        clearEnlargedButton(map[n]);
      });
      return;
    }
    const step = currentStep();
    const current = step ? step.name : null;
    ACTION_NAMES.forEach((n) => {
      if (!map[n]) return;
      const btn = map[n];
      if (n === current) {
        btn.style.display = "";
        Object.assign(btn.style, ENLARGED_BUTTON_STYLE);
      } else {
        btn.style.display = "none";
        clearEnlargedButton(btn);
      }
    });
  }
  function commit() {
    save();
    emit(STATE_CHANGED);
  }
  function setOrderMode(enabled) {
    state.orderMode = !!enabled;
    commit();
  }
  function moveSeqItem(index, dir) {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= state.sequence.length) return;
    const arr = state.sequence;
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
    resetProgress();
    commit();
  }
  function addSeqItem() {
    state.sequence.push({ name: ACTION_NAMES[0], count: 1 });
    commit();
  }
  function removeSeqItem(index) {
    if (state.sequence.length <= 1) return;
    state.sequence.splice(index, 1);
    resetProgress();
    commit();
  }
  function setSeqItemName(index, name) {
    const item = state.sequence[index];
    if (!item || !ACTION_NAMES.includes(name)) return;
    item.name = name;
    resetProgress();
    commit();
  }
  function setSeqItemCount(index, count) {
    const item = state.sequence[index];
    if (!item) return null;
    const value = Math.max(1, Math.min(99, parseInt(count, 10) || 1));
    item.count = value;
    resetProgress();
    commit();
    return value;
  }
  function resetSequenceProgress() {
    resetProgress();
    commit();
  }
  function restoreDefaultSequence() {
    state.sequence = defaultSequence();
    resetProgress();
    commit();
  }

  // src/reward.js
  var overlayBtn = null;
  function ensureOverlayButton() {
    if (overlayBtn && document.body.contains(overlayBtn)) return overlayBtn;
    overlayBtn = document.createElement("button");
    overlayBtn.type = "button";
    overlayBtn.textContent = "領取獎勵";
    overlayBtn.setAttribute("data-sao-helper", "1");
    Object.assign(overlayBtn.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      zIndex: "9999",
      background: "rgba(22,163,74,0.94)",
      color: "#fff",
      fontSize: "16px",
      fontWeight: "700",
      letterSpacing: "1px",
      border: "2px solid rgba(255,255,255,0.7)",
      borderRadius: "6px",
      cursor: "pointer",
      boxShadow: "0 2px 10px rgba(0,0,0,0.35)"
    });
    overlayBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const real = getRewardButton();
      if (real && !real.disabled) real.click();
    });
    return overlayBtn;
  }
  function applyRewardOverlay() {
    const container = getActionButtonsRow();
    const real = getRewardButton();
    const btn = ensureOverlayButton();
    if (!container) {
      if (btn.parentElement) btn.parentElement.removeChild(btn);
      return;
    }
    const shouldShow = state.rewardOverlay && real && !real.disabled;
    if (shouldShow) {
      const position = getComputedStyle(container).position;
      if (!position || position === "static") {
        container.style.position = "relative";
      }
      if (btn.parentElement !== container) container.appendChild(btn);
    } else if (btn.parentElement) {
      btn.parentElement.removeChild(btn);
    }
  }
  function setRewardOverlay(enabled) {
    state.rewardOverlay = !!enabled;
    save();
    emit(STATE_CHANGED);
  }

  // src/theme.js
  function isDarkMode() {
    return document.documentElement.classList.contains("dark");
  }
  var NEUTRAL_PALETTE = {
    light: {
      panelBg: "#f3f4f6",
      panelText: "#111827",
      panelBorder: "#d1d5db",
      mutedText: "#4b5563"
    },
    dark: {
      panelBg: "#27272a",
      panelText: "#f4f4f5",
      panelBorder: "#3f3f46",
      mutedText: "#a1a1aa"
    }
  };
  function neutralPalette() {
    return isDarkMode() ? NEUTRAL_PALETTE.dark : NEUTRAL_PALETTE.light;
  }
  function observeTheme(onChange) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"]
    });
    return observer;
  }

  // src/ui/components.js
  function smallBtn(text, onClick, variant) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.setAttribute("data-sao-helper", "1");
    b.className = variant === "danger" ? "bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground";
    Object.assign(b.style, {
      borderWidth: "1px",
      borderStyle: "solid",
      borderRadius: "5px",
      padding: "4px 9px",
      cursor: "pointer",
      fontSize: "12px"
    });
    b.classList.add("border-border");
    b.addEventListener("mouseenter", () => b.style.opacity = "0.75");
    b.addEventListener("mouseleave", () => b.style.opacity = "1");
    b.addEventListener("click", onClick);
    return b;
  }
  function checkboxRow(labelText, checked, onChange) {
    const row = document.createElement("label");
    row.setAttribute("data-sao-helper", "1");
    row.className = "text-foreground";
    Object.assign(row.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      cursor: "pointer",
      fontSize: "13px"
    });
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked;
    cb.className = "accent-primary";
    cb.addEventListener("change", () => onChange(cb.checked));
    const span = document.createElement("span");
    span.textContent = labelText;
    row.appendChild(cb);
    row.appendChild(span);
    return { row, cb };
  }

  // src/ui/order-panel.js
  var seqListEl = null;
  var currentTurnEl = null;
  var orderWrapEl = null;
  var orderHintEl = null;
  function paintOrderPanel() {
    const p = neutralPalette();
    if (orderWrapEl) {
      orderWrapEl.style.backgroundColor = p.panelBg;
      orderWrapEl.style.color = p.panelText;
      orderWrapEl.style.borderColor = p.panelBorder;
    }
    if (orderHintEl) {
      orderHintEl.style.color = p.mutedText;
    }
  }
  async function mountOrderEditor() {
    try {
      const heading = await getActionHeading();
      const buttonsRow = getActionButtonsRow();
      if (!heading || !buttonsRow) {
        console.warn("[SAO 輔助工具] 找不到「行動」框，行動順序功能未掛載。");
        return null;
      }
      const wrap = document.createElement("div");
      wrap.setAttribute("data-sao-helper", "1");
      orderWrapEl = wrap;
      Object.assign(wrap.style, {
        margin: "8px 0 10px 0",
        padding: "8px 10px",
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "6px",
        fontSize: "13px"
      });
      const titleRow = document.createElement("div");
      Object.assign(titleRow.style, {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap"
      });
      const title = document.createElement("span");
      title.textContent = "循環行動順序：";
      title.style.fontWeight = "700";
      titleRow.appendChild(title);
      const { row: toggleRow } = checkboxRow(
        "啟用（只顯示當前輪到的行動，其餘隱藏）",
        state.orderMode,
        setOrderMode
      );
      titleRow.appendChild(toggleRow);
      wrap.appendChild(titleRow);
      currentTurnEl = document.createElement("div");
      currentTurnEl.className = "text-primary";
      Object.assign(currentTurnEl.style, {
        margin: "6px 0",
        fontSize: "12.5px",
        fontWeight: "600"
      });
      wrap.appendChild(currentTurnEl);
      seqListEl = document.createElement("div");
      Object.assign(seqListEl.style, {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        marginTop: "4px"
      });
      wrap.appendChild(seqListEl);
      const btnRow = document.createElement("div");
      Object.assign(btnRow.style, {
        display: "flex",
        gap: "6px",
        marginTop: "8px",
        flexWrap: "wrap"
      });
      const addBtn = smallBtn("+ 新增步驟", addSeqItem);
      const resetBtn = smallBtn("重設進度", resetSequenceProgress);
      const restoreBtn = smallBtn("還原預設順序", restoreDefaultSequence);
      [addBtn, resetBtn, restoreBtn].forEach((b) => {
        b.style.padding = "6px 14px";
        b.style.fontSize = "13px";
      });
      btnRow.appendChild(addBtn);
      btnRow.appendChild(resetBtn);
      btnRow.appendChild(restoreBtn);
      wrap.appendChild(btnRow);
      const hint = document.createElement("div");
      orderHintEl = hint;
      Object.assign(hint.style, {
        fontSize: "11px",
        marginTop: "6px"
      });
      hint.textContent = "例：自主訓練(2) → 外出野餐(1)，代表連點自主訓練兩次後才會換成外出野餐，跑完全部步驟後自動從頭循環。";
      wrap.appendChild(hint);
      heading.insertAdjacentElement("afterend", wrap);
      paintOrderPanel();
      renderOrderUI();
      observeTheme(() => {
        paintOrderPanel();
        renderOrderUI();
      });
      return wrap;
    } catch (err) {
      console.warn("[SAO 輔助工具] 掛載行動順序編輯器失敗：", err);
      return null;
    }
  }
  function renderOrderUI() {
    if (!seqListEl || !currentTurnEl) return;
    seqListEl.innerHTML = "";
    const step = currentStep();
    if (state.orderMode && step) {
      currentTurnEl.textContent = `目前輪到：${step.name}（已點 ${state.stepProgress}/${step.count} 次，步驟 ${state.stepIndex + 1}/${state.sequence.length}）`;
    } else {
      currentTurnEl.textContent = "（順序模式關閉，全部行動按鈕都會顯示）";
    }
    state.sequence.forEach((s, idx) => {
      const isCurrent = state.orderMode && idx === state.stepIndex;
      const item = document.createElement("div");
      item.setAttribute("data-sao-helper", "1");
      item.className = isCurrent ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground border-border";
      Object.assign(item.style, {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 6px",
        borderRadius: "4px",
        borderWidth: isCurrent ? "0" : "1px",
        borderStyle: "solid",
        flexWrap: "wrap"
      });
      const idxLabel = document.createElement("span");
      idxLabel.textContent = `${idx + 1}.`;
      if (!isCurrent) idxLabel.style.color = neutralPalette().mutedText;
      item.appendChild(idxLabel);
      const select = document.createElement("select");
      select.setAttribute("data-sao-helper", "1");
      select.className = "bg-background text-foreground border-input";
      Object.assign(select.style, {
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "4px",
        fontSize: "12.5px",
        padding: "2px 2px",
        flex: "1 1 auto",
        minWidth: "80px"
      });
      ACTION_NAMES.forEach((n) => {
        const opt = document.createElement("option");
        opt.value = n;
        opt.textContent = n;
        if (n === s.name) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener("change", () => setSeqItemName(idx, select.value));
      item.appendChild(select);
      const countLabel = document.createElement("span");
      countLabel.textContent = "x";
      if (!isCurrent) countLabel.style.color = neutralPalette().mutedText;
      item.appendChild(countLabel);
      const countInput = document.createElement("input");
      countInput.type = "number";
      countInput.min = "1";
      countInput.max = "99";
      countInput.value = String(s.count);
      countInput.setAttribute("data-sao-helper", "1");
      countInput.className = "bg-background text-foreground border-input";
      Object.assign(countInput.style, {
        width: "46px",
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "4px",
        fontSize: "12.5px",
        padding: "2px 4px"
      });
      countInput.addEventListener("change", () => {
        const applied = setSeqItemCount(idx, countInput.value);
        if (applied != null) countInput.value = String(applied);
      });
      item.appendChild(countInput);
      const btnGroup = document.createElement("span");
      btnGroup.style.display = "flex";
      btnGroup.style.gap = "2px";
      const up = smallBtn("▲", () => moveSeqItem(idx, -1));
      const down = smallBtn("▼", () => moveSeqItem(idx, 1));
      const del = smallBtn("✕", () => removeSeqItem(idx), "danger");
      up.style.padding = "1px 6px";
      down.style.padding = "1px 6px";
      del.style.padding = "1px 6px";
      if (idx === 0) up.disabled = true;
      if (idx === state.sequence.length - 1) down.disabled = true;
      if (state.sequence.length <= 1) del.disabled = true;
      btnGroup.appendChild(up);
      btnGroup.appendChild(down);
      btnGroup.appendChild(del);
      item.appendChild(btnGroup);
      seqListEl.appendChild(item);
    });
  }

  // src/ui/reward-toggle.js
  async function mountRewardToggle() {
    try {
      const heading = await getRewardHeading();
      const container = heading ? heading.parentElement : null;
      if (!container) {
        console.warn(
          "[SAO 輔助工具] 找不到「樓層獎勵」框，領取獎勵覆蓋開關未掛載。"
        );
        return null;
      }
      const wrap = document.createElement("div");
      wrap.setAttribute("data-sao-helper", "1");
      wrap.className = "text-foreground border-border";
      Object.assign(wrap.style, {
        marginTop: "10px",
        paddingTop: "8px",
        borderTopWidth: "1px",
        borderTopStyle: "dashed"
      });
      const { row } = checkboxRow(
        "可領取時，覆蓋在行動按鈕上（方便快速點擊）",
        state.rewardOverlay,
        setRewardOverlay
      );
      wrap.appendChild(row);
      container.appendChild(wrap);
      return wrap;
    } catch (err) {
      console.warn("[SAO 輔助工具] 掛載領取獎勵覆蓋開關失敗：", err);
      return null;
    }
  }

  // src/main.js
  function alreadyInjected() {
    if (window.__saoHelperInjected) {
      console.warn(
        "[SAO 輔助工具] 偵測到已經注入過，略過重複注入（如需重新載入請重新整理頁面）。"
      );
      return true;
    }
    window.__saoHelperInjected = true;
    return false;
  }
  var RECONCILE_INTERVAL_MS = 1e3;
  function reconcile() {
    applyOrderVisibility();
    applyRewardOverlay();
    scanRecords();
  }
  function start() {
    installNetworkHooks();
    installActionTracker();
    on(STATE_CHANGED, () => {
      applyOrderVisibility();
      applyRewardOverlay();
      renderOrderUI();
    });
    scanRecords();
    startRecordObserver();
    mountRewardToggle();
    mountOrderEditor();
    applyOrderVisibility();
    applyRewardOverlay();
    setInterval(reconcile, RECONCILE_INTERVAL_MS);
  }
  if (!alreadyInjected()) start();
})();
