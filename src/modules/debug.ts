const PREF_PREFIX = "extensions.vibe-zotero-translate";
const LOG_PREFIX = "[Vibe Zotero Translate]";

/**
 * Check if debug mode is enabled.
 */
function isDebugEnabled(): boolean {
  try {
    return Zotero.Prefs.get(`${PREF_PREFIX}.debug`, true) === true;
  } catch (e) {
    return false;
  }
}

/**
 * Always log (regardless of debug mode).
 */
export function log(message: string): void {
  try {
    Zotero.log(`${LOG_PREFIX} ${message}`);
  } catch (e) {
    // Zotero not available
  }
}

/**
 * Log only when debug mode is enabled.
 */
export function debug(message: string): void {
  if (isDebugEnabled()) {
    log(`[DEBUG] ${message}`);
  }
}

/**
 * Log an error (always logged).
 */
export function error(message: string, err?: any): void {
  const errStr = err ? ` | ${err?.message || String(err)}` : "";
  const stack = err?.stack ? `\n${err.stack}` : "";
  log(`[ERROR] ${message}${errStr}${stack}`);
}