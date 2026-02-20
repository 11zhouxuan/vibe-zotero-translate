import { log, debug, error } from "./modules/debug";
import { onReaderTextSelection } from "./modules/translate";
import { testConnection } from "./modules/llm-service";
import { registerServerEndpoints, openWordbook } from "./modules/wordbook";

const ADDON_ID = "vibe-zotero-translate@example.com";

log("Script loaded");

// Plugin global object exposed to bootstrap.js
const plugin: VibeZoteroTranslateGlobal = {
  async init({ id, version, rootURI }) {
    log(`Initializing v${version}`);

    // Store rootURI for reference
    (Zotero as any).__vibeTranslateRootURI = rootURI;

    try {
      registerReaderListeners();

      // Register wordbook endpoints on Zotero's built-in HTTP server
      registerServerEndpoints();

      log("Initialized successfully");
    } catch (e: any) {
      error("Failed to initialize", e);
    }
  },

  shutdown() {
    log("Shutting down");
    unregisterAll();
  },

  async testConnection() {
    log("Test connection requested");
    return testConnection();
  },

  async openWordbook() {
    log("Open wordbook requested");
    openWordbook();
  },
};

// Store cleanup functions
const cleanupFns: Array<() => void> = [];

/**
 * Register listener for text selection in the Zotero Reader using the official API.
 */
function registerReaderListeners() {
  try {
    debug("Registering renderTextSelectionPopup listener...");

    Zotero.Reader.registerEventListener(
      "renderTextSelectionPopup",
      (event: any) => {
        try {
          debug("renderTextSelectionPopup event fired");
          onReaderTextSelection(event);
        } catch (e: any) {
          error("Error handling text selection", e);
        }
      },
      ADDON_ID,
    );

    log("Registered renderTextSelectionPopup listener");
  } catch (e: any) {
    error("Error registering reader listener", e);
  }
}

function unregisterAll() {
  for (const fn of cleanupFns) {
    try {
      fn();
    } catch (e) {
      /* ignore */
    }
  }
  cleanupFns.length = 0;

  try {
    Zotero.Reader.unregisterEventListener("renderTextSelectionPopup", ADDON_ID);
  } catch (e) {
    // May not exist or may already be cleaned up
  }
}

(globalThis as any).VibeZoteroTranslate = plugin;
// Also register on Zotero object so preferences pane can access it
(Zotero as any).VibeZoteroTranslate = plugin;
// Also register on main window if available
try {
  const mainWin = Zotero.getMainWindow();
  if (mainWin) {
    (mainWin as any).VibeZoteroTranslate = plugin;
  }
} catch (e) { /* ignore */ }
log("Plugin object registered on globalThis and Zotero");