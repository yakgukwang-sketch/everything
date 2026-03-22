# 새 쇼핑 에이전트 스킬 생성

`api/src/skills/`에 새 에이전트 스킬 MD 파일을 생성합니다.

## 입력
- $ARGUMENTS: 에이전트 컨셉 (예: "뷰티 화장품 전문 에이전트")

## 규칙

1. 기존 스킬 파일 참조: `api/src/skills/gamja.md`, `api/src/skills/chip.md`
2. frontmatter 필수 필드:
   ```yaml
   ---
   id: 영문소문자 (예: beauty)
   name: "한글 이름"
   icon: "이모지"
   description: "한 줄 설명"
   greeting: "첫 인사말"
   searchSort: "sale_price ASC" 또는 다른 정렬
   searchLimit: 20
   provider: gemini_flash
   ---
   ```
3. 본문 구조:
   - 성격/말투 정의
   - 대화 규칙 (1~5번)
   - `[SEARCH]` JSON 형식 (keywords, minPrice, maxPrice)
   - `[RECOMMEND]` JSON 형식 (dealIndex, comment)
   - `[OPTIONS]` 선택지
   - `[MEDIA]` (선택)
   - 가격 등급 안내 (price_guide 연동)
   - 예시 대화
4. minPrice 설정 필수: 카테고리별 최소가로 액세서리 필터링
5. 에이전트 차별점을 명확히 (전문 분야, 분석 관점)

## 작업
1. 컨셉에 맞는 페르소나 설계
2. 스킬 MD 파일 생성
3. agent-chat.ts가 skills/ 디렉토리를 자동 로드하는지 확인
   - 자동 로드 안 되면 등록 코드 추가
