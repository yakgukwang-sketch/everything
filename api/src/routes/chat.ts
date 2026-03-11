import { Hono } from "hono";
import type { Bindings } from "../types";

const app = new Hono<{ Bindings: Bindings }>();

const CHAT_SYSTEM_PROMPT = `너는 만능 어시스턴트야. 소비자가 뭘 원하는지 자연스러운 대화로 파악해.

## 타입 자동 감지 (최우선)
음식/배달 키워드가 있으면 → type "delivery"
그 외 상품(노트북, 이어폰, 옷, 가구, 화장품 등)이면 → type "shopping"
**절대 "쇼핑이야 배달이야?" 같은 타입 질문을 하지 마.** 문맥에서 자동으로 판단해.

음식 키워드 예시: 제육볶음, 치킨, 피자, 족발, 보쌈, 떡볶이, 짜장면, 짬뽕, 탕수육, 삼겹살, 곱창, 냉면, 김밥, 돈까스, 초밥, 회, 햄버거, 분식, 라멘, 파스타, 볶음밥, 국밥, 설렁탕, 갈비, 만두, 커피, 중국집, 한식, 양식, 일식, 시켜, 배달, 주문, 먹고, 야식

정말 뭘 원하는지 아무 힌트도 없을 때만 (예: "안녕", "뭐 좋은 거 없어?") 뭘 찾는지 물어봐.

## 쇼핑 (type: shopping)
파악할 것: 상품 종류 (필수), 용도/조건, 예산
- **상품만 알면 바로 [READY] 가능.** 용도/예산은 있으면 좋지만 없어도 OK.
- "노트북 추천해줘" → 바로 [READY]
- "선물 뭐가 좋을까?" → 누구한테 줄 건지만 물어보고 → [READY]

[READY]
{"type":"shopping","product":"노트북","specs":{},"budget":"","keywords":["노트북"]}
[/READY]

## 배달 (type: delivery)
파악할 것 3가지: 음식, 지역+수량, 예산
3가지 모두 파악하면 즉시:
[READY]
{"type":"delivery","food":"제육볶음","area":"부천","quantity":"4인분","budget":"40000","keywords":["제육볶음"]}
[/READY]

## 공통 규칙
1. 한 번에 질문 하나만 해. 짧고 친근하게. 반말.
2. 매 질문마다 반드시 선택지를 제공해:
[OPTIONS]
선택지1|선택지2|선택지3
[/OPTIONS]
3. 선택지는 2~5개. 짧고 명확 (10자 이내).
4. 사용자가 "찾아줘", "됐어" 같이 대화를 끝내려 하면 있는 정보로 바로 [READY].
5. 정보가 대략적이라도 OK. 예: "2~3만원" → 예산 OK.
6. 조건이 갖춰지면 추가 질문 없이 즉시 [READY].

## 예시
유저: "노트북 추천해줘"
→ 바로 [READY]{"type":"shopping","product":"노트북","specs":{},"budget":"","keywords":["노트북","추천"]}[/READY]
"에이전트한테 물어볼게!"

유저: "이어폰 사고싶어"
→ 바로 [READY]{"type":"shopping","product":"이어폰","specs":{},"budget":"","keywords":["이어폰"]}[/READY]

유저: "치킨 2마리 시켜줘"
→ "어디로 배달할까?"
유저: "부천"
→ [READY]{"type":"delivery","food":"치킨","area":"부천","quantity":"2마리","budget":"40000","keywords":["치킨"]}[/READY]`;

const FOOD_KEYWORDS = ["제육", "치킨", "피자", "족발", "보쌈", "떡볶이", "짜장", "짬뽕", "탕수육", "삼겹살", "곱창", "냉면", "김밥", "돈까스", "초밥", "회", "햄버거", "분식", "라멘", "파스타", "볶음밥", "국밥", "설렁탕", "갈비", "만두", "커피", "중국집", "한식", "양식", "일식"];
const AREA_KEYWORDS = ["강남", "강북", "강서", "강동", "송파", "마포", "종로", "서초", "관악", "영등포", "구로", "동대문", "성북", "노원", "은평", "도봉", "중랑", "광진", "동작", "양천", "용산", "부천", "인천", "서울", "수원", "성남", "안양", "고양", "용인", "화성", "시흥", "광명", "김포", "의정부", "파주", "일산", "분당", "판교", "동탄"];

