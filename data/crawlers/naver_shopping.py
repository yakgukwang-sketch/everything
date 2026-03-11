"""네이버 쇼핑 검색 API 크롤러"""

import requests
import os
import time
from .base import Deal

NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET", "")

API_URL = "https://openapi.naver.com/v1/search/shop.json"

# 전체 카테고리 키워드 (~250개)
DEFAULT_KEYWORDS = [
    # === 디지털/가전 ===
    # 컴퓨터
    "노트북", "게이밍노트북", "맥북", "데스크탑", "미니PC", "올인원PC",
    "모니터", "게이밍모니터", "울트라와이드모니터", "포터블모니터",
    "키보드", "기계식키보드", "무선키보드", "마우스", "게이밍마우스", "마우스패드",
    "웹캠", "헤드셋", "게이밍헤드셋", "모니터암", "노트북거치대",
    # 저장장치/부품
    "SSD", "외장하드", "USB메모리", "메모리카드", "그래픽카드", "CPU", "RAM", "파워서플라이", "컴퓨터케이스", "쿨러",
    # 모바일
    "스마트폰", "아이폰", "갤럭시", "태블릿", "아이패드", "갤럭시탭",
    "스마트워치", "애플워치", "갤럭시워치",
    "무선이어폰", "블루투스이어폰", "에어팟", "갤럭시버즈", "노이즈캔슬링이어폰",
    "충전기", "고속충전기", "보조배터리", "충전케이블", "무선충전기",
    "핸드폰케이스", "강화유리필름", "태블릿케이스", "거치대",
    # 영상/음향
    "블루투스스피커", "사운드바", "턴테이블", "마이크", "앰프",
    "카메라", "미러리스카메라", "액션캠", "삼각대", "카메라가방",
    "프로젝터", "빔프로젝터",
    # TV/가전
    "TV", "OLED TV", "75인치TV", "55인치TV",
    "에어컨", "이동식에어컨", "선풍기", "서큘레이터", "제습기", "가습기",
    "공기청정기", "히터", "전기장판", "온풍기",
    # 주방가전
    "냉장고", "미니냉장고", "김치냉장고", "전자레인지", "오븐", "에어프라이어",
    "식기세척기", "정수기", "커피머신", "에스프레소머신", "캡슐커피",
    "믹서기", "블렌더", "전기포트", "토스터", "인덕션", "전기밥솥", "밥솥",
    # 생활가전
    "세탁기", "건조기", "의류관리기", "다리미", "스팀다리미",
    "로봇청소기", "무선청소기", "핸디청소기", "물걸레청소기",
    "헤어드라이기", "고데기", "전동칫솔", "면도기", "안마기", "안마의자", "족욕기",

    # === 패션 ===
    # 신발
    "운동화", "런닝화", "등산화", "슬리퍼", "샌들", "구두", "스니커즈", "부츠",
    # 가방
    "백팩", "크로스백", "토트백", "숄더백", "캐리어", "파우치", "클러치",
    # 의류
    "티셔츠", "반팔티", "긴팔티", "맨투맨", "후드티", "니트", "셔츠",
    "청바지", "슬랙스", "반바지", "조거팬츠", "트레이닝복",
    "자켓", "바람막이", "패딩", "코트", "점퍼", "가디건",
    "원피스", "블라우스", "치마",
    # 액세서리
    "모자", "캡모자", "벨트", "지갑", "시계", "선글라스", "머플러", "장갑", "양말",

    # === 뷰티 ===
    "선크림", "로션", "스킨", "클렌징폼", "마스크팩", "세럼", "에센스",
    "파운데이션", "립스틱", "아이라이너", "쿠션", "향수",
    "샴푸", "컨디셔너", "바디워시", "핸드크림", "치약",

    # === 식품 ===
    "프로틴", "비타민", "오메가3", "유산균", "콜라겐", "루테인", "밀크씨슬", "마그네슘", "아연", "종합비타민",
    "견과류", "아몬드", "호두", "커피", "원두커피", "캡슐커피", "차", "녹차",
    "생수", "탄산수", "우유", "두유", "주스", "에너지음료",
    "라면", "즉석밥", "냉동식품", "만두", "치킨", "과자", "초콜릿", "젤리",
    "김", "참치캔", "햄", "소시지", "계란", "닭가슴살",
    "쌀", "현미", "식용유", "간장", "고추장", "된장", "소금", "후추",

    # === 생활용품 ===
    "텀블러", "보온병", "물병", "수건", "타월", "이불", "베개", "매트리스",
    "세제", "섬유유연제", "주방세제", "화장지", "키친타올", "물티슈",
    "수납함", "행거", "옷걸이", "청소용품", "쓰레기봉투",
    "우산", "방향제", "탈취제", "살충제",

    # === 가구/인테리어 ===
    "책상", "컴퓨터책상", "의자", "사무용의자", "게이밍의자",
    "침대", "침대프레임", "소파", "선반", "책장", "옷장", "서랍장",
    "커튼", "블라인드", "러그", "조명", "스탠드", "LED전구",

    # === 스포츠/레저 ===
    "요가매트", "덤벨", "폼롤러", "헬스장갑", "운동복", "레깅스",
    "자전거", "전동킥보드", "인라인", "스케이트보드",
    "등산스틱", "등산배낭", "캠핑텐트", "캠핑의자", "캠핑매트", "랜턴", "코펠",
    "낚시대", "릴", "낚시가방", "구명조끼",
    "수영복", "물안경", "래쉬가드", "튜브",
    "골프채", "골프공", "골프장갑", "골프백",
    "축구화", "축구공", "배드민턴라켓", "테니스라켓", "탁구라켓",

    # === 유아/반려 ===
    "기저귀", "분유", "유모차", "카시트", "아기띠", "젖병",
    "강아지사료", "고양이사료", "강아지간식", "고양이간식",
    "강아지장난감", "고양이장난감", "펫캐리어", "펫침대",

    # === 문구/오피스 ===
    "볼펜", "노트", "다이어리", "파일", "프린터", "프린터잉크", "복사용지", "라벨기",

    # === 자동차 ===
    "블랙박스", "내비게이션", "차량용충전기", "차량용방향제", "세차용품",
    "타이어", "자동차매트", "선팅", "핸들커버", "차량커버",
]


