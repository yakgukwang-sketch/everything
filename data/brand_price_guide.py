"""브랜드별 적정가격 가이드 - 뽐뿌 4000개 딜 기반"""

import json
import re
import os
import sys
import io
from collections import defaultdict
import statistics

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BULK_DIR = os.path.join(os.path.dirname(__file__), "bulk_output")

# 상품 카테고리 키워드 매핑
PRODUCT_CATEGORIES = {
    "식품/음료": [
        "쌀", "밥", "라면", "라멘", "스팸", "참치", "김치", "만두", "교자", "햇반",
        "계란", "특란", "달걀", "닭", "삼겹", "목살", "소고기", "돼지", "갈비",
        "콜라", "사이다", "음료", "커피", "아메리카노", "물", "샘물", "생수", "탄산",
        "과자", "초코", "빵", "떡", "젤리", "과일", "토마토", "사과", "딸기",
        "치즈", "우유", "요거트", "버터", "아이스크림", "빙과",
        "소스", "간장", "고추장", "된장", "케첩", "마요", "올리브유",
        "견과", "호두", "아몬드", "캐슈넛", "건과일",
        "해산물", "새우", "연어", "고등어", "전복", "멍게", "오징어",
        "족발", "보쌈", "치킨", "피자", "햄버거", "핫도그",
        "김", "젓갈", "장아찌", "반찬",
    ],
    "생활용품": [
        "세제", "섬유유연제", "세탁", "주방세제", "식기세척", "청소",
        "휴지", "화장지", "키친타올", "물티슈", "티슈",
        "칫솔", "치약", "구강", "가글",
        "바디워시", "샴푸", "린스", "비누", "로션",
        "선크림", "자외선",
    ],
    "전자기기": [
        "노트북", "태블릿", "아이패드", "갤럭시탭", "맥북",
        "스마트폰", "아이폰", "갤럭시", "폰",
        "이어폰", "에어팟", "버즈", "헤드폰", "헤드셋",
        "스피커", "블루투스", "사운드바",
        "TV", "모니터", "디스플레이",
        "키보드", "마우스", "웹캠",
        "충전기", "보조배터리", "케이블", "충전",
        "SSD", "메모리", "USB", "외장하드",
        "워치", "스마트워치", "갤럭시핏", "애플워치",
        "로봇청소기", "에어컨", "세탁기", "건조기", "냉장고",
    ],
    "패션/의류": [
        "티셔츠", "반팔", "긴팔", "맨투맨", "후드",
        "팬츠", "바지", "청바지", "조거",
        "자켓", "코트", "패딩", "점퍼",
        "운동화", "신발", "슬리퍼", "샌들", "트레킹",
        "나이키", "아디다스", "뉴발란스", "컨버스", "푸마",
        "언더웨어", "속옷", "양말",
    ],
    "건강/영양제": [
        "비타민", "유산균", "프로바이오틱", "오메가", "영양제",
        "단백질", "프로틴", "닭가슴살", "다이어트",
        "알부민", "콜라겐", "루테인", "밀크씨슬",
    ],
    "게임/디지털": [
        "게임", "스팀", "에픽", "플스", "닌텐도", "xbox",
        "VPN", "앱", "어플", "구독", "ChatGPT",
    ],
    "통신/요금제": [
        "알뜰폰", "요금제", "유심", "이심", "esim", "데이터", "통화",
        "토스모바일", "KT", "SKT", "LG", "알뜰",
    ],
    "가전/주방": [
        "프라이팬", "냄비", "전기밥솥", "에어프라이어",
        "전자레인지", "오븐", "커피머신", "정수기",
        "가스", "부탄가스",
    ],
}


def categorize_product(title: str) -> str:
    """제목에서 상품 카테고리 분류"""
    title_lower = title.lower()
    scores = {}
    for cat, keywords in PRODUCT_CATEGORIES.items():
        score = sum(1 for kw in keywords if kw.lower() in title_lower)
        if score > 0:
            scores[cat] = score

    if not scores:
        return "기타"
    return max(scores, key=scores.get)


