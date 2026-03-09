# API 키 발급 가이드

`data/.env` 파일에 아래 키들을 추가하면 크롤러가 자동으로 동작합니다.

---

## 현재 상태

| API | 상태 | 비고 |
|-----|------|------|
| 쿠팡 파트너스 | ✅ 설정됨 | 30개/회 수집 |
| 네이버 쇼핑 검색 | ❌ 미설정 | **가장 쉬움, 무료** |
| 11번가 오픈 API | ❌ 미설정 | 판매자 계정 필요 |

---

## 1. 네이버 쇼핑 검색 API (추천 — 5분이면 발급)

**일 25,000회 무료, 가입 즉시 발급**

### 발급 절차
1. https://developers.naver.com 접속 → 네이버 로그인
2. **Application → 애플리케이션 등록** 클릭
3. 애플리케이션 이름: `everything` (아무거나)
4. 사용 API: **검색** 선택
5. 환경: **WEB 설정** → 서비스 URL에 `http://localhost` 입력
6. 등록 완료 → **Client ID**와 **Client Secret** 복사

### .env에 추가
```
NAVER_CLIENT_ID=발급받은_Client_ID
NAVER_CLIENT_SECRET=발급받은_Client_Secret
```

### 수집 예상: 키워드 3개 × 20개 = 최대 60개/회

---

## 2. 11번가 오픈 API

**무료, 판매자 계정 필요**

### 발급 절차
1. https://openapi.11st.co.kr 접속
2. 11번가 **판매자 계정**으로 로그인 (없으면 셀러오피스 가입)
3. 서비스 등록 → API키 발급 (보통 1시간 이내)

### .env에 추가
```
ELEVENST_API_KEY=발급받은_API_KEY
```

### 수집 예상: 키워드 3개 × 20개 = 최대 60개/회

---

## 3. 쿠팡 파트너스 API (이미 설정됨)

**현재 동작 중**

### 참고 사항
- 제한: 1시간 10회, 1회 최대 10개
- 키워드 3개 기본 → 30개/회 수집
- 키 갱신이 필요하면: https://partners.coupang.com

### .env 형식
```
COUPANG_ACCESS_KEY=...
COUPANG_SECRET_KEY=...
```

---

## .env 파일 전체 예시

```env
# 쿠팡 파트너스 (발급됨)
COUPANG_ACCESS_KEY=your_access_key
COUPANG_SECRET_KEY=your_secret_key

# 네이버 쇼핑 검색 (5분이면 발급)
NAVER_CLIENT_ID=your_client_id
NAVER_CLIENT_SECRET=your_client_secret

# 11번가 오픈 API (판매자 계정 필요)
ELEVENST_API_KEY=your_api_key
```

파일 위치: `data/.env`

---

## API 없이 동작하는 크롤러 (키 불필요)

| 크롤러 | 수집량 |
|--------|--------|
| 11번가 베스트셀러 (HTML) | ~20개 |
| 11번가 검색 (모바일 API) | ~110개 |
| 다나와 가격비교 | ~34개 |
| GS샵 TV쇼핑 | 현재 방송 1개 |
| 뽐뿌/루리웹/클리앙/FM코리아/퀘사이존 | 커뮤니티 핫딜 |
