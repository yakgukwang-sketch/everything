"""구체적 상품별 가격 등급 가이드 - 뽐뿌 4000개 딜 기반"""

import json
import re
import os
import sys
import io
import statistics
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BULK_DIR = os.path.join(os.path.dirname(__file__), "bulk_output")


# 구체적 상품 매칭 규칙: (상품명, 키워드들, 단위 정규화)
PRODUCT_RULES = [
    # === 음료 ===
    ("코카콜라 제로 355ml", ["코카콜라", "제로", "355"], "캔"),
    ("코카콜라 제로 190ml", ["코카콜라", "제로", "190"], "캔"),
    ("코카콜라 오리지널 215ml", ["코카콜라", "오리지널", "215"], "캔"),
    ("코카콜라 (기타)", ["코카콜라"], "묶음"),
    ("펩시 제로 355ml", ["펩시", "제로", "355"], "캔"),
    ("펩시 제로 245ml", ["펩시", "제로", "245"], "캔"),
    ("펩시 (기타)", ["펩시"], "묶음"),
    ("메가커피 아메리카노", ["메가커피", "아메리카노"], "잔"),
    ("메가커피 더블따아세트", ["메가커피", "더블따"], "세트"),
    ("메가커피 (기타)", ["메가커피"], "잔"),
    ("스타벅스 캡슐커피", ["스타벅스", "캡슐"], "박스"),
    ("스타벅스 상품권", ["스타벅스", "원권"], "장"),
    ("스타벅스 머그컵", ["스타벅스", "머그"], "개"),
    ("카누 캡슐커피", ["카누", "캡슐"], "팩"),
    ("카누 더블샷 라떼", ["카누", "더블샷"], "T"),
    ("카누 (기타)", ["카누"], "묶음"),
    ("동원 샘물 2L", ["동원", "샘물", "2L"], "병"),
    ("삼다수 2L", ["삼다수", "2L"], "병"),
    ("풀무원 샘물 2L", ["풀무원", "샘물", "2L"], "병"),
    ("매일두유 고단백 190ml", ["매일두유", "고단백", "190"], "팩"),
    ("매일두유 (기타)", ["매일두유"], "팩"),

    # === 즉석밥/라면 ===
    ("햇반 210g", ["햇반", "210"], "개"),
    ("오뚜기 수향미밥", ["오뚜기", "수향미"], "개"),
    ("오뚜기 즉석밥 (기타)", ["오뚜기", "밥"], "개"),
    ("신라면 20개입", ["신라면", "20"], "박스"),
    ("신라면 (기타)", ["신라면"], "묶음"),
    ("짜파게티", ["짜파게티"], "묶음"),
    ("삼양라면", ["삼양라면"], "묶음"),
    ("진라면", ["진라면"], "묶음"),
    ("불닭볶음면", ["불닭"], "묶음"),

    # === 과자/간식 ===
    ("오리온 초코칩쿠키", ["오리온", "초코칩"], "묶음"),
    ("오리온 간식 모음", ["오리온", "간식"], "세트"),
    ("오리온 (기타)", ["오리온"], "묶음"),
    ("뿌셔뿌셔", ["뿌셔뿌셔"], "묶음"),

    # === 육류 ===
    ("한돈 삼겹살", ["한돈", "삼겹"], "g"),
    ("한돈 목살", ["한돈", "목살"], "g"),
    ("한돈 (기타)", ["한돈"], "g"),
    ("닭가슴살", ["닭가슴살"], "팩"),
    ("용가리치킨 1kg", ["용가리치킨", "1kg"], "봉"),
    ("용가리치킨 (기타)", ["용가리치킨"], "봉"),
    ("소불고기", ["소불고기"], "팩"),

    # === 참치/캔 ===
    ("동원 고추참치 85g", ["동원", "참치", "85"], "캔"),
    ("동원 고추참치 100g", ["동원", "참치", "100"], "캔"),
    ("동원 참치 (기타)", ["동원", "참치"], "캔"),
    ("스팸 340g", ["스팸", "340"], "개"),
    ("스팸 200g", ["스팸", "200"], "개"),
    ("스팸 (기타)", ["스팸"], "묶음"),

    # === 만두/냉동 ===
    ("비비고 왕교자", ["비비고", "왕교자"], "봉"),
    ("풀무원 만두", ["풀무원", "만두"], "봉"),
    ("교자만두 (기타)", ["교자만두"], "봉"),
    ("풀무원 톡톡김치", ["풀무원", "톡톡김치"], "kg"),
    ("포기김치", ["포기김치"], "kg"),

    # === 유제품/계란 ===
    ("특란 30구", ["특란", "30"], "판"),
    ("계란 (기타)", ["계란"], "판"),
    ("달걀 (기타)", ["달걀"], "판"),
    ("모짜렐라 치즈", ["모짜렐라", "치즈"], "kg"),

    # === 생활용품 ===
    ("크리넥스 화장지 3겹", ["크리넥스", "화장지"], "팩"),
    ("깨끗한나라 화장지", ["깨끗한나라", "화장지"], "팩"),
    ("키친타올", ["키친타올"], "팩"),
    ("물티슈", ["물티슈"], "팩"),
    ("도브 바디워시 1000ml", ["도브", "바디워시", "1000"], "개"),
    ("도브 바디워시 (기타)", ["도브", "바디워시"], "개"),
    ("바세린 로션 1000ml", ["바세린", "로션", "1000"], "개"),
    ("바세린 (기타)", ["바세린"], "개"),
    ("섬유유연제", ["섬유유연제"], "개"),
    ("세탁세제", ["세탁세제"], "개"),
    ("부탄가스", ["부탄가스"], "개"),

    # === 전자기기 ===
    ("갤럭시 S25 울트라", ["갤럭시", "S25", "울트라"], "대"),
    ("갤럭시 S26 울트라", ["갤럭시", "S26", "울트라"], "대"),
    ("갤럭시 S25 (기타)", ["갤럭시", "S25"], "대"),
    ("갤럭시 S26 (기타)", ["갤럭시", "S26"], "대"),
    ("갤럭시탭", ["갤럭시탭"], "대"),
    ("갤럭시핏", ["갤럭시핏"], "대"),
    ("갤럭시버즈", ["갤럭시", "버즈"], "개"),
    ("아이폰 16", ["아이폰", "16"], "대"),
    ("아이패드", ["아이패드"], "대"),
    ("에어팟", ["에어팟"], "개"),
    ("레노버 노트북", ["레노버"], "대"),
    ("LG 그램", ["그램"], "대"),
    ("로봇청소기", ["로봇청소기"], "대"),
    ("보조배터리", ["보조배터리"], "개"),
    ("충전기", ["충전기"], "개"),

    # === 패션 ===
    ("나이키 운동화", ["나이키", "운동화"], "켤레"),
    ("나이키 러닝화", ["나이키", "러닝"], "켤레"),
    ("나이키 자켓", ["나이키", "자켓"], "벌"),
    ("나이키 (기타)", ["나이키"], "개"),
    ("아디다스 운동화", ["아디다스", "운동화"], "켤레"),
    ("아디다스 슬리퍼", ["아디다스", "슬리퍼"], "켤레"),
    ("아디다스 (기타)", ["아디다스"], "개"),
    ("뉴발란스", ["뉴발란스"], "개"),
    ("탑텐 반팔티", ["탑텐", "반팔"], "장"),
    ("탑텐 팬츠", ["탑텐", "팬츠"], "벌"),
    ("탑텐 (기타)", ["탑텐"], "개"),
    ("폴햄 맨투맨", ["폴햄", "맨투맨"], "장"),
    ("폴햄 팬츠", ["폴햄", "팬츠"], "벌"),
    ("폴햄 (기타)", ["폴햄"], "개"),
    ("트레킹화", ["트레킹화"], "켤레"),
    ("등산화", ["등산화"], "켤레"),

    # === 통신 ===
    ("알뜰폰 요금제 LG망", ["LG", "알뜰", "요금제"], "월"),
    ("알뜰폰 요금제 (기타)", ["알뜰", "요금제"], "월"),
    ("토스모바일", ["토스모바일"], "월"),

    # === 게임 ===
    ("에픽게임즈 무료게임", ["에픽", "무료"], "개"),
    ("닌텐도 게임", ["닌텐도"], "개"),

    # === 가전 ===
    ("에어프라이어", ["에어프라이어"], "대"),
    ("선크림", ["선크림"], "개"),
    ("칫솔", ["칫솔"], "세트"),
]