def extract_brand(title: str) -> str:
    """제목에서 브랜드명 추출"""
    # [판매처]브랜드명 패턴 제거 후 첫 브랜드 추출
    # 판매처 태그 제거
    cleaned = re.sub(r"^\[.+?\]", "", title).strip()

    # 알려진 브랜드 매칭
    known_brands = {
        # 식품
        "풀무원": "풀무원", "CJ": "CJ", "비비고": "CJ 비비고", "오뚜기": "오뚜기",
        "동원": "동원", "하림": "하림", "농심": "농심", "삼양": "삼양",
        "코카콜라": "코카콜라", "펩시": "펩시", "맥심": "맥심", "스타벅스": "스타벅스",
        "메가커피": "메가커피", "컴포즈": "컴포즈",
        "신라면": "농심", "진라면": "오뚜기", "짜파게티": "농심",
        "햇반": "CJ", "스팸": "CJ",
        # 생활
        "다우니": "다우니", "피죤": "피죤", "LG생활": "LG생활건강",
        "도브": "도브", "바세린": "바세린", "니베아": "니베아",
        # 전자
        "삼성": "삼성", "LG": "LG", "애플": "애플", "소니": "소니",
        "레노버": "레노버", "ASUS": "ASUS", "HP": "HP", "델": "Dell",
        "에어팟": "애플", "버즈": "삼성", "갤럭시": "삼성",
        "아이폰": "애플", "아이패드": "애플", "맥북": "애플",
        "로지텍": "로지텍", "앤커": "앤커",
        "하만카돈": "하만카돈", "JBL": "JBL", "보스": "보스",
        "다이슨": "다이슨", "샤오미": "샤오미", "로보락": "로보락",
        "어메이즈핏": "어메이즈핏",
        # 패션
        "나이키": "나이키", "아디다스": "아디다스", "뉴발란스": "뉴발란스",
        "컨버스": "컨버스", "탑텐": "탑텐", "유니클로": "유니클로",
        "무신사": "무신사", "컬럼비아": "컬럼비아",
        "TNGT": "TNGT", "폴로": "폴로",
    }

    for keyword, brand in known_brands.items():
        if keyword.lower() in title.lower():
            return brand

    # 첫 단어를 브랜드로 추정
    words = cleaned.split()
    if words:
        first = words[0].strip("()")
        if len(first) >= 2 and not first[0].isdigit():
            return first

    return "기타"


