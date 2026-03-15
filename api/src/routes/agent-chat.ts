import { Hono } from "hono";
import type { Bindings, DealRow, AgentChatConfig } from "../types";
import { callLLM, PROVIDERS, type LLMProvider, type LLMMessage } from "../llm";

// ===== 패턴 2: 스킬 마크다운 임포트 (OpenClaw SKILL.md 패턴) =====
import gamjaSkill from "../skills/gamja.md";
import chipSkill from "../skills/chip.md";

// ===== 스킬 MD 파서 =====

interface SkillMeta {
  id: string;
  name: string;
  icon: string;
  description: string;
  greeting: string;
  searchSort: string;
  searchLimit: number;
  provider: string;
  systemPrompt: string;
}

function parseSkillMd(raw: string): SkillMeta {
  const normalized = raw.replace(/\r\n/g, "\n");
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error("Invalid skill markdown: no frontmatter");

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  const get = (key: string, fallback = ""): string => {
    const m = frontmatter.match(new RegExp(`^${key}:\\s*"?(.+?)"?\\s*$`, "m"));
    return m ? m[1] : fallback;
  };

  return {
    id: get("id"),
    name: get("name"),
    icon: get("icon"),
    description: get("description"),
    greeting: get("greeting"),
    searchSort: get("searchSort", "sale_price ASC"),
    searchLimit: parseInt(get("searchLimit", "20")) || 20,
    provider: get("provider", "gemini_flash"),
    systemPrompt: body,
  };
}

// ===== 스킬 → 에이전트 레지스트리 자동 생성 =====

function skillToAgent(skill: SkillMeta): AgentChatConfig & { provider: LLMProvider } {
  const provider = PROVIDERS[skill.provider as keyof typeof PROVIDERS] || PROVIDERS.gemini_flash;
  return {
    name: skill.name,
    icon: skill.icon,
    description: skill.description,
    systemPrompt: skill.systemPrompt,
    searchSort: skill.searchSort,
    searchLimit: skill.searchLimit,
    greeting: skill.greeting,
    provider,
  };
}

const SKILL_FILES = [gamjaSkill, chipSkill];
const AGENTS: Record<string, AgentChatConfig & { provider: LLMProvider }> = {};

for (const raw of SKILL_FILES) {
  const skill = parseSkillMd(raw);
  AGENTS[skill.id] = skillToAgent(skill);
}

// ===== 패턴 3: 시간 감쇠 랭킹 (OpenClaw temporal decay) =====
// score × e^(-ln(2)/30 × 일수) — 30일 반감기

