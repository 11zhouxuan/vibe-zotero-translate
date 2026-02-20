<div align="center">

# 🌐 Vibe Zotero Translate

**让 AI 成为你的学术阅读翻译官**

[![Zotero 7](https://img.shields.io/badge/Zotero-7%2F8-4B8BBE?logo=zotero&logoColor=white)](https://www.zotero.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/11zhouxuan/vibe-zotero-translate?include_prereleases&label=Release)](https://github.com/11zhouxuan/vibe-zotero-translate/releases)
[![Build XPI](https://img.shields.io/github/actions/workflow/status/11zhouxuan/vibe-zotero-translate/release.yml?label=Build)](https://github.com/11zhouxuan/vibe-zotero-translate/actions)

**划词即译 · 上下文感知 · 智能生词本**

[English](README.md) | 📖 中文文档

</div>

---

## ✨ 核心亮点

| 特性 | 说明 |
|------|------|
| 🔥 **PDF 划词即译** | 在 Zotero 阅读器中选中文本，翻译结果即刻弹出 |
| 🖼️ **页面截图上下文** | 自动截取 PDF 当前页面发送给 AI，专业术语翻译更精准 |
| 📒 **智能生词本** | 每次翻译自动保存，记录查询次数、页码、时间戳 |
| 🤖 **双 LLM 引擎** | 支持 AWS Bedrock（Claude）+ 任意 OpenAI 兼容 API（GPT-4o、本地模型等） |
| 🌍 **11 种语言** | 中文、英文、日语、韩语、法语、德语、西班牙语、葡萄牙语、俄语、阿拉伯语等 |
| 📤 **Anki 导出** | 一键导出生词本到 Anki，间隔重复高效记忆 |
| ⚡ **零依赖** | 纯 Zotero 插件，无需安装任何额外软件 |

## 🎬 工作流程

```
📄 在 Zotero 中阅读 PDF 文献
    ↓
✏️  选中任意文本（单词或段落）
    ↓
🤖 AI 结合页面上下文进行翻译
    ↓
💬 翻译结果在弹窗中显示
    ↓
📒 自动保存到生词本
```

### 🔤 单词模式
查询单个单词时，返回简洁的词典格式：
```
[n.   ] 银行; 河岸
[v.   ] 存款
📌 此处指"河岸"
```

### 📝 段落模式
翻译句子和段落时，返回专业翻译并标注术语：
```
这是翻译结果

📌 "term" 在此上下文中译为"术语"
```

## 📦 安装方式

### 方式一：从 Releases 下载（推荐）

1. 前往 [**Releases 页面**](https://github.com/11zhouxuan/vibe-zotero-translate/releases)
2. 下载最新的 `vibe-zotero-translate.xpi`
3. 在 Zotero 中：**工具** → **附加组件** → ⚙️ → **从文件安装附加组件**
4. 选择下载的 `.xpi` 文件
5. 重启 Zotero

### 方式二：从源码编译

```bash
git clone https://github.com/11zhouxuan/vibe-zotero-translate.git
cd vibe-zotero-translate
npm install
npm run build
```

编译产物位于 `.scaffold/build/vibe-zotero-translate.xpi`。

## ⚙️ 配置指南

打开 Zotero → **编辑** → **设置** → **Vibe Zotero Translate**

### LLM 服务商

<details>
<summary><b>🅰️ AWS Bedrock（默认）</b></summary>

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | Bedrock API 密钥 | — |
| Model ID | 模型标识符 | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| Region | AWS 区域 | `us-east-1` |

</details>

<details>
<summary><b>🅱️ OpenAI 兼容 API</b></summary>

支持 OpenAI 官方、Azure OpenAI、Ollama、LM Studio 等任何 OpenAI 兼容接口。

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | API 密钥 | — |
| Model ID | 模型标识符 | `gpt-4o` |
| Endpoint | API 端点地址 | `https://api.openai.com/v1/chat/completions` |

</details>

### 翻译设置

| 设置项 | 选项 | 默认值 |
|--------|------|--------|
| 目标语言 | 11 种语言 | 简体中文 |
| 弹窗位置 | 内联 / 左下角 / 右下角 / 左上角 / 右上角 | 内联（选中文本附近） |
| 页面上下文 | 开启/关闭截图上下文 | 开启 |

## 📒 生词本

每次翻译都会自动保存到 `~/Documents/zotero-wordbook/` 目录。

### 功能特性
- 🔍 **搜索** — 按原文或翻译搜索词条
- ⭐ **收藏** — 标记重要词汇，方便复习
- 📊 **统计** — 查看总词数、查询次数等数据
- 📤 **导出** — 支持 CSV、Anki TSV、JSON 三种格式

### 查看生词本

**方式 A：静态 HTML 页面**（内置）
- 在 Zotero 设置 → Vibe Zotero Translate → 点击「Open Wordbook」
- 自动在浏览器中打开精美的生词本页面

**方式 B：交互式 Web 服务器**（完整 CRUD）
```bash
cd ~/Documents/zotero-wordbook
pip install fastapi uvicorn
python wordbook_server.py
# 打开 http://localhost:8765
```

Python 服务器支持：
- ✏️ 在线编辑翻译内容
- ⭐ 收藏状态持久化保存
- 🗑️ 永久删除词条
- 🔄 每 10 秒自动刷新

### 数据安全
- 📁 数据以独立 JSON 文件存储，**卸载插件不会丢失数据**
- 📋 同时写入 `meta.jsonl` 便于批量处理
- 🔄 支持自定义存储路径

## 🔧 开发指南

```bash
# 克隆仓库
git clone https://github.com/11zhouxuan/vibe-zotero-translate.git
cd vibe-zotero-translate

# 安装依赖
npm install

# 启动开发模式（热重载）
npm start

# 构建生产版本
npm run build
```

### 技术栈
- **语言**：TypeScript（编译目标：Firefox 115）
- **构建**：zotero-plugin-scaffold + esbuild
- **插件格式**：Zotero 7/8 Bootstrap 插件
- **HTTP**：使用 Zotero 内置 HTTP API，零 SDK 依赖

### 项目结构
```
src/
├── index.ts              # 插件入口
└── modules/
    ├── translate.ts      # PDF 划词选择 & 弹窗 UI
    ├── llm-service.ts    # Bedrock & OpenAI API 集成
    ├── wordbook.ts       # 文件存储 & HTTP 端点
    ├── wordbook-html.ts  # 静态 HTML 页面生成
    └── debug.ts          # 日志工具
addon/
├── bootstrap.js          # Zotero 插件生命周期
├── manifest.json         # 插件清单
├── prefs.js              # 默认偏好设置
└── chrome/content/
    └── preferences.xhtml # 设置界面
```

## 🏗️ CI/CD 自动发布

推送 tag 即可自动编译并发布：

```bash
# 创建发布版本
git tag v0.1.0
git push origin main --tags
```

GitHub Actions 会自动：
1. 编译 XPI 文件
2. 创建 GitHub Release
3. 上传 `vibe-zotero-translate.xpi` 供下载

包含 `-beta`、`-rc`、`-alpha` 的 tag 会自动标记为预发布版本。

## 📄 许可证

[MIT License](LICENSE) — 自由使用，助力你的学术研究。

## 🙏 致谢

- [Zotero](https://www.zotero.org/) — 最好的开源文献管理工具
- [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold) — 插件开发脚手架
- [Anthropic Claude](https://www.anthropic.com/) & [OpenAI](https://openai.com/) — LLM 服务提供商

---

<div align="center">

**如果这个插件对你的研究有帮助，请给个 ⭐ 支持一下！**

</div>