def analyze_brand_prices(posts):
    """브랜드별 적정가격 분석"""

    # 1. 상품 분류 + 브랜드 추출
    enriched = []
    for p in posts:
        if p["sale_price"] <= 0:
            continue
        product_cat = categorize_product(p["title"])
        brand = extract_brand(p["title"])
        enriched.append({
            **p,
            "product_category": product_cat,
            "brand": brand,
        })

    print(f"\n가격 있는 게시글: {len(enriched)}개")

    # 2. 상품 카테고리별 분석
    print("\n" + "=" * 70)
    print("상품 카테고리별 가격 분석")
    print("=" * 70)

    by_category = defaultdict(list)
    for p in enriched:
        by_category[p["product_category"]].append(p)

    category_stats = {}
    for cat in sorted(by_category.keys(), key=lambda x: len(by_category[x]), reverse=True):
        items = by_category[cat]
        prices = [p["sale_price"] for p in items]
        rec_ups = [p["rec_up"] for p in items]

        # 추천 높은 것들의 가격 (상위 25%)
        good_items = sorted(items, key=lambda x: x["rec_up"], reverse=True)
        top_quarter = good_items[:max(len(good_items) // 4, 1)]
        good_prices = [p["sale_price"] for p in top_quarter]

        stat = {
            "count": len(items),
            "price_avg": int(statistics.mean(prices)),
            "price_median": int(statistics.median(prices)),
            "price_min": min(prices),
            "price_max": max(prices),
            "price_p25": int(sorted(prices)[len(prices) // 4]),
            "price_p75": int(sorted(prices)[len(prices) * 3 // 4]),
            "avg_rec": round(statistics.mean(rec_ups), 1),
            "good_deal_avg": int(statistics.mean(good_prices)) if good_prices else 0,
            "good_deal_median": int(statistics.median(good_prices)) if good_prices else 0,
        }
        category_stats[cat] = stat

        print(f"\n[{cat}] ({stat['count']}개)")
        print(f"  가격: 평균={stat['price_avg']:,}원 | 중간={stat['price_median']:,}원")
        print(f"  범위: {stat['price_min']:,}원 ~ {stat['price_max']:,}원")
        print(f"  추천 좋은 딜 평균가: {stat['good_deal_avg']:,}원")
        print(f"  평균 추천: {stat['avg_rec']}")

    # 3. 브랜드별 분석
    print("\n" + "=" * 70)
    print("브랜드별 적정가격 가이드")
    print("=" * 70)

    by_brand = defaultdict(list)
    for p in enriched:
        by_brand[p["brand"]].append(p)

    brand_guide = {}
    # 3개 이상 게시글이 있는 브랜드만
    active_brands = {b: items for b, items in by_brand.items() if len(items) >= 3 and b != "기타"}

    for brand in sorted(active_brands.keys(), key=lambda x: len(active_brands[x]), reverse=True):
        items = active_brands[brand]
        prices = [p["sale_price"] for p in items]
        recs = [p["rec_up"] for p in items]

        # 추천 높은 딜 (추천 > 평균)
        avg_rec = statistics.mean(recs) if recs else 0
        good_deals = [p for p in items if p["rec_up"] > avg_rec]
        if not good_deals:
            good_deals = sorted(items, key=lambda x: x["rec_up"], reverse=True)[:max(1, len(items) // 3)]

        good_prices = [p["sale_price"] for p in good_deals]

        # 카테고리 분포
        cats = defaultdict(int)
        for p in items:
            cats[p["product_category"]] += 1
        main_cat = max(cats, key=cats.get)

        guide = {
            "brand": brand,
            "main_category": main_cat,
            "total_deals": len(items),
            "price_avg": int(statistics.mean(prices)),
            "price_median": int(statistics.median(prices)),
            "price_min": min(prices),
            "price_max": max(prices),
            "good_deal_price_avg": int(statistics.mean(good_prices)),
            "good_deal_price_max": max(good_prices),
            "avg_rec": round(avg_rec, 1),
            "max_rec": max(recs),
            "verdict": "",
            "sample_good_deals": [],
        }

        # 판정 기준
        if guide["good_deal_price_avg"] < guide["price_avg"] * 0.8:
            guide["verdict"] = f"{guide['good_deal_price_avg']:,}원 이하면 꿀딜"
        else:
            guide["verdict"] = f"{guide['good_deal_price_avg']:,}원 근처면 적정가"

        # 샘플
        for p in sorted(good_deals, key=lambda x: x["rec_up"], reverse=True)[:3]:
            guide["sample_good_deals"].append({
                "title": p["title"][:60],
                "price": p["sale_price"],
                "rec": p["rec_up"],
            })

        brand_guide[brand] = guide

    # 브랜드별 출력
    for brand in sorted(brand_guide.keys(), key=lambda x: brand_guide[x]["total_deals"], reverse=True)[:40]:
        g = brand_guide[brand]
        print(f"\n{'='*50}")
        print(f"[{brand}] ({g['main_category']}) - {g['total_deals']}개 딜")
        print(f"  전체 가격: 평균={g['price_avg']:,}원 | 중간={g['price_median']:,}원")
        print(f"  범위: {g['price_min']:,}원 ~ {g['price_max']:,}원")
        print(f"  --> {g['verdict']}")
        print(f"  추천 평균: {g['avg_rec']} (최고 {g['max_rec']})")
        for s in g["sample_good_deals"]:
            print(f"    * {s['title']} ({s['price']:,}원, 추천{s['rec']})")

    # 4. "이 가격이면 사라" 요약표
    print("\n" + "=" * 70)
    print("이 가격이면 사라! (브랜드별 꿀딜 기준)")
    print("=" * 70)

    for cat in sorted(category_stats.keys(), key=lambda x: category_stats[x]["count"], reverse=True):
        brands_in_cat = [b for b, g in brand_guide.items() if g["main_category"] == cat]
        if not brands_in_cat:
            continue

        print(f"\n--- {cat} ---")
        for brand in sorted(brands_in_cat, key=lambda x: brand_guide[x]["total_deals"], reverse=True)[:10]:
            g = brand_guide[brand]
            sweet_spot = g["good_deal_price_avg"]
            print(f"  {brand:12s} | {sweet_spot:>10,}원 이하 -> 괜찮은 딜 (평소 {g['price_avg']:,}원)")

    # 5. 결과 저장
    output = {
        "category_stats": category_stats,
        "brand_guide": brand_guide,
        "total_analyzed": len(enriched),
    }

    output_path = os.path.join(BULK_DIR, "ppomppu_brand_guide.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n\n저장: {output_path}")

    return output


def main():
    with open(os.path.join(BULK_DIR, "ppomppu_posts.json"), "r", encoding="utf-8") as f:
        posts = json.load(f)

    print(f"데이터 로드: {len(posts)}개 게시글")
    analyze_brand_prices(posts)


if __name__ == "__main__":
    main()