function applyTimeDecay(deals: DealRow[]): DealRow[] {
  const now = Date.now();
  return deals
    .map(d => {
      const postedAt = new Date(d.posted_at || d.created_at).getTime();
      const ageDays = (now - postedAt) / (1000 * 60 * 60 * 24);
      const decay = Math.exp(-Math.LN2 / 30 * ageDays);
      const bizBoost = d.source.startsWith("biz:") ? 1.5 : 1.0;
      return { deal: d, score: decay * bizBoost };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.deal);
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
  // 시간 감쇠 적용 위해 넉넉히 가져옴
  const fetchLimit = limit * 3;
  const sql = `SELECT * FROM deals ${where} ORDER BY ${sort} LIMIT ?`;
  params.push(fetchLimit);

  const result = await db.prepare(sql).bind(...params).all<DealRow>();
  const raw = result.results || [];

  // 패턴 3: 시간 감쇠 적용 후 limit
  return applyTimeDecay(raw).slice(0, limit);
}

// ===== 응답 파싱 =====

function parseAgentResponse(raw: string) {
  let reply = raw;
  let options: string[] = [];
  let searchQuery: { keywords: string[]; minPrice?: number; maxPrice: number } | null = null;
  let recommendations: { dealIndex: number; comment: string }[] | null = null;
  let media: { type: string; [key: string]: unknown }[] | null = null;

  const optMatch = reply.match(/\[OPTIONS\]([\s\S]*?)\[\/OPTIONS\]/);
  if (optMatch) {
    options = optMatch[1].trim().split("|").map(o => o.trim()).filter(Boolean);
    reply = reply.replace(/\[OPTIONS\][\s\S]*?\[\/OPTIONS\]/, "").trim();
  }

  const searchMatch = reply.match(/\[SEARCH\]([\s\S]*?)\[\/SEARCH\]/);
  if (searchMatch) {
    try {
      searchQuery = JSON.parse(searchMatch[1].trim());
    } catch { /* ignore parse error */ }
    reply = reply.replace(/\[SEARCH\][\s\S]*?\[\/SEARCH\]/, "").trim();
  }

  const recMatch = reply.match(/\[RECOMMEND\]([\s\S]*?)\[\/RECOMMEND\]/);
  if (recMatch) {
    try {
      recommendations = JSON.parse(recMatch[1].trim());
    } catch { /* ignore parse error */ }
    reply = reply.replace(/\[RECOMMEND\][\s\S]*?\[\/RECOMMEND\]/, "").trim();
  }

  const mediaMatch = reply.match(/\[MEDIA\]([\s\S]*?)\[\/MEDIA\]/);
  if (mediaMatch) {
    try {
      media = JSON.parse(mediaMatch[1].trim());
    } catch { /* ignore parse error */ }
    reply = reply.replace(/\[MEDIA\][\s\S]*?\[\/MEDIA\]/, "").trim();
  }

  return { reply, options, searchQuery, recommendations, media };
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

    // 패턴 1: LLM 추상화 — 에이전트별 provider 사용
    const apiKey = (c.env as unknown as Record<string, string>)[agent.provider.apiKeyEnvVar];
    if (!apiKey) {
      return c.json({ success: false, error: `Missing API key: ${agent.provider.apiKeyEnvVar}` }, 500);
    }

    // LLMMessage 형식으로 변환
    const llmMessages: LLMMessage[] = messages.map(m => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      text: m.text,
    }));

    // 1차 LLM 호출
    const rawReply = await callLLM(agent.provider, agent.systemPrompt, llmMessages, apiKey);
    const parsed = parseAgentResponse(rawReply);

    // [SEARCH] 감지 시 → DB 검색 (시간 감쇠 적용) → 2차 LLM 호출
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

      const dealList = deals.slice(0, 10).map((d, i) =>
        `[${i}] ${d.title} — ${d.sale_price > 0 ? d.sale_price.toLocaleString() + "원" : "가격미정"} (${d.source}, 할인${d.discount_rate || 0}%)`
      ).join("\n");

      const searchResultMsg = `검색 결과 (${deals.length}건, ${agent.searchSort} 정렬):\n${dealList}\n\n이 중에서 추천해줘. [RECOMMEND] 형식으로.`;

      const secondMessages: LLMMessage[] = [
        ...llmMessages,
        { role: "assistant", text: parsed.reply || "찾아볼게!" },
        { role: "user", text: searchResultMsg },
      ];

      const rawReply2 = await callLLM(agent.provider, agent.systemPrompt, secondMessages, apiKey);
      const parsed2 = parseAgentResponse(rawReply2);

      const recs = (parsed2.recommendations || []).slice(0, 5).map(r => {
        const deal = deals[r.dealIndex];
        if (!deal) return null;
        return { deal, comment: r.comment };
      }).filter(Boolean);

      const finalRecs = recs.length > 0 ? recs : deals.slice(0, 3).map(d => ({
        deal: d,
        comment: "",
      }));

      const combinedMedia = [...(parsed.media || []), ...(parsed2.media || [])];

      return c.json({
        success: true,
        reply: parsed2.reply || parsed.reply || "이거 봐봐!",
        options: parsed2.options.length > 0 ? parsed2.options : ["더 싼 거", "다른 브랜드", "비슷한 거 더"],
        recommendations: finalRecs,
        ...(combinedMedia.length > 0 && { media: combinedMedia }),
      });
    }

    return c.json({
      success: true,
      reply: parsed.reply,
      options: parsed.options,
      recommendations: [],
      ...(parsed.media && parsed.media.length > 0 && { media: parsed.media }),
    });
  } catch (err) {
    console.error("agent-chat error:", err);
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});

// 에이전트 목록 조회
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
