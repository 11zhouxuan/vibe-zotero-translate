# OpenAI-Compatible API Reference

## Overview

The OpenAI Chat Completions API format is the de facto standard for LLM APIs. Many providers implement this same interface, making it the most portable choice.

## Compatible Providers

| Provider | Default Endpoint | Notes |
|----------|-----------------|-------|
| OpenAI | `https://api.openai.com/v1` | Original API |
| Azure OpenAI | `https://{resource}.openai.azure.com/openai/deployments/{deployment}` | Requires `api-version` query param |
| DeepSeek | `https://api.deepseek.com/v1` | Full compatibility |
| Ollama | `http://localhost:11434/v1` | Local models, no API key needed |
| vLLM | `http://localhost:8000/v1` | Self-hosted serving |
| Together AI | `https://api.together.xyz/v1` | Hosted open-source models |
| Groq | `https://api.groq.com/openai/v1` | Ultra-fast inference |
| Mistral | `https://api.mistral.ai/v1` | Mistral models |
| OpenRouter | `https://openrouter.ai/api/v1` | Multi-provider gateway |
| LM Studio | `http://localhost:1234/v1` | Local GUI + server |

## Configuration

```typescript
interface OpenAIConfig {
  apiKey: string;    // Bearer token; empty string for local providers (Ollama, LM Studio)
  modelId: string;   // e.g. "gpt-4o", "deepseek-chat", "llama3.1:8b"
  endpoint: string;  // Base URL, e.g. "https://api.openai.com/v1"
}
```

## Request Format

```typescript
function buildOpenAIBody(
  systemPrompt: string,
  userText: string,
  imageBase64DataUrl: string | null, // "data:image/png;base64,..."
  modelId: string,
): Record<string, unknown> {
  const userContent: Array<Record<string, unknown>> = [
    { type: "text", text: userText },
  ];

  if (imageBase64DataUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: imageBase64DataUrl },
    });
  }

  return {
    model: modelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  };
}
```

## HTTP Call

```typescript
async function callOpenAI(
  endpoint: string,
  apiKey: string,
  requestBody: Record<string, unknown>,
): Promise<string> {
  // Normalize endpoint
  let url = endpoint.replace(/\/+$/, "");
  if (!url.endsWith("/chat/completions")) {
    url += "/chat/completions";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errText.substring(0, 500)}`);
  }

  const data = await response.json();

  if (data?.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }

  throw new Error("Unexpected OpenAI response: " + JSON.stringify(data));
}
```

## Response Format

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The translated text here"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150
  }
}
```

## Provider-Specific Notes

### Azure OpenAI
- Endpoint format: `https://{resource}.openai.azure.com/openai/deployments/{deployment}`
- Append `?api-version=2024-02-01` to URL
- Use `api-key` header instead of `Authorization: Bearer`

### Ollama / LM Studio
- No API key required (pass empty string)
- Models referenced by local name (e.g. `llama3.1:8b`)
- Ensure server is running before calling

### Streaming (Optional)
Add `"stream": true` to request body. Response becomes SSE with `data: {...}` lines. Parse each chunk's `choices[0].delta.content` and concatenate.