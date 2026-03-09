# everything 프로젝트 코드 리뷰

## 종합 점수: 58/100

| 항목 | 점수 | 비고 |
|------|------|------|
| 프로젝트 구조 | 8/10 | 깔끔한 모노레포 구성 |
| API 설계 | 7/10 | RESTful, 전략 패턴 좋음 |
| 프론트엔드 | 6/10 | 기능 동작하나 타입/에러 처리 부족 |
| 크롤러 | 5/10 | 동작하나 에러 처리/검증 취약 |
| 보안 | 3/10 | API키 노출, 인증 없음, XSS |
| 테스트 | 0/10 | 테스트 없음 |
| 문서화 | 6/10 | 전략 문서 좋으나 API 문서 없음 |
| CSS/UI | 7/10 | 반응형 있으나 변수화 부족 |
| 성능 | 6/10 | 가상화 없음, 불필요한 리렌더 |
| 유지보수 | 5/10 | any 타입 남발, 상태 관리 복잡 |

---

## CRITICAL (즉시 수정)

### 1. API 키 노출 — `api/wrangler.toml`
```toml
# 현재: 하드코딩 (누구나 볼 수 있음)
GEMINI_API_KEY = "AIzaSy..."
```
**해결**: `wrangler secret put GEMINI_API_KEY`로 환경변수 사용

### 2. 에이전트 등록 인증 없음 — `api/src/index.ts:253`
누구나 POST로 에이전트 등록 가능. 악성 에이전트 주입 위험.

### 3. XSS 취약점 — `web/src/app/page.tsx`
외부 크롤링 데이터의 `title`, `url`을 검증 없이 렌더링.

---

## HIGH (이번 주)

### 4. 입력값 검증 없음
- `/api/deals` limit에 100만 넣어도 처리됨
- `/api/agents/register` name이 빈 문자열이어도 등록됨
- `/api/chat` 메시지 길이 제한 없음

### 5. 에러 처리 부실
- API: generic `catch (err)` → 사용자에게 500만 반환
- 크롤러: `print(f"Error: {e}")` 후 무시
- 프론트: `console.error` 만 하고 UI 피드백 없음

### 6. TypeScript any 남발
```typescript
// 현재
const data = await res.json() as any;
// 수정해야 함
interface GeminiResponse { candidates: { content: { parts: { text: string }[] } }[] }
```

---

## MEDIUM (이번 달)

### 7. 테스트 코드 0개
- API 엔드포인트 테스트 없음
- 크롤러 파싱 테스트 없음
- 프론트 컴포넌트 테스트 없음

### 8. CSS 하드코딩
```css
/* 현재: 색상이 파일 전체에 흩어져 있음 */
color: #4285f4;
color: #ea4335;
/* 수정: CSS 변수 사용 */
:root {
  --color-primary: #4285f4;
  --color-danger: #ea4335;
}
```

### 9. 크롤러 데이터 검증
- URL 형식 검증 없음
- 가격이 음수여도 저장됨
- 중복 크롤링 감지 없음

### 10. 상태 관리 복잡
`page.tsx`에 `useState` 8개 → `useReducer`로 정리 필요

---

## 파일별 이슈 수

| 파일 | CRITICAL | HIGH | MEDIUM |
|------|----------|------|--------|
| `api/wrangler.toml` | 1 | - | - |
| `api/src/index.ts` | 1 | 3 | 4 |
| `web/src/app/page.tsx` | 1 | 2 | 3 |
| `web/src/app/search/page.tsx` | - | 2 | 2 |
| `web/src/app/globals.css` | - | - | 4 |
| `data/crawlers/*.py` (전체) | - | 3 | 5 |
| `data/main.py` | - | 1 | 1 |

---

## 잘한 점

- 모노레포 구조 깔끔 (api/web/data/agents 분리)
- 에이전트 전략 패턴 구현이 창의적
- SQL 파라미터 바인딩으로 SQL Injection 방어
- 반응형 CSS 기본 지원
- 크롤러 `Deal` dataclass로 일관된 데이터 모델
- HOT 점수 알고리즘 구현
- Gemini 대화형 니즈 파악 → 에이전트 경쟁 파이프라인
