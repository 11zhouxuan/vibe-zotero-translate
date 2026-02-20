declare const __env__: string;

declare const Zotero: any;
declare const Services: any;
declare const Cc: any;
declare const Ci: any;
declare const Components: any;
declare const ChromeUtils: any;

declare interface VibeZoteroTranslateGlobal {
  init(params: { id: string; version: string; rootURI: string }): Promise<void>;
  shutdown(): void;
  testConnection(): Promise<string>;
  openWordbook(): Promise<void>;
}

declare var VibeZoteroTranslate: VibeZoteroTranslateGlobal;