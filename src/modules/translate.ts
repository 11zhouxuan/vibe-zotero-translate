import { translateText, type TranslationInput } from "./llm-service";
import { log, debug, error } from "./debug";
import { saveWord } from "./wordbook";

// ID for our appended content
const TRANSLATE_CONTENT_ID = "vibe-translate-content";

// Preference key for popup position
const PREF_PREFIX = "extensions.vibe-zotero-translate";

// ============ Mouseup position tracking ============
// Tracks the last mouseup position (screen coordinates) for dot placement
let _lastMouseUp: { screenX: number; screenY: number; time: number } | null = null;

/**
 * Record a mouseup event's screen coordinates.
 * Called from mouseup listeners installed on reader iframes.
 */
export function recordMouseUp(screenX: number, screenY: number): void {
  _lastMouseUp = { screenX, screenY, time: Date.now() };
  debug(`Recorded mouseup at screen (${screenX}, ${screenY})`);
}

/**
 * Install mouseup listeners on all reader iframes to track mouse position.
 * Returns a cleanup function.
 */
export function installMouseUpTracker(reader: any): (() => void) | null {
  const cleanups: Array<() => void> = [];
  try {
    const iframeWin = reader._iframeWindow;
    if (!iframeWin) return null;

    const handler = (e: MouseEvent) => {
      recordMouseUp(e.screenX, e.screenY);
    };

    // Listen on reader iframe
    iframeWin.addEventListener("mouseup", handler, true);
    cleanups.push(() => { try { iframeWin.removeEventListener("mouseup", handler, true); } catch (_e) {} });

    // Listen on nested iframes
    try {
      const nestedIframes = iframeWin.document?.querySelectorAll?.("iframe");
      if (nestedIframes) {
        for (let i = 0; i < nestedIframes.length; i++) {
          try {
            const innerWin = nestedIframes[i].contentWindow;
            if (innerWin) {
              innerWin.addEventListener("mouseup", handler, true);
              cleanups.push(() => { try { innerWin.removeEventListener("mouseup", handler, true); } catch (_e) {} });
            }
          } catch (_e) { /* cross-origin */ }
        }
      }
    } catch (_e) { /* skip */ }

    debug(`Installed mouseup tracker on ${cleanups.length} windows`);
  } catch (e) {
    debug(`installMouseUpTracker error: ${e}`);
  }

  return cleanups.length > 0 ? () => { for (const fn of cleanups) fn(); } : null;
}

type PopupPosition = "popup" | "bottom-left" | "bottom-right" | "top-left" | "top-right";

/**
 * Get the configured popup position from preferences.
 */
function getPopupPosition(): PopupPosition {
  try {
    const val = Zotero.Prefs.get(`${PREF_PREFIX}.popupPosition`, true) as string;
    debug(`popupPosition preference: ${val}`);
    if (["popup", "bottom-left", "bottom-right", "top-left", "top-right"].includes(val)) {
      return val as PopupPosition;
    }
  } catch (e) {
    debug("popupPosition preference not set, using default");
  }
  return "popup";
}

/**
 * Context information for translation, including page screenshot.
 */
export interface TranslationContext {
  /** The selected text */
  text: string;
  /** Base64 data URL of the current page screenshot (PNG) */
  pageScreenshot: string | null;
  /** Page number (if available) */
  pageNumber: number | null;
}

/**
 * Capture a screenshot of the current PDF page from the reader.
 */
