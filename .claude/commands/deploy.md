# 배포

API와 Web을 Cloudflare에 배포합니다.

## 입력
- $ARGUMENTS: 배포 대상 (예: "api", "web", "all", 또는 비어있으면 변경사항 기준 자동 판단)

## 프로젝트 규칙

- **API 배포**: `cd api && npx wrangler deploy`
- **Web 빌드**: `cd web && npm run build` (Next.js static export → `out/`)
- **Web 배포**: `cd web && npx wrangler pages deploy out --project-name everything --branch main --commit-dirty=true`
  - 반드시 `--branch main` 사용! (없으면 preview/master로 배포됨)
- **D1 스키마 변경**: `cd api && npx wrangler d1 execute everything-db --remote --file=schema.sql`
- Windows curl 한글: JSON 파일로 저장 후 `curl -d @file.json`
- D1 배치 업로드: 50개씩 (200개는 타임아웃)

## 작업

1. git status로 변경된 파일 확인
2. 변경 범위에 따라 배포 대상 결정:
   - `api/` 변경 → API 배포
   - `web/` 변경 → Web 빌드 + 배포
   - `schema.sql` 변경 → D1 마이그레이션 먼저
3. 빌드 에러 있으면 수정
4. 배포 후 `/health` 엔드포인트로 확인
