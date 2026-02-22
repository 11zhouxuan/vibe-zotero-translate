/**
 * LLM Service - Supports Bedrock Converse API and OpenAI-compatible APIs.
 * Uses Zotero.HTTP.request() for all HTTP calls.
 * No SDK dependencies.
 */

import { debug } from "./debug";

const PREF_PREFIX = "extensions.vibe-zotero-translate";

export interface TranslationInput {
  text: string;
  pageScreenshot: string | null;
  pageNumber: number | null;
}

function getStringPref(key: string, defaultValue: string): string {
  try {
    const val = Zotero.Prefs.get(`${PREF_PREFIX}.${key}`, true) as string;
    if (val && val.trim().length > 0) return val.trim();
  } catch (e) {
    // preference not set
  }
  return defaultValue;
}

function isSingleWord(text: string): boolean {
  const trimmed = text.trim();
  return (
    !trimmed.includes(" ") &&
    !trimmed.includes("\n") &&
    !trimmed.includes("\t")
  );
}

type Provider = "bedrock" | "openai";

function getConfig() {
  const provider = getStringPref("provider", "bedrock") as Provider;

  if (provider === "openai") {
    const apiKey = getStringPref("openai.apiKey", "");
    const modelId = getStringPref("openai.modelId", "gpt-4o");
    const endpoint = getStringPref("openai.endpoint", "https://api.openai.com/v1/chat/completions");

    if (!apiKey) {
      throw new Error("OpenAI API key not configured. Please set it in Vibe Translate preferences.");
    }

    return { provider, apiKey, modelId, region: "", openaiEndpoint: endpoint };
  } else {
    const apiKey = getStringPref("bedrock.apiKey", "");
    const modelId = getStringPref("bedrock.modelId", "us.anthropic.claude-sonnet-4-5-20250929-v1:0");
    const region = getStringPref("bedrock.region", "us-east-1");

    if (!apiKey) {
      throw new Error("Bedrock API key not configured. Please set it in Vibe Translate preferences.");
    }

    return { provider, apiKey, modelId, region, openaiEndpoint: "" };
  }
}

// ============ Prompt Building ============

function buildSystemPrompt(
  targetLanguage: string,
  singleWord: boolean,
  hasScreenshot: boolean,
): string {
  const contextNote = hasScreenshot ? "\nA screenshot of the current PDF page is provided for context. Use it to improve translation accuracy for domain-specific terms." : "";

  if (singleWord) {
    return `You are an expert academic dictionary and translator. Translate the word to ${targetLanguage}.${contextNote}

Output in this EXACT format (use 【】markers):

【单词】 {the word}  【音标】 英 [British IPA] | 美 [American IPA]
【释义】
1. {part of speech}. {meaning in ${targetLanguage}}
2. {part of speech}. {meaning in ${targetLanguage}}
【例句】
• EN: {example sentence in English}
• ${targetLanguage}: {example sentence translated}
${hasScreenshot ? "📌 {contextual meaning in this paper}" : ""}

Example for "elaborate":
【单词】 elaborate  【音标】 英 [ɪˈlæbərət] | 美 [ɪˈlæbərət]
【释义】
1. adj. 复杂的；详尽的；精心制作的
2. v. 详细说明；阐述
【例句】
• EN: He refused to elaborate on why he had resigned.
• 简体中文: 他拒绝详细说明辞职的原因。`;
  }

  return `You are an expert academic translator. Translate the text to ${targetLanguage}.${contextNote}

Output in this EXACT format (use 【】markers):

【精准翻译】 {accurate translation into ${targetLanguage}}
【核心句式】
1. {grammar pattern}: {explanation in ${targetLanguage}}
2. {grammar pattern}: {explanation in ${targetLanguage}}
【重点词汇】
1. {word} ({part of speech}): {meaning in ${targetLanguage}}
2. {word} ({part of speech}): {meaning in ${targetLanguage}}

Example for "It is not how much we have, but how much we enjoy, that makes happiness.":
【精准翻译】 决定幸福的不是我们拥有多少，而是我们享受多少。
【核心句式】
1. It is... that...: 强调句型。用于强调句子的某一部分（此处强调是由什么造就了幸福）。
2. not..., but...: 连词结构。表示"不是……而是……"，连接两个并列成分，表示逻辑上的取舍。
【重点词汇】
1. enjoy (v.): 享受；欣赏
2. happiness (n.): 幸福；快乐`;
}

