---
name: llm-provider
description: Build a multi-provider LLM service layer with zero SDK dependencies. Use when implementing LLM API integrations supporting OpenAI-compatible APIs (OpenAI, DeepSeek, Ollama, Groq, Together AI, etc.), AWS Bedrock Converse API, Google Gemini, or Anthropic direct API. Covers provider abstraction, configuration management, multimodal (text+image) support, error handling with graceful degradation, and adding new providers.
---

# LLM Provider Service

Build a zero-dependency, multi-provider LLM service using raw HTTP calls. No SDK required.

## Architecture

```
getConfig()          → Read provider + credentials from config store
buildXxxBody()       → Provider-specific request body construction
callXxx()            → Provider-specific HTTP call + response parsing
callModel()          → Unified dispatcher (routes to correct provider)
publicAPI()          → Domain-specific functions exposed to consumers
```

### Core Design Principles

1. **Zero SDK dependency** - Use `fetch()` or equivalent HTTP client directly
2. **Provider as config** - Switch providers by changing a config value, not code
3. **Unified interface** - All providers expose the same `callModel(system, user, image?)` signature
4. **Multimodal by default** - Support text + image input; degrade gracefully if unsupported
5. **Separate concerns** - Config reading, body building, HTTP calling, and response parsing are distinct functions

## Implementation Template

### 1. Types and Config

```typescript
type Provider = "bedrock" | "openai";

interface LLMConfig {
  provider: Provider;
  apiKey: string;
  modelId: string;
  region?: string;       // Bedrock only
  endpoint?: string;     // OpenAI-compatible only
}

function getConfig(): LLMConfig {
  const provider = readPref("provider", "openai") as Provider;
  if (provider === "openai") {
    return {
      provider,
      apiKey: readPref("openai.apiKey", ""),
      modelId: readPref("openai.modelId", "gpt-4o"),
      endpoint: readPref("openai.endpoint", "https://api.openai.com/v1"),
    };
  }
  return {
    provider,
    apiKey: readPref("bedrock.apiKey", ""),
    modelId: readPref("bedrock.modelId", "us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
    region: readPref("bedrock.region", "us-east-1"),
  };
}
```

### 2. Unified Dispatcher

```typescript
async function callModel(
  systemPrompt: string,
  userText: string,
  image: string | null,  // base64 data URL or null
): Promise<string> {
  const config = getConfig();
  switch (config.provider) {
    case "openai": {
      const body = buildOpenAIBody(systemPrompt, userText, image, config.modelId);
      return callOpenAI(config.endpoint!, config.apiKey, body);
    }
    case "bedrock": {
      const body = buildBedrockBody(systemPrompt, userText, image);
      return callBedrock(config.region!, config.modelId, config.apiKey, body);
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

### 3. Image Fallback Pattern

```typescript
async function safeCallModel(system: string, user: string, image: string | null): Promise<string> {
  try {
    return await callModel(system, user, image);
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (image && (msg.includes("image") || msg.includes("Image") || msg.includes("vision"))) {
      // Model doesn't support images — retry without
      return await callModel(system, user, null);
    }
    throw e;
  }
}
```

### 4. Error Handling Pattern

```typescript
// Wrap HTTP errors to extract status + body from failed requests
try {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error (${response.status}): ${errText.substring(0, 500)}`);
  }
  return await response.json();
} catch (e: any) {
  // Some HTTP clients (e.g. Zotero.HTTP) throw with xmlhttp attached
  if (e?.xmlhttp) {
    throw new Error(`API error (${e.xmlhttp.status}): ${e.xmlhttp.responseText?.substring(0, 500)}`);
  }
  throw e;
}
```

## Provider References

- **OpenAI-compatible APIs** (OpenAI, DeepSeek, Ollama, Groq, etc.): See [references/openai-compatible.md](references/openai-compatible.md)
- **AWS Bedrock Converse API**: See [references/bedrock.md](references/bedrock.md)
- **Adding new providers** (Google Gemini, Anthropic direct, etc.): See [references/adding-providers.md](references/adding-providers.md)

## Configuration Schema

Each provider needs these preference keys:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `provider` | string | `"openai"` | Active provider name |
| `openai.apiKey` | string | `""` | API key (Bearer token) |
| `openai.modelId` | string | `"gpt-4o"` | Model identifier |
| `openai.endpoint` | string | `"https://api.openai.com/v1"` | Base URL |
| `bedrock.apiKey` | string | `""` | IAM token or API Gateway key |
| `bedrock.modelId` | string | `"us.anthropic.claude-sonnet-4-5-20250929-v1:0"` | Model ARN |
| `bedrock.region` | string | `"us-east-1"` | AWS region |

## Endpoint Normalization

Always normalize the endpoint URL before use:

```typescript
let url = endpoint.replace(/\/+$/, "");
if (!url.endsWith("/chat/completions")) {
  url += "/chat/completions";
}
```

This allows users to provide any of: `https://api.openai.com/v1`, `https://api.openai.com/v1/`, or `https://api.openai.com/v1/chat/completions`.

## Test Connection Pattern

Expose a lightweight test function for UI validation:

```typescript
async function testConnection(): Promise<string> {
  const result = await callModel(
    "You are a helpful assistant. Reply in one short sentence.",
    "Say hello and confirm you are working.",
    null,
  );
  return result;
}