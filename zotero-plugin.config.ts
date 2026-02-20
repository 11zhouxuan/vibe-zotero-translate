import { defineConfig } from "zotero-plugin-scaffold";

export default defineConfig({
  name: "Vibe Zotero Translate",
  id: "vibe-zotero-translate@example.com",
  namespace: "vibe-zotero-translate",
  source: ["src", "addon"],
  build: {
    assets: ["addon/**/*.*"],
    define: {
      author: "Vibe",
      description: "A Zotero plugin for translating selected text",
      homepage: "https://github.com/11zhouxuan/vibe-zotero-translate",
      buildVersion: "{{version}}",
      buildTime: "{{buildTime}}",
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox115",
        outfile: "addon/content/index.js",
      },
    ],
  },
});