// ============ Bedrock Converse API ============

function buildBedrockBody(
  systemPrompt: string,
  userText: string,
  pageScreenshot: string | null,
): any {
  const userContent: any[] = [{ text: userText }];

  if (pageScreenshot) {
    debug(`pageScreenshot provided, length=${pageScreenshot.length}`);
    const dataUrlMatch = pageScreenshot.match(
      /^data:(image\/\w+);base64,(.+)$/,
    );
    if (dataUrlMatch) {
      const format = dataUrlMatch[1].split("/")[1];
      const base64Data = dataUrlMatch[2];
      debug(`Image format: ${format}, base64 length: ${base64Data.length}`);
      userContent.push({
        image: {
          format: format,
          source: { bytes: base64Data },
        },
      });
      debug(`Image added to Bedrock message (${userContent.length} parts)`);
    }
  } else {
    debug("No pageScreenshot for Bedrock");
  }

  return {
    system: [{ text: systemPrompt }],
    messages: [{ role: "user", content: userContent }],
    inferenceConfig: { maxTokens: 4096, temperature: 0.1 },
  };
}

async function callBedrock(
  modelId: string,
  requestBody: any,
): Promise<string> {
  const { apiKey, region } = getConfig();

  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
  const body = JSON.stringify(requestBody);

  debug(`Bedrock URL: ${url}`);
  debug(`Request body length: ${body.length}`);

  let xhr: any;
  try {
    xhr = await Zotero.HTTP.request("POST", url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      responseType: "text",
    });
  } catch (e: any) {
    if (e && e.xmlhttp) {
      const status = e.xmlhttp.status;
      const responseText = e.xmlhttp.responseText || "";
      debug(`Bedrock HTTP error: status=${status}`);
      debug(`Bedrock error response: ${responseText.substring(0, 500)}`);
      throw new Error(`Bedrock API error (${status}): ${responseText.substring(0, 500)}`);
    }
    throw new Error(`HTTP request failed: ${e.message || String(e)}`);
  }

  if (xhr.status !== 200) {
    const errText = xhr.responseText || xhr.response || "";
    throw new Error(`Bedrock API error (${xhr.status}): ${String(errText).substring(0, 500)}`);
  }

  const response = typeof xhr.response === "string" ? JSON.parse(xhr.response) : xhr.response;
  debug("Bedrock response received");

  if (response?.output?.message?.content) {
    return response.output.message.content
      .filter((part: any) => part.text)
      .map((part: any) => part.text)
      .join("\n");
  }

  throw new Error("Unexpected Bedrock response: " + JSON.stringify(response));
}

// ============ OpenAI-Compatible API ============

