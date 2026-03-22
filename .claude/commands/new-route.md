# 새 API 라우트 생성

`api/src/routes/`에 새 Hono 라우트 파일을 생성합니다.

## 입력
- $ARGUMENTS: 라우트 이름과 목적 (예: "notifications 알림 시스템")

## 규칙

1. 기존 패턴 따를 것 (`api/src/routes/deals.ts`, `sellers.ts` 등 참고)
2. 파일 구조:
   ```typescript
   import { Hono } from "hono";
   import type { Bindings } from "../types";

   const app = new Hono<{ Bindings: Bindings }>();

   // 엔드포인트들...

   export default app;
   ```
3. 응답 형식 통일:
   - 성공: `c.json({ success: true, data: ... })`
   - 에러: `c.json({ error: "메시지" }, 400/401/404/500)`
4. 인증이 필요하면 기존 방식 사용:
   - Admin: `Authorization: Bearer {ADMIN_API_KEY}` → `c.env.ADMIN_API_KEY`와 비교
   - Seller JWT: `api/src/auth.ts`의 `verifyToken()` 사용
   - Developer API key: `ev_*` prefix, DB 조회
5. D1 쿼리: `c.env.DB.prepare(sql).bind(...params).run/all/first()`
6. 입력 검증: 필수 필드 체크, SQL injection 방지 (바인딩 사용)

## 작업
1. 라우트 파일 생성
2. `api/src/index.ts`에 import + `app.route("/", ...)` 등록
3. 필요시 `schema.sql`에 테이블 추가
4. 필요시 `api/src/types.ts`에 Bindings 타입 확인/업데이트
