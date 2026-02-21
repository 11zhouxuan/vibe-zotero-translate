/**
 * Wordbook module - File-based word storage + Zotero Server endpoints.
 *
 * Architecture:
 * - Each word is stored as a separate JSON file in ~/Documents/zotero-wordbook/
 * - File names are UUID-based: {uuid}.json
 * - meta.jsonl appended on every write for easy bulk access
 * - HTML page is generated as a file and opened via file:// protocol
 * - Zotero's built-in HTTP server provides API endpoints
 * - Python FastAPI server (wordbook_server.py) as alternative with full CRUD
 */

import { log, debug, error } from "./debug";
import { buildWordbookHTML } from "./wordbook-html";
import { WORDBOOK_SERVER_PY } from "./wordbook-server-py";

const PREF_PREFIX = "extensions.vibe-zotero-translate";
const API_PREFIX = "/vibe-wordbook";
const META_JSONL_NAME = "meta.jsonl";
const HTML_FILENAME = "wordbook.html";

// ============ Data Types ============

interface WordEntry {
  id: string;
  word: string;
  translation: string;
  isSingleWord: boolean;
  starred: boolean;
  queryCount: number;
  pageNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

// ============ File Storage ============

/**
 * Cross-platform path join using nsIFile.append().
 * Avoids mixing "/" and "\" which breaks nsIFile.initWithPath on Windows.
 */
function joinPath(base: string, ...parts: string[]): string {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(base);
  for (const part of parts) {
    file.append(part);
  }
  return file.path;
}

function getWordbookDir(): string {
  try {
    const customPath = Zotero.Prefs.get(`${PREF_PREFIX}.wordbookPath`, true) as string;
    if (customPath && customPath.trim()) {
      return customPath.trim();
    }
  } catch (e) { /* use default */ }
  const homeDir = Services.dirsvc.get("Home", Ci.nsIFile).path;
  return joinPath(homeDir, "Documents", "zotero-wordbook");
}

let _serverScriptCopied = false;

function ensureWordbookDir(): void {
  const dirPath = getWordbookDir();
  const dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  dir.initWithPath(dirPath);
  if (!dir.exists()) {
    dir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
    debug(`Created wordbook directory: ${dirPath}`);
  }
  // Copy server script once per session
  if (!_serverScriptCopied) {
    _serverScriptCopied = true;
    copyServerScript(dirPath);
  }
}

/**
 * Copy wordbook_server.py to the wordbook directory.
 * Uses embedded content from wordbook-server-py.ts (bundled at build time).
 */
function copyServerScript(wordbookDir: string): void {
  try {
    const destPath = joinPath(wordbookDir, "wordbook_server.py");
    const destFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    destFile.initWithPath(destPath);

    if (!WORDBOOK_SERVER_PY || WORDBOOK_SERVER_PY.length < 100) {
      log("Embedded wordbook_server.py content is missing or too short");
      return;
    }

    Zotero.File.putContents(destFile, WORDBOOK_SERVER_PY);
    log(`Copied wordbook_server.py to ${destPath} (${WORDBOOK_SERVER_PY.length} bytes)`);
  } catch (e) {
    error(`Failed to copy server script: ${e}`);
  }
}

function generateUUID(): string {
  const uuid = Cc["@mozilla.org/uuid-generator;1"]
    .getService(Ci.nsIUUIDGenerator)
    .generateUUID()
    .toString();
  return uuid.replace(/[{}]/g, "");
}

function readWordFile(filePath: string): WordEntry | null {
  try {
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(filePath);
    if (!file.exists()) return null;
    const content = Zotero.File.getContents(file);
    return JSON.parse(content);
  } catch (e) {
    debug(`Failed to read word file ${filePath}: ${e}`);
    return null;
  }
}

function writeWordFile(entry: WordEntry): void {
  try {
    ensureWordbookDir();
    const wordbookDir = getWordbookDir();
    const filePath = joinPath(wordbookDir, entry.id + ".json");
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(filePath);
    Zotero.File.putContents(file, JSON.stringify(entry, null, 2));
    appendToMetaJsonl(wordbookDir, entry);
  } catch (e) {
    error(`Failed to write word file: ${e}`);
  }
}

function appendToMetaJsonl(wordbookDir: string, entry: WordEntry): void {
  try {
    const jsonlPath = joinPath(wordbookDir, META_JSONL_NAME);
    const jsonLine = JSON.stringify(entry) + "\n";
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(jsonlPath);
    if (file.exists()) {
      const existingContent = Zotero.File.getContents(file);
      Zotero.File.putContents(file, existingContent + jsonLine);
    } else {
      Zotero.File.putContents(file, jsonLine);
    }
  } catch (e) {
    debug(`Failed to append to meta.jsonl: ${e}`);
  }
}

function deleteWordFile(id: string): boolean {
  try {
    const filePath = joinPath(getWordbookDir(), id + ".json");
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(filePath);
    if (file.exists()) {
      file.remove(false);
      return true;
    }
  } catch (e) {
    error(`Failed to delete word file ${id}: ${e}`);
  }
  return false;
}

function readAllWords(): WordEntry[] {
  const words: WordEntry[] = [];
  try {
    ensureWordbookDir();
    const dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    dir.initWithPath(getWordbookDir());
    const entries = dir.directoryEntries;
    while (entries.hasMoreElements()) {
      const entry = entries.getNext().QueryInterface(Ci.nsIFile);
      if (entry.leafName.endsWith(".json")) {
        const word = readWordFile(entry.path);
        if (word) words.push(word);
      }
    }
  } catch (e) {
    error(`Failed to read wordbook directory: ${e}`);
  }
  return words;
}

function findWordByText(wordText: string): WordEntry | null {
  const allWords = readAllWords();
  return allWords.find(w => w.word.toLowerCase() === wordText.toLowerCase()) || null;
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ============ Public API: Save Word ============

export function saveWord(
  word: string,
  translation: string,
  isSingleWord: boolean,
  pageNumber: number | null,
): void {
  try {
    const now = new Date().toISOString();
    const existing = findWordByText(word);
    if (existing) {
      existing.translation = translation;
      existing.queryCount += 1;
      existing.updatedAt = now;
      if (pageNumber !== null) existing.pageNumber = pageNumber;
      writeWordFile(existing);
      debug(`Updated word: "${word}" (count: ${existing.queryCount})`);
    } else {
      const entry: WordEntry = {
        id: generateUUID(),
        word: word.trim(),
        translation,
        isSingleWord,
        starred: false,
        queryCount: 1,
        pageNumber,
        createdAt: now,
        updatedAt: now,
      };
      writeWordFile(entry);
      debug(`Saved new word: "${word}"`);
    }
  } catch (e) {
    error(`Failed to save word: ${e}`);
  }
}

// ============ Zotero Server Endpoints ============

export function registerServerEndpoints(): void {
  debug("Registering wordbook server endpoints...");

  // Ensure wordbook dir exists and copy server script on startup
  try {
    ensureWordbookDir();
  } catch (e) {
    debug(`ensureWordbookDir during init: ${e}`);
  }

  function makeEndpoint(methods: string[], handler: (options: any) => Promise<any>) {
    const Ep = function () {} as any;
    Ep.prototype = {
      supportedMethods: methods,
      permitBookmarklet: true,
      init: handler,
    };
    return Ep;
  }

  // GET /vibe-wordbook/api/words
  Zotero.Server.Endpoints[API_PREFIX + "/api/words"] = makeEndpoint(["GET"], async function (options: any) {
    try {
      const query = options.query || {};
      let words = readAllWords();
      const q = query.q;
      if (q && q.trim()) {
        const search = q.trim().toLowerCase();
        words = words.filter((w: WordEntry) =>
          w.word.toLowerCase().includes(search) || w.translation.toLowerCase().includes(search));
      }
      if (query.starred === "true" || query.starred === "1") {
        words = words.filter((w: WordEntry) => w.starred);
      }
      const sort = query.sort || "time";
      switch (sort) {
        case "word": case "alpha":
          words.sort((a: WordEntry, b: WordEntry) => a.word.localeCompare(b.word)); break;
        case "count":
          words.sort((a: WordEntry, b: WordEntry) => b.queryCount - a.queryCount); break;
        default:
          words.sort((a: WordEntry, b: WordEntry) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()); break;
      }
      return [200, "application/json", JSON.stringify({ words, total: words.length })];
    } catch (e: any) {
      return [500, "application/json", JSON.stringify({ error: e.message })];
    }
  });

  // POST /vibe-wordbook/api/words/star
  Zotero.Server.Endpoints[API_PREFIX + "/api/words/star"] = makeEndpoint(["POST"], async function (options: any) {
    try {
      const data = typeof options.data === "string" ? JSON.parse(options.data) : options.data;
      const { id } = data;
      if (!id) return [400, "application/json", JSON.stringify({ error: "id required" })];
      const filePath = joinPath(getWordbookDir(), id + ".json");
      const entry = readWordFile(filePath);
      if (!entry) return [404, "application/json", JSON.stringify({ error: "Word not found" })];
      entry.starred = !entry.starred;
      entry.updatedAt = new Date().toISOString();
      writeWordFile(entry);
      return [200, "application/json", JSON.stringify({ success: true, word: entry })];
    } catch (e: any) {
      return [500, "application/json", JSON.stringify({ error: e.message })];
    }
  });

  // POST /vibe-wordbook/api/words/delete
  Zotero.Server.Endpoints[API_PREFIX + "/api/words/delete"] = makeEndpoint(["POST"], async function (options: any) {
    try {
      const data = typeof options.data === "string" ? JSON.parse(options.data) : options.data;
      const { id } = data;
      if (!id) return [400, "application/json", JSON.stringify({ error: "id required" })];
      if (!deleteWordFile(id)) return [404, "application/json", JSON.stringify({ error: "Word not found" })];
      return [200, "application/json", JSON.stringify({ success: true })];
    } catch (e: any) {
      return [500, "application/json", JSON.stringify({ error: e.message })];
    }
  });

  // GET /vibe-wordbook/api/stats
  Zotero.Server.Endpoints[API_PREFIX + "/api/stats"] = makeEndpoint(["GET"], async function (_options: any) {
    try {
      const words = readAllWords();
      return [200, "application/json", JSON.stringify({
        total: words.length,
        starred: words.filter((w: WordEntry) => w.starred).length,
        singleWords: words.filter((w: WordEntry) => w.isSingleWord).length,
        phrases: words.filter((w: WordEntry) => !w.isSingleWord).length,
      })];
    } catch (e: any) {
      return [500, "application/json", JSON.stringify({ error: e.message })];
    }
  });

  // GET /vibe-wordbook/api/export/csv
  Zotero.Server.Endpoints[API_PREFIX + "/api/export/csv"] = makeEndpoint(["GET"], async function (options: any) {
    try {
      const query = options.query || {};
      let words = readAllWords();
      if (query.starred === "true" || query.starred === "1") {
        words = words.filter((w: WordEntry) => w.starred);
      }
      words.sort((a: WordEntry, b: WordEntry) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      const csvRows = ["Word,Translation,Type,Starred,Count,Page,Created,Updated"];
      for (const w of words) {
        csvRows.push([
          csvEscape(w.word), csvEscape(w.translation),
          w.isSingleWord ? "word" : "phrase", w.starred ? "yes" : "no",
          String(w.queryCount), w.pageNumber !== null ? String(w.pageNumber) : "",
          w.createdAt, w.updatedAt,
        ].join(","));
      }
      return [200, "text/csv; charset=utf-8", csvRows.join("\n")];
    } catch (e: any) {
      return [500, "application/json", JSON.stringify({ error: e.message })];
    }
  });

  // GET /vibe-wordbook/api/export/anki - TSV format (front\tback)
  Zotero.Server.Endpoints[API_PREFIX + "/api/export/anki"] = makeEndpoint(["GET"], async function (options: any) {
    try {
      const query = options.query || {};
      let words = readAllWords();
      if (query.starred === "true" || query.starred === "1") {
        words = words.filter((w: WordEntry) => w.starred);
      }
      words.sort((a: WordEntry, b: WordEntry) => a.word.localeCompare(b.word));
      const lines: string[] = [];
      for (const w of words) {
        const front = w.word.replace(/\t/g, " ").replace(/\n/g, " ");
        const back = w.translation.replace(/\t/g, " ").replace(/\n/g, "<br>");
        lines.push(front + "\t" + back);
      }
      return [200, "text/tab-separated-values; charset=utf-8", lines.join("\n")];
    } catch (e: any) {
      return [500, "application/json", JSON.stringify({ error: e.message })];
    }
  });

  log("Wordbook server endpoints registered");
}

// ============ Open Wordbook ============

export function openWordbook(): void {
  try {
    ensureWordbookDir();
    const wordbookDir = getWordbookDir();
    const words = readAllWords();
    words.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const wordsJSON = JSON.stringify(words)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");

    const stats = {
      total: words.length,
      starred: words.filter(w => w.starred).length,
      singleWords: words.filter(w => w.isSingleWord).length,
      phrases: words.filter(w => !w.isSingleWord).length,
      totalQueries: words.reduce((sum, w) => sum + w.queryCount, 0),
    };

    const htmlContent = buildWordbookHTML(wordsJSON, stats);
    const htmlPath = joinPath(wordbookDir, HTML_FILENAME);
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(htmlPath);
    Zotero.File.putContents(file, htmlContent);

    // Use Services.io.newFileURI for proper cross-platform file:// URL
    const url = Services.io.newFileURI(file).spec;
    log(`Opening wordbook: ${url}`);
    Zotero.launchURL(url);
  } catch (e: any) {
    error("Failed to open wordbook", e);
  }
}