function capturePageScreenshot(reader: any): { screenshot: string | null; pageNumber: number | null } {
  debug("Attempting to capture page screenshot...");
  try {
    const iframeWin = reader._iframeWindow;
    if (!iframeWin) {
      debug("No _iframeWindow found on reader");
      return { screenshot: null, pageNumber: null };
    }

    const iframesToCheck: any[] = [iframeWin];

    try {
      const nestedIframes = iframeWin.document?.querySelectorAll?.("iframe");
      if (nestedIframes) {
        debug(`Found ${nestedIframes.length} nested iframes`);
        for (let i = 0; i < nestedIframes.length; i++) {
          try {
            const innerWin = nestedIframes[i].contentWindow;
            if (innerWin) iframesToCheck.push(innerWin);
          } catch (e) { /* cross-origin */ }
        }
      }
    } catch (e) { /* skip */ }

    for (const win of iframesToCheck) {
      try {
        const doc = win.document;
        if (!doc) continue;

        // Method 1: Find the currently visible page's canvas
        const pages = doc.querySelectorAll(".page[data-page-number]");
        if (pages && pages.length > 0) {
          debug(`Found ${pages.length} PDF pages`);
          let bestPage: any = null;
          let bestVisibility = 0;

          for (let i = 0; i < pages.length; i++) {
            const page = pages[i] as any;
            try {
              const rect = page.getBoundingClientRect();
              const viewportHeight = win.innerHeight || doc.documentElement.clientHeight;
              const visibleTop = Math.max(0, rect.top);
              const visibleBottom = Math.min(viewportHeight, rect.bottom);
              const visibility = Math.max(0, visibleBottom - visibleTop);
              if (visibility > bestVisibility) {
                bestVisibility = visibility;
                bestPage = page;
              }
            } catch (e) { /* skip */ }
          }

          if (bestPage) {
            const canvas = bestPage.querySelector("canvas");
            if (canvas) {
              const pageNum = parseInt(bestPage.getAttribute("data-page-number") || "0", 10);
              debug(`Best visible page: ${pageNum}, canvas: ${canvas.width}x${canvas.height}`);
              try {
                const canvasRect = canvas.getBoundingClientRect();
                const viewportWidth = win.innerWidth || doc.documentElement.clientWidth;
                const viewportHeight = win.innerHeight || doc.documentElement.clientHeight;

                const visibleLeft = Math.max(0, -canvasRect.left);
                const visibleTop = Math.max(0, -canvasRect.top);
                const visibleRight = Math.min(canvasRect.width, viewportWidth - canvasRect.left);
                const visibleBottom = Math.min(canvasRect.height, viewportHeight - canvasRect.top);
                const visibleWidth = visibleRight - visibleLeft;
                const visibleHeight = visibleBottom - visibleTop;

                const scaleX = canvas.width / canvasRect.width;
                const scaleY = canvas.height / canvasRect.height;

                let dataUrl: string;

                if (visibleWidth < canvasRect.width * 0.95 || visibleHeight < canvasRect.height * 0.95) {
                  const cropX = Math.round(visibleLeft * scaleX);
                  const cropY = Math.round(visibleTop * scaleY);
                  const cropW = Math.round(visibleWidth * scaleX);
                  const cropH = Math.round(visibleHeight * scaleY);

                  const tempCanvas = doc.createElement("canvas");
                  tempCanvas.width = cropW;
                  tempCanvas.height = cropH;
                  const ctx = tempCanvas.getContext("2d");
                  if (ctx) {
                    ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                    dataUrl = tempCanvas.toDataURL("image/png");
                    debug(`Captured visible portion: ${cropW}x${cropH}, ${Math.round(dataUrl.length / 1024)}KB`);
                  } else {
                    dataUrl = canvas.toDataURL("image/png");
                  }
                } else {
                  dataUrl = canvas.toDataURL("image/png");
                  debug(`Captured full page: ${canvas.width}x${canvas.height}, ${Math.round(dataUrl.length / 1024)}KB`);
                }

                if (dataUrl && dataUrl.length > 100) {
                  return { screenshot: dataUrl, pageNumber: pageNum };
                }
              } catch (e) {
                error("Canvas toDataURL failed", e);
              }
            }
          }
        }

        // Method 2: Find any large canvas (fallback)
        const canvases = doc.querySelectorAll("canvas");
        if (canvases && canvases.length > 0) {
          let bestCanvas: any = null;
          let bestArea = 0;
          for (let i = 0; i < canvases.length; i++) {
            const c = canvases[i] as any;
            const area = (c.width || 0) * (c.height || 0);
            if (area > bestArea) {
              bestArea = area;
              bestCanvas = c;
            }
          }
          if (bestCanvas && bestArea > 10000) {
            try {
              const dataUrl = bestCanvas.toDataURL("image/png");
              if (dataUrl && dataUrl.length > 100) {
                debug(`Captured fallback canvas: ${bestCanvas.width}x${bestCanvas.height}`);
                return { screenshot: dataUrl, pageNumber: null };
              }
            } catch (e) {
              error("Fallback canvas toDataURL failed", e);
            }
          }
        }
      } catch (e) { /* try next iframe */ }
    }
  } catch (e) {
    error("Error capturing page screenshot", e);
  }
  debug("No screenshot captured");
  return { screenshot: null, pageNumber: null };
}

