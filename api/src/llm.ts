// ===== LLM 추상화 레이어 (OpenClaw 패턴) =====
// 에이전트별 다른 모델 사용 가능

export type LLMApi = "gemini" | "openai";

export interface LLMProvider {
  api: LLMApi;
  baseUrl: string;
  model: string;
  apiKeyEnvVar: string; // Bindings에서 가져올 키 이름
}

export interface LLMMessage {
  role: "user" | "assistant";
  text: string;
}

// 기본 제공 프로바이더
export const PROVIDERS = {
  gemini_flash: {
    api: "gemini" as const,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.0-flash",
    apiKeyEnvVar: "GEMINI_API_KEY",
  },
  gemini_flash_lite: {
    api: "gemini" as const,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.0-flash-lite",
    apiKeyEnvVar: "GEMINI_API_KEY",
  },
} satisfies Record<string, LLMProvider>;

// Gemini 응답 타입
interface GeminiResponse {
  error?: { message: string };
  candidates?: { content: { parts: { text: string }[] } }[];
}

// OpenAI-compatible 응답 타입
interface OpenAIResponse {
  error?: { message: string };
  choices?: { message: { content: string } }[];
}

export async function callLLM(
  provider: LLMProvider,
  systemPrompt: string,
  messages: LLMMessage[],
  apiKey: string,
): Promise<string> {
  if (provider.api === "gemini") {
    return callGemini(provider, systemPrompt, messages, apiKey);
  }
  return callOpenAI(provider, systemPrompt, messages, apiKey);
}

async function callGemini(
  provider: LLMProvider,
  systemPrompt: string,
  messages: LLMMessage[],
  apiKey: string,
): Promise<string> {
  // Gemini 형식으로 변환 (alternating user/model)
  const geminiMsgs: { role: string; parts: { text: string }[] }[] = [];
  for (const m of messages) {
    const role = m.role === "user" ? "user" : "model";
    if (geminiMsgs.length > 0 && geminiMsgs[geminiMsgs.length - 1].role === role) {
      geminiMsgs[geminiMsgs.length - 1].parts[0].text += "\n" + m.text;
    } else {
      geminiMsgs.push({ role, parts: [{ text: m.text }] });
    }
  }
  if (geminiMsgs.length > 0 && geminiMsgs[0].role !== "user") {
    geminiMsgs.shift();
  }

  const res = await fetch(
    `${provider.baseUrl}/models/${provider.model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiMsgs,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    },
  );
  const data: GeminiResponse = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenAI(
  provider: LLMProvider,
  systemPrompt: string,
  messages: LLMMessage[],
  apiKey: string,
): Promise<string> {
  const openaiMsgs = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.text,
    })),
  ];

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: openaiMsgs,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });
  const data: OpenAIResponse = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data?.choices?.[0]?.message?.content || "";
}
