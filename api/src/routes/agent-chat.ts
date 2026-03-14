import { Hono } from "hono";
import type { Bindings, DealRow, AgentChatConfig } from "../types";

// ===== 에이전트 레지스트리 =====
// 새 에이전트 추가 시 여기에 등록

const GAMJA_PROMPT = `너는 "감자"야. 저렴한 물건 전문 쇼핑 에이전트.

## 성격
- 친근한 반말, 짧고 직설적
- "ㅋㅋ", "ㅇㅋ", "ㄹㅇ", "개~" 같은 자연스러운 말투
- 이모지 적당히 사용
- 무조건 가성비 관점으로 분석

## 대화 규칙
1. 상품 종류만 알면 바로 검색해. 용도나 예산은 보너스.
2. 정보가 애매하면 딱 1개만 짧게 질문해.
3. 검색할 때는 반드시 이 형식으로:
[SEARCH]{"keywords":["키워드1","키워드2"],"minPrice":0,"maxPrice":0}[/SEARCH]
- maxPrice가 0이면 상한 없음
- minPrice가 0이면 하한 없음
- keywords는 검색에 쓸 핵심 단어들

**중요: minPrice를 꼭 설정해서 액세서리/소품이 아닌 본품이 나오게 해!**
예시:
- 노트북 → minPrice: 200000 (노트북 본체는 최소 20만원)
- 이어폰 → minPrice: 5000
- 키보드 → minPrice: 10000
- 모니터 → minPrice: 50000
- 핸드폰/스마트폰 → minPrice: 100000

4. 검색 결과가 주어지면:
- 유저가 원하는 **본품**만 골라서 3개 이내 추천 (액세서리/케이스/커버 제외!)
- 각 상품에 대해 한마디 코멘트 (가성비 분석)
- 추천 형식:
[RECOMMEND]
[{"dealIndex":0,"comment":"이 가격에 이 스펙이면 개이득"},{"dealIndex":2,"comment":"브랜드 치고 ㄹㅇ 싸다"}]
[/RECOMMEND]
- dealIndex는 주어진 상품 목록의 인덱스 (0부터)

5. 추천 후에도 대화 계속 가능. "더 싼 거", "다른 브랜드" 등 요청하면 다시 검색.

## 추천 후 선택지
추천할 때 항상 선택지도 제공:
[OPTIONS]더 싼 거|다른 브랜드|비슷한 거 더[/OPTIONS]

## 예시
유저: "노트북 추천해줘"
감자: "ㅇㅋ 노트북! 찾아볼게 🥔"
[SEARCH]{"keywords":["노트북"],"minPrice":200000,"maxPrice":0}[/SEARCH]

(검색 결과 받은 후)
감자: "이 3개 봐봐! 가격순으로 골랐어 ㅋㅋ"
[RECOMMEND][{"dealIndex":0,"comment":"이 가격에 i5면 가성비 끝판왕"},{"dealIndex":1,"comment":"좀 더 비싸지만 SSD 용량이 큼"}][/RECOMMEND]
[OPTIONS]더 싼 거|다른 브랜드|비슷한 거 더[/OPTIONS]`;

const CHIP_PROMPT = `너는 "칩"이야. 노트북 전문 쇼핑 에이전트.

## 성격
- 노트북 사양 분석 전문가, 트렌드 파악
- 반말이지만 전문적, 체계적이고 상세한 분석
- "~인데", "스펙 보면", "이건 좀 아쉬운 게" 같은 분석적 표현
- CPU/GPU 사양에 진심인 노트북 너드

## 대화 규칙
1. 용도를 먼저 파악해 (코딩, 게임, 영상편집, 사무용, 대학생 등)
2. 정보가 애매하면 딱 1개만 짧게 질문해.
3. 검색할 때는 반드시 이 형식으로:
[SEARCH]{"keywords":["노트북","키워드"],"minPrice":200000,"maxPrice":0}[/SEARCH]
- keywords에 "노트북"은 항상 포함
- maxPrice가 0이면 상한 없음
- 용도에 맞는 키워드 추가 (예: "게이밍", "사무용", "가벼운")

4. 검색 결과가 주어지면:
- 노트북 본품만 골라서 3개 이내 추천 (파우치/거치대/액세서리 제외!)
- 각 상품에 대해 **사양 상세 분석** 코멘트:
  - CPU 세대/모델, RAM 용량, SSD 용량, 디스플레이 크기/해상도, 무게
  - 용도 대비 적합도 평가
  - 가격 대비 가치 분석, 할인 정보
- 추천 형식:
[RECOMMEND]
[{"dealIndex":0,"comment":"i5-13세대에 16GB면 코딩용으로 충분한데, SSD가 256GB라 좀 아쉬움"},{"dealIndex":2,"comment":"스펙 보면 이 가격대에서 디스플레이가 제일 좋음"}]
[/RECOMMEND]
- dealIndex는 주어진 상품 목록의 인덱스 (0부터)

5. 추천 후에도 대화 계속 가능. "더 가벼운 거", "게이밍으로", "예산 늘리면" 등 요청하면 다시 검색.

## 추천 후 선택지
추천할 때 항상 선택지도 제공:
[OPTIONS]더 가벼운 거|게이밍 노트북|예산 늘리면?|비슷한 거 더[/OPTIONS]

## 예시
유저: "코딩용 노트북 추천해줘"
칩: "코딩용이면 CPU랑 RAM이 중요한데, 예산은 어느 정도야? 일단 찾아볼게 💻"
[SEARCH]{"keywords":["노트북","코딩"],"minPrice":200000,"maxPrice":0}[/SEARCH]

(검색 결과 받은 후)
칩: "이 3개 스펙 비교해봤는데"
[RECOMMEND][{"dealIndex":0,"comment":"i5-13세대 16GB인데 이 가격이면 가성비 좋음. SSD 512GB라 개발 환경 넉넉"},{"dealIndex":1,"comment":"스펙 보면 RAM 8GB라 좀 아쉬운 게, IDE 여러 개 띄우면 버벅일 수 있음"}][/RECOMMEND]
[OPTIONS]더 가벼운 거|게이밍 노트북|예산 늘리면?|비슷한 거 더[/OPTIONS]`;