/**
 * Create an HTML div element, even in XUL documents.
 */
function createHtmlDiv(doc: Document): HTMLElement {
  if (doc.createElementNS) {
    return doc.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement;
  }
  return doc.createElement("div");
}

/**
 * Create the title bar element for the popup.
 */
function createTitleBar(doc: Document): HTMLElement {
  const titleBar = createHtmlDiv(doc);
  titleBar.style.cssText = `
    font-size: 11px;
    font-weight: 600;
    color: #666;
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e0e0e0;
    width: 100%;
    flex-shrink: 0;
  `;
  titleBar.textContent = "🌐 Vibe Translate";
  return titleBar;
}

/**
 * Set the content of a container to show loading state.
 */
function setLoadingState(container: HTMLElement, doc: Document): void {
  const titleBar = container.querySelector("[data-role='title']");
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  if (titleBar) {
    container.appendChild(titleBar);
  } else {
    const newTitle = createTitleBar(doc);
    newTitle.setAttribute("data-role", "title");
    container.appendChild(newTitle);
  }

  const loading = createHtmlDiv(doc);
  loading.setAttribute("data-role", "content");
  loading.style.cssText = "color: #888; font-style: italic;";
  loading.textContent = "Translating...";
  container.appendChild(loading);
}

/**
 * Set the content of a container to show translation result.
 */
function setTranslationResult(container: HTMLElement, doc: Document, result: string): void {
  const contentEl = container.querySelector("[data-role='content']");
  if (contentEl) {
    (contentEl as HTMLElement).style.cssText = `
      color: #333;
      font-style: normal;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.6;
      font-family: "SF Mono", "Monaco", "Menlo", "Consolas", monospace;
      font-size: 12px;
    `;
    contentEl.textContent = result;
  }
}

/**
 * Set the content of a container to show an error.
 */
function setErrorState(container: HTMLElement, doc: Document, errorMsg: string, details?: string): void {
  const contentEl = container.querySelector("[data-role='content']");
  if (contentEl) {
    (contentEl as HTMLElement).style.cssText = `
      color: #d32f2f;
      font-style: normal;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    `;
    let text = `⚠ Error: ${errorMsg}`;
    if (details) {
      text += `\n\n${details}`;
    }
    contentEl.textContent = text;
  }
}

/**
 * Perform translation and update the container with results.
 */
async function performTranslation(
  container: HTMLElement,
  doc: Document,
  context: TranslationContext
): Promise<void> {
  debug(`Starting translation for: "${context.text.substring(0, 50)}..."`);
  debug(`Has screenshot: ${!!context.pageScreenshot}, page: ${context.pageNumber}`);

  try {
    const input: TranslationInput = {
      text: context.text,
      pageScreenshot: context.pageScreenshot,
      pageNumber: context.pageNumber,
    };

    debug("Calling translateText...");
    const result = await translateText(input);
    debug(`Translation result received (${result.length} chars)`);

    if (container.parentNode) {
      setTranslationResult(container, doc, result);
      debug("Translation result displayed in popup");
    } else {
      debug("Container no longer in DOM, skipping result display");
    }

    // Save to wordbook (fire-and-forget, won't affect translation display)
    try {
      const isSingleWord = !context.text.includes(" ") && !context.text.includes("\n");
      saveWord(context.text, result, isSingleWord, context.pageNumber);
    } catch (_e) {
      // Silently ignore wordbook save errors
    }
  } catch (e: any) {
    error("Translation error", e);
    if (container.parentNode) {
      const errorMsg = e?.message || String(e);
      const errorDetails = e?.stack ? String(e.stack) : undefined;
      setErrorState(container, doc, errorMsg, errorDetails);
    }
  }
}

