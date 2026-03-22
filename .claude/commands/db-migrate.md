# DB 마이그레이션

D1 데이터베이스 스키마를 변경합니다.

## 입력
- $ARGUMENTS: 변경 내용 (예: "deals 테이블에 brand 컬럼 추가", "reviews 테이블 새로 생성")

## 규칙

1. `api/schema.sql` 참조하여 현재 스키마 파악
2. D1 (SQLite) 제약:
   - `ALTER TABLE ... ADD COLUMN` 가능
   - `ALTER TABLE ... DROP COLUMN` 불가 → 새 테이블 생성 + 데이터 복사 필요
   - `ALTER TABLE ... RENAME COLUMN` 불가
   - `CREATE TABLE IF NOT EXISTS` 사용
   - `CREATE INDEX IF NOT EXISTS` 사용
3. 마이그레이션 SQL 파일: `api/migrations/YYYYMMDD_설명.sql` 에 저장
4. 배치 INSERT는 50개씩 (D1 타임아웃 제한)
5. `schema.sql`도 함께 업데이트 (최신 전체 스키마 유지)
6. FOREIGN KEY 참조 무결성 확인

## 작업

1. 현재 `api/schema.sql` 읽어서 기존 스키마 파악
2. 마이그레이션 SQL 작성 → `api/migrations/` 에 저장
3. `api/schema.sql` 업데이트
4. 적용 명령어 안내:
   - 로컬: `cd api && npx wrangler d1 execute everything-db --local --file=migrations/YYYYMMDD_설명.sql`
   - 리모트: `cd api && npx wrangler d1 execute everything-db --remote --file=migrations/YYYYMMDD_설명.sql`
5. 관련 TypeScript 타입이나 라우트에 변경 필요하면 안내
