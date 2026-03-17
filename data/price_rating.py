"""브랜드별 가격 등급 판정기 - 꿀딜/괜찮음/보통/비쌈/바가지"""

import json
import os
import sys
import io
import statistics
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BULK_DIR = os.path.join(os.path.dirname(__file__), "bulk_output")


def load_guide():
    with open(os.path.join(BULK_DIR, "ppomppu_brand_guide.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def rate_price(brand_data: dict, price: int) -> str:
    """가격 등급 판정
    - 꿀딜: 추천 많았던 딜 평균가 이하
    - 괜찮음: 전체 평균 이하
    - 보통: 전체 평균 ~ 75퍼센타일
    - 비쌈: 75퍼센타일 이상
    - 바가지: 최고가 근처
    """
    good = brand_data["good_deal_price_avg"]
    avg = brand_data["price_avg"]
    median = brand_data["price_median"]
    p_max = brand_data["price_max"]

    if price <= good * 0.8:
        return "역대급 꿀딜"
    elif price <= good:
        return "꿀딜"
    elif price <= avg:
        return "괜찮음"
    elif price <= avg * 1.3:
        return "보통"
    elif price <= p_max * 0.8:
        return "비쌈"
    else:
        return "바가지"


def build_rating_table():
    """전체 브랜드별 가격 등급표 생성"""
    data = load_guide()
    brands = data["brand_guide"]

    print("=" * 80)
    print("브랜드별 가격 등급표 (뽐뿌 4,001개 딜 기반)")
    print("=" * 80)

    results = {}

    for cat_name in ["식품/음료", "전자기기", "패션/의류", "생활용품", "건강/영양제",
                      "가전/주방", "통신/요금제", "게임/디지털", "기타"]:
        cat_brands = {b: d for b, d in brands.items() if d["main_category"] == cat_name}
        if not cat_brands:
            continue

        print(f"\n{'='*80}")
        print(f"  {cat_name}")
        print(f"{'='*80}")

        for brand in sorted(cat_brands.keys(), key=lambda x: cat_brands[x]["total_deals"], reverse=True):
            bd = cat_brands[brand]
            good = bd["good_deal_price_avg"]
            avg = bd["price_avg"]
            p_max = bd["price_max"]

            # 5단계 가격 기준선
            tiers = {
                "역대급 꿀딜": f"{int(good * 0.8):,}원 이하",
                "꿀딜": f"{int(good * 0.8):,}~{good:,}원",
                "괜찮음": f"{good:,}~{avg:,}원",
                "보통": f"{avg:,}~{int(avg * 1.3):,}원",
                "비쌈": f"{int(avg * 1.3):,}~{int(p_max * 0.8):,}원",
                "바가지": f"{int(p_max * 0.8):,}원 이상",
            }

            print(f"\n  [{brand}] (딜 {bd['total_deals']}개, 평균추천 {bd['avg_rec']})")
            print(f"  {'─'*55}")

            emoji_map = {
                "역대급 꿀딜": "***",
                "꿀딜": "** ",
                "괜찮음": "*  ",
                "보통": "   ",
                "비쌈": "!  ",
                "바가지": "!! ",
            }

            for tier, price_range in tiers.items():
                marker = emoji_map[tier]
                print(f"    {marker} {tier:8s} : {price_range}")

            # 실제 좋았던 딜 예시
            if bd.get("sample_good_deals"):
                best = bd["sample_good_deals"][0]
                print(f"    -> 베스트 딜: {best['title'][:45]} ({best['price']:,}원, 추천{best['rec']})")

            results[brand] = {
                "category": cat_name,
                "total_deals": bd["total_deals"],
                "tiers": {
                    "역대급 꿀딜": int(good * 0.8),
                    "꿀딜": good,
                    "괜찮음": avg,
                    "보통": int(avg * 1.3),
                    "비쌈": int(p_max * 0.8),
                },
                "best_deal": bd["sample_good_deals"][0] if bd.get("sample_good_deals") else None,
            }

    # 저장
    output_path = os.path.join(BULK_DIR, "ppomppu_price_ratings.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n\n저장: {output_path}")

    # 요약 카드
    print("\n" + "=" * 80)
    print("  빠른 요약: 이 가격이면 사!")
    print("=" * 80)

    highlights = [
        ("메가커피", "아메리카노"),
        ("코카콜라", "48캔"),
        ("농심", "신라면 20개"),
        ("오리온", "초코칩"),
        ("동원", "참치/샘물"),
        ("풀무원", "샘물/만두"),
        ("오뚜기", "즉석밥/피자"),
        ("CJ", "햇반/스팸"),
        ("나이키", "운동화/자켓"),
        ("아디다스", "운동화"),
        ("삼성", "갤럭시/가전"),
        ("필립스", "전자기기"),
        ("크리넥스", "화장지"),
        ("탑텐", "의류"),
    ]

    for brand, product in highlights:
        if brand in brands:
            bd = brands[brand]
            good = bd["good_deal_price_avg"]
            avg = bd["price_avg"]
            print(f"  {brand:8s} ({product:10s}) : {good:>10,}원 이하 = 꿀딜 | {avg:>10,}원 = 보통 | {int(avg*1.3):>10,}원+ = 비쌈")

    return results


if __name__ == "__main__":
    build_rating_table()