/**
 * Check if auto-translate is enabled.
 */
function isAutoTranslateEnabled(): boolean {
  try {
    return !!Zotero.Prefs.get(`${PREF_PREFIX}.autoTranslate`, true);
  } catch {
    return false;
  }
}

/**
 * Prepare translation context (screenshot + page number) from reader.
 */
function prepareContext(selectedText: string, reader: any): TranslationContext {
  let enableContext = true;
  try {
    const val = Zotero.Prefs.get(`${PREF_PREFIX}.enableContext`, true);
    if (val === false) enableContext = false;
  } catch (e) { /* default to true */ }

  debug(`Context (screenshot) enabled: ${enableContext}`);

  const { screenshot, pageNumber } = enableContext
    ? capturePageScreenshot(reader)
    : { screenshot: null, pageNumber: null };

  if (screenshot) {
    log(`Got selection "${selectedText.substring(0, 50)}..." with page ${pageNumber} screenshot`);
  } else {
    log(`Got selection "${selectedText.substring(0, 50)}..." (no screenshot)`);
  }

  return {
    text: selectedText,
    pageScreenshot: screenshot,
    pageNumber,
  };
}

// Store the last selection event so keyboard shortcut can trigger translation
let _lastSelectionEvent: {
  reader: any;
  doc: Document;
  append: (element: Element) => void;
  text: string;
} | null = null;

/**
 * Handle the renderTextSelectionPopup event from Zotero Reader.
 */
export function onReaderTextSelection(event: {
  reader: any;
  doc: Document;
  params: { annotation: { text: string } };
  append: (element: Element) => void;
}): void {
  debug("onReaderTextSelection called");
  const { reader, doc, params, append } = event;
  const selectedText = params.annotation.text?.trim();

  if (!selectedText || selectedText.length === 0) {
    debug("No text selected, returning");
    return;
  }

  debug(`Selected text: "${selectedText.substring(0, 80)}${selectedText.length > 80 ? "..." : ""}"`);

  // Store for keyboard shortcut use
  _lastSelectionEvent = { reader, doc, append, text: selectedText };

  const autoTranslate = isAutoTranslateEnabled();
  debug(`Auto-translate enabled: ${autoTranslate}`);

  if (autoTranslate) {
    // Auto-translate: immediately start translation
    const context = prepareContext(selectedText, reader);
    const position = getPopupPosition();
    debug(`Popup position mode: ${position}`);

    if (position === "popup") {
      debug("Building inline popup...");
      buildInlinePopup(doc, append, context);
    } else {
      debug("Showing corner popup...");
      showCornerPopup(context, position, reader);
    }
  } else {
    // Manual mode: show a "Translate" button
    debug("Manual mode: showing translate button");
    buildTranslateButton(doc, append, selectedText, reader);
  }
}

/**
 * Trigger translation from keyboard shortcut or button click.
 * Uses the stored selection event or provided parameters.
 */
export function triggerTranslation(text?: string, reader?: any, doc?: Document, append?: (element: Element) => void): void {
  const selText = text || _lastSelectionEvent?.text;
  const selReader = reader || _lastSelectionEvent?.reader;
  const selDoc = doc || _lastSelectionEvent?.doc;
  const selAppend = append || _lastSelectionEvent?.append;

  if (!selText || !selReader) {
    debug("No selection available for translation");
    return;
  }

  debug(`Triggering translation for: "${selText.substring(0, 50)}..."`);

  const context = prepareContext(selText, selReader);
  const position = getPopupPosition();

  if (position === "popup" && selDoc && selAppend) {
    buildInlinePopup(selDoc, selAppend, context);
  } else if (selReader) {
    showCornerPopup(context, position !== "popup" ? position : "bottom-right", selReader);
  }
}

