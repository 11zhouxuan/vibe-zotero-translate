# Adding New LLM Providers

## Steps to Add a Provider

### 1. Extend the Provider Type

```typescript
type Provider = "bedrock" | "openai" | "google" | "anthropic";
```

### 2. Add Configuration

```typescript
// Add to config interface
interface GoogleConfig {
  apiKey: string;
  modelId: string;  // e.g. "gemini-2.0-flash"
}

// Add to getConfig()
if (provider === "google") {
  return {
    provider,
    apiKey: getStringPref("google.apiKey", ""),
    modelId: getStringPref("google.modelId", "gemini-2.0-flash"),
  };
}
```

### 3. Implement Request Builder

Build the provider-specific request body. Follow the pattern:

```typescript
function buildGoogleBody(
  systemPrompt: string,
  userText: string,
  imageBase64: string | null,
  modelId: string,
): Record<string, unknown> {
  // Provider-specific body construction
}
```

### 4. Implement HTTP Caller

```typescript
async function callGoogle(
  config: GoogleConfig,
  requestBody: Record<string, unknown>,
): Promise<string> {
  // Provider-specific HTTP call + response parsing
}
```

### 5. Register in Unified Dispatcher

```typescript
async function callModel(systemPrompt, userText, image): Promise<string> {
  const config = getConfig();
  switch (config.provider) {
    case "openai":  return callOpenAI(/* ... */);
    case "bedrock": return callBedrock(/* ... */);
    case "google":  return callGoogle(/* ... */);  // new
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

## Google Gemini Example

### Endpoint
```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
```

### Request
```json
{
  "system_instruction": { "parts": [{ "text": "system prompt" }] },
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "user message" },
        { "inline_data": { "mime_type": "image/png", "data": "<base64>" } }
      ]
    }
  ],
  "generationConfig": { "maxOutputTokens": 4096, "temperature": 0.1 }
}
```

### Response
```json
{
  "candidates": [
    {
      "content": {
        "parts": [{ "text": "response text" }],
        "role": "model"
      }
    }
  ]
}
```

### Extract: `data.candidates[0].content.parts.map(p => p.text).join("\n")`

## Anthropic Direct API Example

### Endpoint
```
POST https://api.anthropic.com/v1/messages
```

### Headers
```
x-api-key: {apiKey}
anthropic-version: 2023-06-01
Content-Type: application/json
```

### Request
```json
{
  "model": "claude-sonnet-4-5-20250514",
  "max_tokens": 4096,
  "system": "system prompt",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "user message" },
        {
          "type": "image",
          "source": { "type": "base64", "media_type": "image/png", "data": "<base64>" }
        }
      ]
    }
  ]
}
```

### Response
```json
{
  "content": [{ "type": "text", "text": "response text" }],
  "stop_reason": "end_turn"
}
```

### Extract: `data.content.filter(p => p.type === "text").map(p => p.text).join("\n")`

## Checklist for New Provider

- [ ] Define config interface (apiKey, modelId, endpoint/region)
- [ ] Add provider to union type
- [ ] Implement `getConfig()` branch
- [ ] Implement `buildXxxBody()` with multimodal support
- [ ] Implement `callXxx()` with error handling
- [ ] Register in `callModel()` dispatcher
- [ ] Add image fallback (retry without image on error)
- [ ] Add preference keys to config/types
- [ ] Add UI controls to preferences panel