def match_product(title: str) -> str:
    """제목에서 가장 구체적인 상품 매칭"""
    title_lower = title.lower()
    for product_name, keywords, unit in PRODUCT_RULES:
        if all(kw.lower() in title_lower for kw in keywords):
            return product_name
    return None


def extract_quantity(title: str) -> tuple:
    """수량 추출 (개수, 단위)"""
    patterns = [
        (r"(\d+)\s*캔", "캔"),
        (r"(\d+)\s*개", "개"),
        (r"(\d+)\s*팩", "팩"),
        (r"(\d+)\s*봉", "봉"),
        (r"(\d+)\s*입", "입"),
        (r"(\d+)\s*박스", "박스"),
        (r"(\d+)\s*롤", "롤"),
        (r"(\d+)\s*매", "매"),
        (r"(\d+)\s*병", "병"),
        (r"x\s*(\d+)", "개"),
        (r"X\s*(\d+)", "개"),
    ]
    for pat, unit in patterns:
        m = re.search(pat, title)
        if m:
            return int(m.group(1)), unit
    return 1, "개"


def main():
    with open(os.path.join(BULK_DIR, "ppomppu_posts.json"), "r", encoding="utf-8") as f:
        posts = json.load(f)

    print(f"데이터: {len(posts)}개 게시글")

    # 상품 매칭
    matched = []
    unmatched = 0
    for p in posts:
        if p["sale_price"] <= 0:
            continue
        product = match_product(p["title"])
        if product:
            qty, unit = extract_quantity(p["title"])
            matched.append({
                **p,
                "product": product,
                "quantity": qty,
                "unit": unit,
            })
        else:
            unmatched += 1

    print(f"매칭: {len(matched)}개 / 미매칭: {unmatched}개\n")

    # 상품별 그룹핑
    by_product = defaultdict(list)
    for m in matched:
        by_product[m["product"]].append(m)

    # 2개 이상 딜이 있는 상품만
    active = {p: items for p, items in by_product.items() if len(items) >= 2}

    print("=" * 80)
    print("상품별 가격 등급표 (뽐뿌 4,001개 딜 기반)")
    print("=" * 80)

    results = {}

    # 카테고리별 그룹
    categories = {
        "음료": ["코카콜라", "펩시", "메가커피", "스타벅스", "카누", "샘물", "삼다수", "매일두유"],
        "즉석밥/라면": ["햇반", "오뚜기", "신라면", "짜파게티", "삼양라면", "진라면", "불닭"],
        "과자/간식": ["오리온", "뿌셔뿌셔"],
        "육류": ["한돈", "닭가슴살", "용가리치킨", "소불고기"],
        "캔/가공식품": ["동원", "참치", "스팸", "비비고", "교자만두", "풀무원", "김치", "포기김치"],
        "유제품/계란": ["특란", "계란", "달걀", "모짜렐라", "치즈"],
        "생활용품": ["크리넥스", "깨끗한나라", "키친타올", "물티슈", "도브", "바세린", "섬유유연제", "부탄가스"],
        "전자기기": ["갤럭시", "아이폰", "아이패드", "에어팟", "레노버", "그램", "로봇청소기", "보조배터리", "충전기"],
        "패션": ["나이키", "아디다스", "뉴발란스", "탑텐", "폴햄", "트레킹화", "등산화"],
        "통신": ["알뜰폰", "토스모바일"],
    }

    for cat_name, cat_keywords in categories.items():
        cat_products = []
        for product_name in sorted(active.keys()):
            if any(kw in product_name for kw in cat_keywords):
                cat_products.append(product_name)

        if not cat_products:
            continue

        print(f"\n{'='*80}")
        print(f"  [{cat_name}]")
        print(f"{'='*80}")

        for product_name in cat_products:
            items = active[product_name]
            prices = [p["sale_price"] for p in items]
            recs = [p["rec_up"] for p in items]

            # 추천 기반 좋은 딜
            avg_rec = statistics.mean(recs) if recs else 0
            good_items = sorted(items, key=lambda x: x["rec_up"], reverse=True)
            top_items = good_items[:max(1, len(good_items) // 3)]
            good_prices = [p["sale_price"] for p in top_items]

            good_avg = int(statistics.mean(good_prices))
            price_avg = int(statistics.mean(prices))
            price_median = int(statistics.median(prices))
            price_min = min(prices)
            price_max = max(prices)

            # 5단계 기준
            tier_godly = int(good_avg * 0.7)  # 역대급
            tier_good = good_avg               # 꿀딜
            tier_ok = price_avg                # 괜찮음
            tier_normal = int(price_avg * 1.2) # 보통
            tier_expensive = int(price_avg * 1.5)  # 비쌈

            print(f"\n  {product_name} ({len(items)}개 딜)")
            print(f"  {'─'*55}")
            print(f"    *** 역대급 꿀딜  : {tier_godly:>10,}원 이하")
            print(f"    **  꿀딜       : {tier_godly:>10,} ~ {tier_good:>10,}원")
            print(f"    *   괜찮음      : {tier_good:>10,} ~ {tier_ok:>10,}원")
            print(f"        보통       : {tier_ok:>10,} ~ {tier_normal:>10,}원")
            print(f"    !   비쌈       : {tier_normal:>10,} ~ {tier_expensive:>10,}원")
            print(f"    !!  바가지      : {tier_expensive:>10,}원 이상")

            # 베스트 딜 예시
            best = good_items[0]
            print(f"    -> 베스트: {best['title'][:55]} ({best['sale_price']:,}원, 추천{best['rec_up']})")

            results[product_name] = {
                "count": len(items),
                "tiers": {
                    "역대급": tier_godly,
                    "꿀딜": tier_good,
                    "괜찮음": tier_ok,
                    "보통": tier_normal,
                    "비쌈": tier_expensive,
                },
                "price_min": price_min,
                "price_max": price_max,
                "price_avg": price_avg,
                "price_median": price_median,
                "avg_rec": round(avg_rec, 1),
                "best_deal": {
                    "title": best["title"][:80],
                    "price": best["sale_price"],
                    "rec": best["rec_up"],
                },
            }

    # 나머지 미분류 상품
    remaining = [p for p in sorted(active.keys()) if p not in [r for r in results.keys()]]
    if remaining:
        print(f"\n{'='*80}")
        print(f"  [기타]")
        print(f"{'='*80}")
        for product_name in remaining:
            items = active[product_name]
            prices = [p["sale_price"] for p in items]
            recs = [p["rec_up"] for p in items]
            good_items = sorted(items, key=lambda x: x["rec_up"], reverse=True)
            top_items = good_items[:max(1, len(good_items) // 3)]
            good_prices = [p["sale_price"] for p in top_items]

            good_avg = int(statistics.mean(good_prices))
            price_avg = int(statistics.mean(prices))
            tier_godly = int(good_avg * 0.7)
            tier_good = good_avg
            tier_ok = price_avg
            tier_normal = int(price_avg * 1.2)
            tier_expensive = int(price_avg * 1.5)

            print(f"\n  {product_name} ({len(items)}개 딜)")
            print(f"  {'─'*55}")
            print(f"    *** 역대급 꿀딜  : {tier_godly:>10,}원 이하")
            print(f"    **  꿀딜       : {tier_godly:>10,} ~ {tier_good:>10,}원")
            print(f"    *   괜찮음      : {tier_good:>10,} ~ {tier_ok:>10,}원")
            print(f"        보통       : {tier_ok:>10,} ~ {tier_normal:>10,}원")
            print(f"    !   비쌈       : {tier_normal:>10,} ~ {tier_expensive:>10,}원")
            print(f"    !!  바가지      : {tier_expensive:>10,}원 이상")

            best = good_items[0]
            print(f"    -> 베스트: {best['title'][:55]} ({best['sale_price']:,}원, 추천{best['rec_up']})")

            results[product_name] = {
                "count": len(items),
                "tiers": {
                    "역대급": tier_godly,
                    "꿀딜": tier_good,
                    "괜찮음": tier_ok,
                    "보통": tier_normal,
                    "비쌈": tier_expensive,
                },
                "price_min": min(prices),
                "price_max": max(prices),
                "price_avg": price_avg,
                "price_median": int(statistics.median(prices)),
                "avg_rec": round(statistics.mean(recs), 1),
                "best_deal": {
                    "title": best["title"][:80],
                    "price": best["sale_price"],
                    "rec": best["rec_up"],
                },
            }

    # 요약 카드
    print(f"\n\n{'='*80}")
    print("  한눈에 보는 적정가격 (꿀딜 기준)")
    print("=" * 80)

    for product_name in sorted(results.keys(), key=lambda x: results[x]["count"], reverse=True):
        r = results[product_name]
        if r["count"] < 3:
            continue
        print(f"  {product_name:25s} | 꿀딜={r['tiers']['꿀딜']:>10,}원 | 보통={r['tiers']['보통']:>10,}원 | 비쌈={r['tiers']['비쌈']:>10,}원+ | ({r['count']}딜)")

    # 저장
    output_path = os.path.join(BULK_DIR, "ppomppu_product_guide.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n저장: {output_path}")


if __name__ == "__main__":
    main()