app.post("/api/chat", async (c) => {
  try {
    const { messages } = await c.req.json() as { messages: { role: string; text: string }[] };

    if (!messages || messages.length === 0) {
      return c.json({ success: false, error: "messages required" }, 400);
    }

    // Gemini requires alternating user/model and must start with user
    const geminiMessages: { role: string; parts: { text: string }[] }[] = [];
    for (const m of messages) {
      const role = m.role === "user" ? "user" : "model";
      if (geminiMessages.length > 0 && geminiMessages[geminiMessages.length - 1].role === role) {
        geminiMessages[geminiMessages.length - 1].parts[0].text += "\n" + m.text;
      } else {
        geminiMessages.push({ role, parts: [{ text: m.text }] });
      }
    }

    if (geminiMessages.length > 0 && geminiMessages[0].role !== "user") {
      geminiMessages.shift();
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${c.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: CHAT_SYSTEM_PROMPT }] },
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!res.ok) {
      return c.json({ success: false, error: `Gemini API HTTP ${res.status}` }, 502);
    }

    interface GeminiResponse {
      error?: { message: string };
      candidates?: { content: { parts: { text: string }[] } }[];
    }
    const data: GeminiResponse = await res.json();

    if (data.error) {
      return c.json({ success: false, error: data.error.message || "Gemini API error" }, 502);
    }

    let reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // [OPTIONS] 블록 파싱
    let options: string[] = [];
    const optionsMatch = reply.match(/\[OPTIONS\]([\s\S]*?)\[\/OPTIONS\]/);
    if (optionsMatch) {
      options = optionsMatch[1].trim().split("|").map((o: string) => o.trim()).filter(Boolean);
      reply = reply.replace(/\[OPTIONS\][\s\S]*?\[\/OPTIONS\]/, "").trim();
    }

    // [READY] 블록 감지
    const readyMatch = reply.match(/\[READY\]([\s\S]*?)\[\/READY\]/);
    if (readyMatch) {
      try {
        const parsed = JSON.parse(readyMatch[1].trim());
        return c.json({
          success: true,
          reply: reply.replace(/\[READY\][\s\S]*?\[\/READY\]/, "").trim(),
          ready: true,
          query: parsed,
          options,
        });
      } catch {
        return c.json({ success: true, reply, ready: false, options });
      }
    }

    // Fallback: 대화가 5턴(유저 3회) 이상인데 READY가 안 나오면 자동 추출
    const userMsgs = messages.filter((m: { role: string; text: string }) => m.role === "user");
    if (userMsgs.length >= 3 && !readyMatch) {
      const allUserText = userMsgs.map((m: { role: string; text: string }) => m.text).join(" ");
      const budgetMatch = allUserText.match(/(\d+)\s*만\s*원|(\d{4,})\s*원/);
      const budget = budgetMatch ? (budgetMatch[1] ? budgetMatch[1] + "0000" : budgetMatch[2]) : "";
      const keywords = allUserText.split(/[\s,|]+/).filter((w: string) => w.length >= 2 && !/^(나|네|응|좋|음|걍|그냥|뭐|이|그|저)$/.test(w));

      const isFood = FOOD_KEYWORDS.some(f => allUserText.includes(f));
      const detectedArea = AREA_KEYWORDS.find(a => allUserText.includes(a)) || "";
      const quantityMatch = allUserText.match(/(\d+)\s*(인분|그릇|마리|판|개)/);

      if (isFood && detectedArea && (budget || quantityMatch)) {
        const food = FOOD_KEYWORDS.find(f => allUserText.includes(f)) || keywords[0];
        return c.json({
          success: true,
          reply,
          ready: true,
          query: {
            type: "delivery",
            food,
            area: detectedArea || "부천",
            quantity: quantityMatch ? quantityMatch[0] : "1인분",
            budget: budget || "30000",
            keywords: keywords.slice(0, 5),
          },
          options,
        });
      }

      if (budget && keywords.length >= 2) {
        return c.json({
          success: true,
          reply,
          ready: true,
          query: {
            type: "shopping",
            product: keywords.slice(0, 3).join(" "),
            specs: {},
            budget,
            keywords: keywords.slice(0, 5),
          },
          options,
        });
      }
    }

    return c.json({ success: true, reply, ready: false, options });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

export default app;
