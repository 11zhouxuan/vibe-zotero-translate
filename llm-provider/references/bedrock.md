# AWS Bedrock Converse API Reference

## Overview

AWS Bedrock provides a unified Converse API that works across all supported foundation models (Anthropic Claude, Meta Llama, Amazon Titan, Mistral, etc.) with a single request format.

## Configuration

```typescript
interface BedrockConfig {
  apiKey: string;   // IAM access token or API Gateway key
  modelId: string;  // e.g. "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
  region: string;   // e.g. "us-east-1"
}
```

## Endpoint Format

```
https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse
```

The `modelId` must be URL-encoded via `encodeURIComponent()`.

## Request Format

```typescript
function buildBedrockBody(
  systemPrompt: string,
  userText: string,
  imageBase64: string | null, // raw base64 (no data URL prefix)
  imageFormat: string,        // "png", "jpeg", "webp", "gif"
): Record<string, unknown> {
  const userContent: Array<Record<string, unknown>> = [
    { text: userText },
  ];

  if (imageBase64) {
    userContent.push({
      image: {
        format: imageFormat,
        source: { bytes: imageBase64 },
      },
    });
  }

  return {
    system: [{ text: systemPrompt }],
    messages: [{ role: "user", content: userContent }],
    inferenceConfig: { maxTokens: 4096, temperature: 0.1 },
  };
}
```

### Image Handling

Bedrock expects raw base64 (not a data URL). Extract from data URL:

```typescript
const dataUrlMatch = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
if (dataUrlMatch) {
  const format = dataUrlMatch[1].split("/")[1]; // "png", "jpeg", etc.
  const base64Data = dataUrlMatch[2];
}
```

## HTTP Call

```typescript
async function callBedrock(
  region: string,
  modelId: string,
  apiKey: string,
  requestBody: Record<string, unknown>,
): Promise<string> {
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Bedrock API error (${response.status}): ${errText.substring(0, 500)}`);
  }

  const data = await response.json();

  if (data?.output?.message?.content) {
    return data.output.message.content
      .filter((part: any) => part.text)
      .map((part: any) => part.text)
      .join("\n");
  }

  throw new Error("Unexpected Bedrock response: " + JSON.stringify(data));
}
```

## Response Format

```json
{
  "output": {
    "message": {
      "role": "assistant",
      "content": [
        { "text": "The response text here" }
      ]
    }
  },
  "stopReason": "end_turn",
  "usage": {
    "inputTokens": 100,
    "outputTokens": 50,
    "totalTokens": 150
  }
}
```

## Authentication Options

1. **API Gateway + IAM** - Use `Authorization: Bearer {token}` with an API Gateway fronting Bedrock
2. **AWS SigV4** - Standard AWS request signing (requires AWS SDK or manual signing)
3. **IAM Roles** - When running on AWS infrastructure (EC2, Lambda, ECS), use instance roles

## Common Model IDs

| Model | ID |
|-------|-----|
| Claude Sonnet 4.5 | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| Claude Haiku 3.5 | `us.anthropic.claude-3-5-haiku-20241022-v1:0` |
| Llama 3.1 70B | `meta.llama3-1-70b-instruct-v1:0` |
| Mistral Large | `mistral.mistral-large-2407-v1:0` |
| Amazon Titan | `amazon.titan-text-premier-v1:0` |

## Key Differences from OpenAI

| Aspect | OpenAI | Bedrock |
|--------|--------|---------|
| System prompt | `messages[0].role = "system"` | Top-level `system` array |
| Image format | Data URL in `image_url.url` | Raw base64 in `image.source.bytes` |
| Response path | `choices[0].message.content` (string) | `output.message.content` (array of parts) |
| Model selection | `model` field in body | URL path parameter |
| Token config | `max_tokens` | `inferenceConfig.maxTokens` |