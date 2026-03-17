# everything 프로젝트 개요

## 한 줄 요약

모든 로컬 서비스의 데이터와 결제를 API로 제공하고, 누구나 그 위에서 세일즈할 수 있는 플랫폼.

## 핵심 비유

### 방송국 → 유튜브
MBC, KBS, SBS가 나눠먹던 파이를 유튜브가 열어서 유튜버들이 가져갔다.

### 플랫폼 기업 → Everything
쿠팡, 배민, 야놀자가 독점하는 파이를 Everything이 열어서 에이전트(세일즈맨)들이 가져간다.

> 상세 철학: [philosophy.md](./philosophy.md)

---

## 구조

```
Everything (인프라)
├── 데이터 수집: 뽐뿌, 네이버쇼핑, 쿠팡 등
├── API: 건당 과금, 누구나 접근 가능
└── 결제: 제휴 링크 → 추후 통합 Payments API

에이전트 (세일즈맨)
├── API를 가져다 자기 서비스를 만듦
├── 각자의 색깔, 전문성으로 경쟁
├── 수수료를 자기가 정함 (쿠팡보다 비싸면 안 팔림)
└── 경쟁 → 수수료 자연 하락 → 소비자 이익
```

---

## 수익 구조

```
소비자: 같은 물건을 더 싸게 산다
    ↓ 구매
에이전트: 수수료를 받는다 (자기가 정함)
    ↓ API 사용
Everything: API 호출 건당 과금 (거래 수수료 X)
```

---

## 현재 포커스: 쇼핑

쇼핑은 진입장벽이 가장 낮다:
- **데이터**: 뽐뿌 커뮤니티에 이미 정리 + 네이버쇼핑 API + 쿠팡 파트너스
- **결제**: 제휴 링크로 결제 인프라 없이도 수익 가능
- **물류**: 필요 없음
- **법적 리스크**: 공개 API 사용이라 크롤링 이슈 적음

---

## 데이터 수집

### 소스
| 소스 | 방식 | 상태 |
|------|------|------|
| 네이버 쇼핑 API | 329키워드 × 100개 = ~32,000개/일 | 동작 |
| 쿠팡 파트너스 API | HMAC-SHA256 auth, 시간당 10회 | 동작 |
| 뽐뿌 커뮤니티 | 여러 쇼핑몰 핫딜 정리 | 예정 |

### 크롤러
| 파일 | 역할 |
|------|------|
| crawlers/naver_shopping.py | 네이버 쇼핑 API 검색 |
| crawlers/coupang.py | 쿠팡 파트너스 API |
| crawlers/base.py | Deal 데이터 구조 + API 업로드 |
| main.py | 크롤러 실행 |

---

## API 서버

Cloudflare Workers + Hono + D1

```
api/src/
  index.ts          -- CORS + 라우트 마운트
  types.ts          -- 공유 타입
  llm.ts            -- LLM 추상화 (Gemini/OpenAI)
  routes/
    chat.ts         -- Gemini 대화 (니즈 파악)
    deals.ts        -- 딜 CRUD + 사업자 등록
    agents.ts       -- 에이전트 마켓플레이스
    agent-chat.ts   -- 에이전트 1:1 채팅
    discovery.ts    -- 핫딜, 트렌드
    developers.ts   -- 개발자 등록 + API 키
  skills/
    gamja.md        -- 감자 🥔 (가성비 전문)
    chip.md         -- 칩 💻 (노트북 전문)
  strategies/
    shopping.ts     -- AI 쇼핑 에이전트 전략
```

### 주요 엔드포인트
| 기능 | 엔드포인트 |
|------|-----------|
| 상품 검색/등록 | /api/deals |
| 핫딜 랭킹 | /api/hot |
| 대화형 니즈 파악 | /api/chat |
| 에이전트 1:1 채팅 | /api/agent/chat |
| 에이전트 목록 | /api/agent/list |
| 에이전트 등록 | /api/agents/register |
| 개발자 등록 | /api/developers/register |

---

## 웹사이트

Next.js 15 + Cloudflare Pages (Static Export)

| 페이지 | 기능 |
|--------|------|
| 홈 (/) | 대화형 UI + 딜 피드 |
| 검색 (/search) | 상품 검색 + 에이전트 추천 |
| 딜 제보 (/submit) | 사업자/사용자 딜 등록 |
| 에이전트 마켓 (/agents) | 에이전트 목록/랭킹 |

---

## 에이전트 시스템

- 외부 개발자가 API로 에이전트 등록
- 스킬 MD 파일로 에이전트 성격/전략 정의 (OpenClaw 패턴)
- 에이전트끼리 경쟁 → 수수료 자연 하락
- 가격 경쟁 외 전문성으로 차별화 (노트북 전문, 육아 전문 등)

### 현재 에이전트
| 에이전트 | 전문 | 특징 |
|----------|------|------|
| 감자 🥔 | 가성비 | 반말+인터넷 말투, 최저가 정렬 |
| 칩 💻 | 노트북 | CPU/RAM/SSD/디스플레이 사양 분석 |

---

## 로드맵

### Phase 1: 데이터 확보 (현재)
1. 뽐뿌 크롤러 추가
2. 크롤링 자동 스케줄링
3. 데이터 품질 관리

### Phase 2: 에이전트 고도화 + 결제
4. 외부 에이전트 API 공개
5. API 건당 과금 시스템
6. 결제 연동 (제휴 링크 → PG → 크립토)

### Phase 3: 영역 확장
7. 숙박, 인테리어 등 버티컬 추가
8. 모든 플랫폼의 payments 통합

---

## 최종 목표

쿠팡이츠, 야놀자, 쿠팡, 배달의민족, 오늘의집 등
모든 플랫폼 기업의 결제를 하나의 API로 통합하고,
그 위에 에이전트 생태계를 만들어 네트워크 효과를 일으킨다.

---

## 라이브

| 서비스 | URL |
|--------|-----|
| 웹사이트 | https://everything-a6h.pages.dev |
| API | https://everything-api.deri58.workers.dev |

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 데이터 수집 | Python, requests |
| API | Cloudflare Workers, Hono, D1 (SQLite) |
| AI | Gemini API, LLM 추상화 (OpenClaw) |
| 웹 | Next.js 15 (Static Export), Cloudflare Pages |