/**
 * Build a small circular translate dot near the selected text.
 * Uses mouseup screen coordinates for positioning in the main window.
 * Dot disappears on scroll, click elsewhere, or popup removal.
 */
function buildTranslateButton(
  doc: Document,
  append: (element: Element) => void,
  selectedText: string,
  reader: any
): void {
  const mainWin = Zotero.getMainWindow();
  if (!mainWin) { debug("No main window"); return; }
  const mainDoc = mainWin.document;

  // Remove previous dot
  const prev = mainDoc.getElementById("vibe-translate-dot");
  if (prev) prev.remove();

  // Probe for popup removal detection
  const probe = doc.createElement("div");
  probe.id = "vibe-translate-probe";
  probe.style.cssText = "width:0;height:0;overflow:hidden;margin:0;padding:0;";
  append(probe);
  const popupEl = probe.parentElement;

  // Calculate position from mouseup screen coordinates
  let topPos: number;
  let leftPos: number;

  if (_lastMouseUp && (Date.now() - _lastMouseUp.time < 5000)) {
    const winScreenX = mainWin.screenX || (mainWin as any).screenLeft || 0;
    const winScreenY = mainWin.screenY || (mainWin as any).screenTop || 0;
    topPos = _lastMouseUp.screenY - winScreenY - 7;
    leftPos = _lastMouseUp.screenX - winScreenX + 10;
  } else if (popupEl) {
    try {
      const popupRect = popupEl.getBoundingClientRect();
      const iframeWin = reader._iframeWindow;
      let oX = 0, oY = 0;
      if (iframeWin?.frameElement) { const r = iframeWin.frameElement.getBoundingClientRect(); oX = r.left; oY = r.top; }
      topPos = popupRect.top + oY - 30;
      leftPos = popupRect.left + oX + Math.round(popupRect.width / 2);
    } catch (_e) { topPos = 100; leftPos = 100; }
  } else {
    try { probe.remove(); } catch (_e) {}
    return;
  }

  try { probe.remove(); } catch (_e) {}

  // Create dot
  const dot = mainDoc.createElementNS ? mainDoc.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement : mainDoc.createElement("div");
  dot.id = "vibe-translate-dot";
  dot.title = "Translate (Ctrl+Shift+T)";
  dot.style.cssText = `position:fixed;top:${Math.max(4,topPos)}px;left:${Math.max(4,leftPos)}px;width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);cursor:pointer;z-index:2147483647;pointer-events:auto;box-shadow:0 2px 6px rgba(102,126,234,0.5);transition:transform .15s,box-shadow .15s;display:flex;align-items:center;justify-content:center;`;

  const label = mainDoc.createElementNS ? mainDoc.createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLElement : mainDoc.createElement("span");
  label.style.cssText = `color:#fff;font-size:11px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1;user-select:none;`;
  label.textContent = "T";
  dot.appendChild(label);

  dot.addEventListener("mouseenter", () => { dot.style.transform = "scale(1.2)"; dot.style.boxShadow = "0 3px 10px rgba(102,126,234,0.6)"; });
  dot.addEventListener("mouseleave", () => { dot.style.transform = "scale(1)"; dot.style.boxShadow = "0 2px 6px rgba(102,126,234,0.5)"; });

  let pollInterval: ReturnType<typeof setInterval> | null = null;
  const cleanup = () => {
    try { dot.remove(); } catch (_e) {}
    if (pollInterval) clearInterval(pollInterval);
  };

  dot.addEventListener("click", (e: Event) => {
    e.preventDefault(); e.stopPropagation(); cleanup();
    const context = prepareContext(selectedText, reader);
    const position = getPopupPosition();
    // Try inline popup first; if the Zotero popup is gone, fall back to corner popup
    if (position === "popup") {
      try {
        buildInlinePopup(doc, append, context);
      } catch (_err) {
        debug("Inline popup failed (popup may be gone), using corner popup");
        showCornerPopup(context, "bottom-right", reader);
      }
    } else {
      showCornerPopup(context, position, reader);
    }
  });

  // Append to main window
  (mainDoc.getElementById("browser") || mainDoc.getElementById("main-window") || mainDoc.documentElement)?.appendChild(dot);
  debug(`Translate dot at (${leftPos}, ${topPos}) in main window`);

  // Poll for popup removal
  pollInterval = setInterval(() => {
    try { if (popupEl && (!popupEl.parentNode || !doc.contains(popupEl))) { cleanup(); } } catch (_e) { cleanup(); }
  }, 500);

  // Clean up on click elsewhere
  const onMainClick = (ev: Event) => { if (!dot.contains(ev.target as Node)) { cleanup(); mainDoc.removeEventListener("mousedown", onMainClick, true); } };
  setTimeout(() => mainDoc.addEventListener("mousedown", onMainClick, true), 200);

  // Clean up on scroll (dot position becomes stale with position:fixed)
  try {
    const iframeWin = reader._iframeWindow;
    if (iframeWin) {
      const onScroll = () => { cleanup(); iframeWin.removeEventListener("scroll", onScroll, true); };
      iframeWin.addEventListener("scroll", onScroll, true);
      try {
        const nested = iframeWin.document?.querySelectorAll?.("iframe");
        if (nested) { for (let i = 0; i < nested.length; i++) { try { nested[i].contentWindow?.addEventListener("scroll", onScroll, true); } catch (_e) {} } }
      } catch (_e) {}
    }
  } catch (_e) {}
}

