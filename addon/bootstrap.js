/* eslint-disable no-undef */

// This file is the entry point for Zotero 7/8 bootstrap plugins.
// It delegates lifecycle events to the bundled plugin code.

var chromeHandle;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  // Register preferences pane
  Zotero.PreferencePanes.register({
    pluginID: id,
    src: rootURI + "chrome/content/preferences.xhtml",
    label: "Vibe Zotero Translate",
  });

  await Zotero.uiReadyPromise;

  // Load the bundled plugin script
  Services.scriptloader.loadSubScript(rootURI + "content/index.js");

  // Initialize the plugin
  if (typeof VibeZoteroTranslate !== "undefined") {
    VibeZoteroTranslate.init({ id, version, rootURI });
  }
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (typeof VibeZoteroTranslate !== "undefined") {
    VibeZoteroTranslate.shutdown();
  }

  // Unregister resources
  Cc["@mozilla.org/intl/stringbundle;1"]
    ?.getService(Ci.nsIStringBundleService)
    ?.flushBundles();
}

function uninstall(data, reason) {}