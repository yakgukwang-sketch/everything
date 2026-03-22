# 새 크롤러 생성

새로운 데이터 소스 크롤러를 `data/crawlers/` 에 생성합니다.

## 입력
- $ARGUMENTS: 크롤러 이름과 대상 사이트 (예: "aliexpress 알리익스프레스 핫딜")

## 규칙

1. `data/crawlers/base.py`의 `Deal`, `Comment` 데이터클래스를 import해서 사용
2. `upload_deals()`, `upload_comments()`로 API 업로드
3. 기존 크롤러 패턴을 따를 것:
   - `ppomppu.py`: HTML 스크래핑 (BeautifulSoup)
   - `naver_shopping.py`: REST API 호출
   - `coupang.py`: HMAC 인증 API
4. 필수 구현:
   - `HEADERS` with User-Agent
   - `parse_price()` 가격 파싱
   - 메인 크롤 함수 → `list[Deal]` 반환
   - `time.sleep()` rate limiting (최소 1초)
   - `source_id` 중복 방지 (UNIQUE 제약)
   - 에러 처리 + continue (한 건 실패해도 계속)
   - `if __name__ == "__main__"` 테스트 블록
5. source 필드: 사이트 영문 소문자 (예: "ppomppu", "naver", "coupang")
6. 한글 인코딩 주의: euc-kr 사이트는 `.content.decode("euc-kr", errors="replace")`
7. `data/crawlers/__init__.py`에 새 크롤러 등록

## 작업
1. 대상 사이트 구조 분석 (필요시 WebFetch로 확인)
2. 크롤러 파일 생성
3. `__init__.py` 업데이트
4. 테스트 실행 가능한 `__main__` 블록 포함