/**
 * Build content that gets appended into Zotero's native text selection popup.
 */
function buildInlinePopup(
  doc: Document,
  append: (element: Element) => void,
  context: TranslationContext
): void {
  const container = doc.createElement("div");
  container.id = TRANSLATE_CONTENT_ID;
  container.style.cssText = `
    width: calc(100% - 4px);
    margin: 4px 2px;
    padding: 8px 10px;
    background: var(--color-sidepane, #f5f5f5);
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    color: #333;
    line-height: 1.6;
    max-height: 300px;
    overflow-y: auto;
    box-sizing: border-box;
  `;

  // Title bar
  const titleBar = createTitleBar(doc);
  titleBar.setAttribute("data-role", "title");
  container.appendChild(titleBar);

  // Loading state
  const contentEl = doc.createElement("div");
  contentEl.setAttribute("data-role", "content");
  contentEl.style.cssText = "color: #888; font-style: italic;";
  contentEl.textContent = "Translating...";
  container.appendChild(contentEl);

  append(container);
  debug("Inline popup appended to DOM");

  // Start translation asynchronously
  performTranslation(container, doc, context);
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Try to get the reader pane bounds in main window coordinates.
 */
function getReaderPaneBounds(reader: any): Bounds | null {
  try {
    const win = Zotero.getMainWindow();
    if (!win) return null;

    const iframeWin = reader._iframeWindow;
    if (iframeWin) {
      const frameEl = iframeWin.frameElement;
      if (frameEl) {
        const rect = frameEl.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) {
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        }
      }

      const iframeScreenX = iframeWin.screenX || iframeWin.screenLeft || 0;
      const iframeScreenY = iframeWin.screenY || iframeWin.screenTop || 0;
      const winScreenX = win.screenX || win.screenLeft || 0;
      const winScreenY = win.screenY || win.screenTop || 0;
      const iframeLeft = iframeScreenX - winScreenX;
      const iframeTop = iframeScreenY - winScreenY;
      const iframeWidth = iframeWin.innerWidth || 0;
      const iframeHeight = iframeWin.innerHeight || 0;

      if (iframeWidth > 100 && iframeHeight > 100) {
        return {
          left: iframeLeft,
          top: iframeTop,
          right: iframeLeft + iframeWidth,
          bottom: iframeTop + iframeHeight,
        };
      }
    }

    const browsers = win.document.querySelectorAll("browser[type='content']");
    for (let i = 0; i < browsers.length; i++) {
      const browser = browsers[i] as any;
      const rect = browser.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 200) {
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      }
    }
  } catch (e) {
    error("Error getting reader pane bounds", e);
  }
  return null;
}

