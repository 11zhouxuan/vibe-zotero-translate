<div align="center">

# 🌐 Vibe Zotero Translate

**Your AI-Powered Academic Reading Companion for Zotero**

[![Zotero 7](https://img.shields.io/badge/Zotero-7%2F8-4B8BBE?logo=zotero&logoColor=white)](https://www.zotero.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/user/vibe-zotero-translate?include_prereleases&label=Release)](https://github.com/user/vibe-zotero-translate/releases)
[![Build XPI](https://img.shields.io/github/actions/workflow/status/user/vibe-zotero-translate/release.yml?label=Build)](https://github.com/user/vibe-zotero-translate/actions)

**Select text → Get instant translation → Build your wordbook**

[📖 中文文档](README.zh-CN.md) | English

</div>

---

## ✨ Highlights

| Feature | Description |
|---------|-------------|
| 🔥 **Instant Translation** | Select text in PDF reader, get translation in a popup instantly |
| 🖼️ **Visual Context** | Automatically captures PDF page screenshot for AI context — domain-specific terms translated more accurately |
| 📒 **Smart Wordbook** | Every translation is auto-saved with query count, page number, and timestamps |
| 🤖 **Dual LLM Engines** | AWS Bedrock (Claude) + any OpenAI-compatible API (GPT-4o, local models, etc.) |
| 🌍 **11 Languages** | Chinese, English, Japanese, Korean, French, German, Spanish, Portuguese, Russian, Arabic, and more |
| 📤 **Anki Export** | Export your wordbook to Anki for spaced repetition learning |
| ⚡ **Zero Dependencies** | Pure Zotero plugin — no external software needed |

## 🎬 How It Works

```
📄 Reading a PDF in Zotero
    ↓
✏️  Select any text (word or paragraph)
    ↓
🤖 AI translates with page context
    ↓
💬 Translation appears in popup
    ↓
📒 Auto-saved to your wordbook
```

### 🔤 Word Mode
For single words, get a concise dictionary-style result:
```
[n.   ] 银行; 河岸
[v.   ] 存款
📌 此处指"河岸"
```

### 📝 Paragraph Mode
For sentences and paragraphs, get a professional translation with term annotations:
```
这是翻译结果

📌 "term" 在此上下文中译为"术语"
```

## 📦 Installation

### Option 1: Download from Releases (Recommended)

1. Go to [**Releases**](https://github.com/user/vibe-zotero-translate/releases)
2. Download the latest `vibe-zotero-translate.xpi`
3. In Zotero: **Tools** → **Add-ons** → ⚙️ → **Install Add-on From File**
4. Select the downloaded `.xpi` file
5. Restart Zotero

### Option 2: Build from Source

```bash
git clone https://github.com/user/vibe-zotero-translate.git
cd vibe-zotero-translate
npm install
npm run build
```

The compiled XPI will be at `.scaffold/build/vibe-zotero-translate.xpi`.

## ⚙️ Configuration

Open Zotero → **Edit** → **Settings** → **Vibe Zotero Translate**

### LLM Provider

<details>
<summary><b>🅰️ AWS Bedrock (Default)</b></summary>

| Setting | Description | Default |
|---------|-------------|---------|
| API Key | Your Bedrock API key | — |
| Model ID | Model identifier | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| Region | AWS region | `us-east-1` |

</details>

<details>
<summary><b>🅱️ OpenAI Compatible</b></summary>

Works with OpenAI, Azure OpenAI, Ollama, LM Studio, and any OpenAI-compatible API.

| Setting | Description | Default |
|---------|-------------|---------|
| API Key | Your API key | — |
| Model ID | Model identifier | `gpt-4o` |
| Endpoint | API endpoint URL | `https://api.openai.com/v1/chat/completions` |

</details>

### Translation Settings

| Setting | Options | Default |
|---------|---------|---------|
| Target Language | 11 languages | Chinese (Simplified) |
| Popup Position | Inline / Bottom-Left / Bottom-Right / Top-Left / Top-Right | Inline (near selection) |
| Page Context | Enable/disable screenshot context | Enabled |

## 📒 Wordbook

Every translation is automatically saved to your wordbook at `~/Documents/zotero-wordbook/`.

### Features
- 🔍 **Search** — Find words by text or translation
- ⭐ **Star** — Mark important words for review
- 📊 **Stats** — Track total words, query counts, and more
- 📤 **Export** — CSV, Anki TSV, or JSON format

### Viewing Your Wordbook

**Option A: Static HTML** (built-in)
- In Zotero settings → Vibe Zotero Translate → Click "Open Wordbook"
- Opens a beautiful HTML page in your browser

**Option B: Interactive Web Server** (full CRUD)
```bash
cd ~/Documents/zotero-wordbook
pip install fastapi uvicorn
python wordbook_server.py
# Open http://localhost:8765
```

The Python server supports:
- ✏️ Edit translations inline
- ⭐ Toggle star with persistence
- 🗑️ Delete words permanently
- 🔄 Auto-refresh every 10 seconds

## 🔧 Development

```bash
# Clone the repo
git clone https://github.com/user/vibe-zotero-translate.git
cd vibe-zotero-translate

# Install dependencies
npm install

# Start development (hot reload)
npm start

# Build for production
npm run build
```

### Tech Stack
- **Language**: TypeScript (target: Firefox 115)
- **Build**: zotero-plugin-scaffold + esbuild
- **Plugin Format**: Zotero 7/8 Bootstrap
- **HTTP**: Zotero built-in HTTP API (zero SDK dependencies)

### Project Structure
```
src/
├── index.ts              # Plugin entry point
└── modules/
    ├── translate.ts      # PDF text selection & popup UI
    ├── llm-service.ts    # Bedrock & OpenAI API integration
    ├── wordbook.ts       # File-based word storage & HTTP endpoints
    ├── wordbook-html.ts  # Static HTML page generator
    └── debug.ts          # Logging utilities
addon/
├── bootstrap.js          # Zotero plugin lifecycle
├── manifest.json         # Plugin manifest
├── prefs.js              # Default preferences
└── chrome/content/
    └── preferences.xhtml # Settings UI
```

## 🏗️ CI/CD

Push a tag to automatically build and release:

```bash
# Create a release
git tag v0.1.0
git push origin main --tags
```

GitHub Actions will:
1. Build the XPI
2. Create a GitHub Release
3. Upload `vibe-zotero-translate.xpi` as a downloadable asset

Tags with `-beta`, `-rc`, or `-alpha` are marked as pre-releases.

## 📄 License

[MIT License](LICENSE) — Use it freely in your academic workflow.

## 🙏 Acknowledgments

- [Zotero](https://www.zotero.org/) — The best open-source reference manager
- [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold) — Plugin development toolkit
- [Anthropic Claude](https://www.anthropic.com/) & [OpenAI](https://openai.com/) — LLM providers

---

<div align="center">

**If this plugin helps your research, give it a ⭐!**

</div>