export const AGENTS: Record<string, AgentChatConfig> = {
  gamja: {
    name: "감자",
    icon: "🥔",
    description: "싼 거 전문! 가성비 끝판왕",
    systemPrompt: GAMJA_PROMPT,
    searchSort: "sale_price ASC",
    searchLimit: 20,
    greeting: "안녕! 나 감자 🥔 싼 거 전문이야 ㅋㅋ 뭐 찾아?",
  },
  chip: {
    name: "칩",
    icon: "💻",
    description: "노트북 전문가! 사양·트렌드·할인 다 알려줌",
    systemPrompt: CHIP_PROMPT,
    searchSort: "sale_price ASC",
    searchLimit: 20,
    greeting: "안녕! 나 칩 💻 노트북이면 나한테 물어봐. 용도가 뭐야?",
  },
};

// ===== Gemini 호출 헬퍼 =====

interface GeminiResponse {
  error?: { message: string };
  candidates?: { content: { parts: { text: string }[] } }[];
}

async function callGemini(
  systemPrompt: string,
  messages: { role: string; parts: { text: string }[] }[],
  apiKey: string,
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    },
  );
  const data: GeminiResponse = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ===== DB 검색 =====

async function searchDeals(
  db: D1Database,
  keywords: string[],
  minPrice: number,
  maxPrice: number,
  sort: string,
  limit: number,
): Promise<DealRow[]> {
  // Build WHERE clause from keywords
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (keywords.length > 0) {
    const keywordConditions = keywords.map(() => "title LIKE ?");
    conditions.push(`(${keywordConditions.join(" OR ")})`);
    for (const kw of keywords) {
      params.push(`%${kw}%`);
    }
  }

  if (minPrice > 0 && maxPrice > 0) {
    conditions.push("sale_price >= ? AND sale_price <= ?");
    params.push(minPrice, maxPrice);
  } else if (minPrice > 0) {
    conditions.push("sale_price >= ?");
    params.push(minPrice);
  } else if (maxPrice > 0) {
    conditions.push("sale_price > 0 AND sale_price <= ?");
    params.push(maxPrice);
  } else {
    conditions.push("sale_price > 0");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM deals ${where} ORDER BY ${sort} LIMIT ?`;
  params.push(limit);

  const result = await db.prepare(sql).bind(...params).all<DealRow>();
  return result.results || [];
}

// ===== 응답 파싱 =====

function parseAgentResponse(raw: string) {
  let reply = raw;
  let options: string[] = [];
  let searchQuery: { keywords: string[]; minPrice?: number; maxPrice: number } | null = null;
  let recommendations: { dealIndex: number; comment: string }[] | null = null;

  // [OPTIONS] 파싱
  const optMatch = reply.match(/\[OPTIONS\]([\s\S]*?)\[\/OPTIONS\]/);
  if (optMatch) {
    options = optMatch[1].trim().split("|").map(o => o.trim()).filter(Boolean);
    reply = reply.replace(/\[OPTIONS\][\s\S]*?\[\/OPTIONS\]/, "").trim();
  }

  // [SEARCH] 파싱
  const searchMatch = reply.match(/\[SEARCH\]([\s\S]*?)\[\/SEARCH\]/);
  if (searchMatch) {
    try {
      searchQuery = JSON.parse(searchMatch[1].trim());
    } catch { /* ignore parse error */ }
    reply = reply.replace(/\[SEARCH\][\s\S]*?\[\/SEARCH\]/, "").trim();
  }

  // [RECOMMEND] 파싱
  const recMatch = reply.match(/\[RECOMMEND\]([\s\S]*?)\[\/RECOMMEND\]/);
  if (recMatch) {
    try {
      recommendations = JSON.parse(recMatch[1].trim());
    } catch { /* ignore parse error */ }
    reply = reply.replace(/\[RECOMMEND\][\s\S]*?\[\/RECOMMEND\]/, "").trim();
  }

  return { reply, options, searchQuery, recommendations };
}

// ===== 라우트 =====

const app = new Hono<{ Bindings: Bindings }>();

app.post("/api/agent/chat", async (c) => {
  try {
    const body = await c.req.json() as {
      agent_id: string;
      messages: { role: string; text: string }[];
    };

    const { agent_id, messages } = body;
    if (!agent_id || !messages || messages.length === 0) {
      return c.json({ success: false, error: "agent_id and messages required" }, 400);
    }

    const agent = AGENTS[agent_id];
    if (!agent) {
      return c.json({ success: false, error: `Unknown agent: ${agent_id}` }, 400);
    }

    // Build Gemini messages (alternating user/model, start with user)
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

    // 1차 Gemini 호출
    const rawReply = await callGemini(agent.systemPrompt, geminiMessages, c.env.GEMINI_API_KEY);
    const parsed = parseAgentResponse(rawReply);

    // [SEARCH] 감지 시 → DB 검색 → 2차 Gemini 호출
    if (parsed.searchQuery) {
      const deals = await searchDeals(
        c.env.DB,
        parsed.searchQuery.keywords,
        parsed.searchQuery.minPrice || 0,
        parsed.searchQuery.maxPrice,
        agent.searchSort,
        agent.searchLimit,
      );

      if (deals.length === 0) {
        return c.json({
          success: true,
          reply: parsed.reply || "음... 그건 지금 DB에 없네 😅 다른 거 찾아볼까?",
          options: ["다른 키워드로", "비슷한 거"],
          recommendations: [],
        });
      }

      // 검색 결과를 감자에게 주입 → 2차 호출
      const dealList = deals.slice(0, 10).map((d, i) =>
        `[${i}] ${d.title} — ${d.sale_price > 0 ? d.sale_price.toLocaleString() + "원" : "가격미정"} (${d.source}, 할인${d.discount_rate || 0}%)`
      ).join("\n");

      const searchResultMsg = `검색 결과 (${deals.length}건, ${agent.searchSort} 정렬):\n${dealList}\n\n이 중에서 추천해줘. [RECOMMEND] 형식으로.`;

      // Add search result as a new user message for 2nd call
      const secondMessages = [
        ...geminiMessages,
        { role: "model" as const, parts: [{ text: parsed.reply || "찾아볼게!" }] },
        { role: "user" as const, parts: [{ text: searchResultMsg }] },
      ];

      const rawReply2 = await callGemini(agent.systemPrompt, secondMessages, c.env.GEMINI_API_KEY);
      const parsed2 = parseAgentResponse(rawReply2);

      // Build recommendations from parsed indices
      const recs = (parsed2.recommendations || []).slice(0, 5).map(r => {
        const deal = deals[r.dealIndex];
        if (!deal) return null;
        return { deal, comment: r.comment };
      }).filter(Boolean);

      // If no [RECOMMEND] parsed, pick top 3 cheapest as fallback
      const finalRecs = recs.length > 0 ? recs : deals.slice(0, 3).map(d => ({
        deal: d,
        comment: "",
      }));

      return c.json({
        success: true,
        reply: parsed2.reply || parsed.reply || "이거 봐봐!",
        options: parsed2.options.length > 0 ? parsed2.options : ["더 싼 거", "다른 브랜드", "비슷한 거 더"],
        recommendations: finalRecs,
      });
    }

    // [SEARCH] 없으면 대화 응답만
    return c.json({
      success: true,
      reply: parsed.reply,
      options: parsed.options,
      recommendations: [],
    });
  } catch (err) {
    console.error("agent-chat error:", err);
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});

// 에이전트 목록 조회 (프론트에서 카드 렌더링용)
app.get("/api/agent/list", (c) => {
  const list = Object.entries(AGENTS).map(([id, cfg]) => ({
    id,
    name: cfg.name,
    icon: cfg.icon,
    description: cfg.description,
    greeting: cfg.greeting,
  }));
  return c.json({ success: true, agents: list });
});

export default app;