/**
 * Show a popup at a fixed corner of the reader pane.
 * Reuses existing popup if present (updates content instead of creating new one).
 */
function showCornerPopup(
  context: TranslationContext,
  position: PopupPosition,
  reader: any
): void {
  const win = Zotero.getMainWindow();
  if (!win) {
    debug("No main window found");
    return;
  }
  const doc = win.document;

  // Check if an existing popup can be reused
  const existingEl = doc.getElementById(TRANSLATE_CONTENT_ID) as HTMLElement | null;
  const isNew = !existingEl;
  debug(`Corner popup: isNew=${isNew}`);

  const container: HTMLElement = existingEl || (
    doc.createElementNS
      ? doc.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement
      : doc.createElement("div")
  );
  container.id = TRANSLATE_CONTENT_ID;

  const width = 350;
  const popupHeight = 300;

  const readerBounds = getReaderPaneBounds(reader);
  const bounds: Bounds = readerBounds || {
    left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight,
  };

  let left: number;
  let top: number;

  switch (position) {
    case "bottom-left":
      left = bounds.left;
      top = bounds.bottom - popupHeight;
      break;
    case "bottom-right":
      left = bounds.right - width;
      top = bounds.bottom - popupHeight;
      break;
    case "top-left":
      left = bounds.left;
      top = bounds.top;
      break;
    case "top-right":
      left = bounds.right - width;
      top = bounds.top;
      break;
    default:
      left = bounds.left;
      top = bounds.bottom - popupHeight;
      break;
  }

  left = Math.max(0, Math.min(left, win.innerWidth - width));
  top = Math.max(0, Math.min(top, win.innerHeight - popupHeight));

  container.style.cssText = `
    position: fixed;
    left: ${left}px;
    top: ${top}px;
    width: ${width}px;
    max-height: ${popupHeight}px;
    background: #ffffff;
    border: 1px solid #d0d0d0;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    z-index: 2147483647;
    padding: 10px 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    color: #333;
    line-height: 1.6;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    box-sizing: border-box;
    pointer-events: auto;
  `;

  // Clear and rebuild content
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Title bar
  const titleBar = createTitleBar(doc);
  titleBar.setAttribute("data-role", "title");
  container.appendChild(titleBar);

  // Loading state
  const contentEl = createHtmlDiv(doc);
  contentEl.setAttribute("data-role", "content");
  contentEl.style.cssText = "color: #888; font-style: italic;";
  contentEl.textContent = "Translating...";
  container.appendChild(contentEl);

  if (isNew) {
    const targets = [
      doc.getElementById("browser"),
      doc.getElementById("main-window"),
      doc.documentElement,
      doc.body,
    ];

    let appended = false;
    for (const target of targets) {
      if (target) {
        try {
          target.appendChild(container);
          appended = true;
          debug(`Corner popup appended to ${target.id || target.tagName}`);
          break;
        } catch (e) { /* try next */ }
      }
    }

    if (!appended) {
      error("Failed to append corner popup to any target");
      return;
    }

    // Close on click outside (but not on the container itself)
    const removeOnClick = (e: any) => {
      if (container.contains(e.target)) return;
      container.remove();
      doc.removeEventListener("mousedown", removeOnClick);
      debug("Corner popup removed on outside click");
    };
    setTimeout(() => doc.addEventListener("mousedown", removeOnClick), 200);
  }

  // Start translation asynchronously
  performTranslation(container, doc, context);
}