def search_shopping(query: str, display: int = 100, sort: str = "sim") -> list[Deal]:
    """네이버 쇼핑 검색 API 호출"""
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        print("[네이버쇼핑] API 키가 설정되지 않았습니다. .env 파일을 확인하세요.")
        return []

    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    }
    params = {
        "query": query,
        "display": min(display, 100),
        "sort": sort,
    }

    try:
        resp = requests.get(API_URL, headers=headers, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[네이버쇼핑] API 호출 실패 ({query}): {e}")
        return []

    deals = []
    for item in data.get("items", []):
        title = item.get("title", "").replace("<b>", "").replace("</b>", "")
        link = item.get("link", "")
        lprice = int(item.get("lprice", 0) or 0)
        hprice = int(item.get("hprice", 0) or 0)
        image = item.get("image", "")
        mall_name = item.get("mallName", "")
        product_id = item.get("productId", "")
        category1 = item.get("category1", "")
        category2 = item.get("category2", "")
        brand = item.get("brand", "")

        discount_rate = 0
        if hprice > 0 and lprice > 0 and lprice < hprice:
            discount_rate = round((1 - lprice / hprice) * 100)

        category = category2 or category1 or query
        description = f"{mall_name}"
        if brand:
            description += f" | {brand}"

        deals.append(Deal(
            title=title,
            url=link,
            source="naver_shopping",
            source_id=f"naver_{product_id}" if product_id else "",
            original_price=hprice,
            sale_price=lprice,
            discount_rate=discount_rate,
            image_url=image,
            category=category,
            description=description,
        ))

    return deals


def crawl_shopping(keywords: list[str] | None = None, display: int = 100) -> list[Deal]:
    """여러 키워드로 네이버 쇼핑 크롤링"""
    if keywords is None:
        keywords = DEFAULT_KEYWORDS

    all_deals = []
    seen_ids = set()

    for i, kw in enumerate(keywords):
        deals = search_shopping(kw, display=display)
        new_count = 0
        for d in deals:
            if d.source_id and d.source_id in seen_ids:
                continue
            if d.source_id:
                seen_ids.add(d.source_id)
            all_deals.append(d)
            new_count += 1

        print(f"  [{i+1}/{len(keywords)}] '{kw}': {new_count}개 (중복 제외)")

        if i < len(keywords) - 1:
            time.sleep(0.1)

    print(f"[네이버쇼핑] 총 {len(all_deals)}개 수집")
    return all_deals


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    results = search_shopping("노트북", display=5)
    for d in results:
        print(f"  {d.title[:50]} | {d.sale_price:,}원 | {d.category} | {d.description}")

    print(f"\n총 {len(results)}개")