function buildOpenAIBody(
  systemPrompt: string,
  userText: string,
  pageScreenshot: string | null,
  modelId: string,
): any {
  const userContent: any[] = [{ type: "text", text: userText }];

  if (pageScreenshot) {
    debug(`pageScreenshot provided for OpenAI, length=${pageScreenshot.length}`);
    userContent.push({
      type: "image_url",
      image_url: { url: pageScreenshot },
    });
    debug(`Image added to OpenAI message (${userContent.length} parts)`);
  } else {
    debug("No pageScreenshot for OpenAI");
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

async function callOpenAI(
  modelId: string,
  requestBody: any,
): Promise<string> {
  const { apiKey, openaiEndpoint } = getConfig();

  // Normalize endpoint - remove trailing slash, append /chat/completions if not present
  let url = openaiEndpoint.replace(/\/+$/, "");
  if (!url.endsWith("/chat/completions")) {
    url += "/chat/completions";
  }

  const body = JSON.stringify(requestBody);

  debug(`OpenAI URL: ${url}`);
  debug(`Request body length: ${body.length}`);

  let xhr: any;
  try {
    xhr = await Zotero.HTTP.request("POST", url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      responseType: "text",
    });
  } catch (e: any) {
    if (e && e.xmlhttp) {
      const status = e.xmlhttp.status;
      const responseText = e.xmlhttp.responseText || "";
      debug(`OpenAI HTTP error: status=${status}`);
      debug(`OpenAI error response: ${responseText.substring(0, 500)}`);
      throw new Error(`OpenAI API error (${status}): ${responseText.substring(0, 500)}`);
    }
    throw new Error(`HTTP request failed: ${e.message || String(e)}`);
  }

  if (xhr.status !== 200) {
    const errText = xhr.responseText || xhr.response || "";
    throw new Error(`OpenAI API error (${xhr.status}): ${String(errText).substring(0, 500)}`);
  }

  const response = typeof xhr.response === "string" ? JSON.parse(xhr.response) : xhr.response;
  debug("OpenAI response received");

  if (response?.choices?.[0]?.message?.content) {
    return response.choices[0].message.content;
  }

  throw new Error("Unexpected OpenAI response: " + JSON.stringify(response));
}

// ============ Unified Translation ============

async function callModel(
  systemPrompt: string,
  userText: string,
  pageScreenshot: string | null,
): Promise<string> {
  const { provider, modelId } = getConfig();

  if (provider === "openai") {
    const requestBody = buildOpenAIBody(systemPrompt, userText, pageScreenshot, modelId);
    return callOpenAI(modelId, requestBody);
  } else {
    const requestBody = buildBedrockBody(systemPrompt, userText, pageScreenshot);
    return callBedrock(modelId, requestBody);
  }
}

export async function translateText(input: TranslationInput): Promise<string> {
  const targetLanguage = getStringPref("targetLanguage", "zh-CN");
  const singleWord = isSingleWord(input.text);
  const hasScreenshot = !!input.pageScreenshot;
  const { provider, modelId } = getConfig();

  debug(
    `translateText: provider=${provider}, targetLanguage=${targetLanguage}, singleWord=${singleWord}, hasScreenshot=${hasScreenshot}, model=${modelId}`,
  );

  const systemPrompt = buildSystemPrompt(targetLanguage, singleWord, hasScreenshot);
  const userText = singleWord ? `Word: ${input.text}` : `Text: ${input.text}`;

  debug("Invoking model...");
  try {
    const result = await callModel(
      systemPrompt,
      userText,
      hasScreenshot ? input.pageScreenshot : null,
    );
    debug("Model response received");
    return result.trim();
  } catch (e: any) {
    // If the model doesn't support images, retry without the screenshot
    const errMsg = e?.message || String(e);
    if (hasScreenshot && (errMsg.includes("image") || errMsg.includes("Image"))) {
      debug("Model may not support images, retrying without screenshot...");
      const fallbackPrompt = buildSystemPrompt(targetLanguage, singleWord, false);
      const result = await callModel(fallbackPrompt, userText, null);
      debug("Fallback (no image) response received");
      return result.trim();
    }
    throw e;
  }
}

export async function testConnection(): Promise<string> {
  debug("testConnection: starting...");
  const { provider, modelId } = getConfig();
  debug(`testConnection: provider=${provider}, model=${modelId}`);

  const systemPrompt = "You are a helpful assistant. Reply in one short sentence.";
  const userText = "Say hello and confirm you are working.";

  const result = await callModel(systemPrompt, userText, null);
  debug("testConnection: response received");
  return result;
}