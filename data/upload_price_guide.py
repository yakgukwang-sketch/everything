"""상품별 적정가격 가이드를 API에 업로드"""

import json
import os
import sys
import io
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

API_URL = os.environ.get("API_URL", "https://everything-api.deri58.workers.dev")
API_KEY = os.environ.get("ADMIN_API_KEY", "")
BULK_DIR = os.path.join(os.path.dirname(__file__), "bulk_output")


def load_guide():
    path = os.path.join(BULK_DIR, "ppomppu_product_guide.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def upload():
    guide = load_guide()

    # API 형식으로 변환
    items = []
    for product_name, data in guide.items():
        tiers = data["tiers"]
        best = data.get("best_deal", {})

        # 카테고리 추정
        category = "기타"
        cat_map = {
            "음료": ["콜라", "펩시", "커피", "카누", "샘물", "삼다수", "두유", "스타벅스", "메가커피"],
            "즉석밥/라면": ["햇반", "오뚜기", "신라면", "짜파게티", "삼양", "진라면", "불닭"],
            "과자/간식": ["오리온", "초코", "뿌셔"],
            "육류": ["한돈", "삼겹", "목살", "닭가슴살", "용가리", "소불고기"],
            "캔/가공식품": ["동원", "참치", "스팸", "비비고", "만두", "김치"],
            "유제품/계란": ["특란", "계란", "달걀", "치즈", "모짜렐라"],
            "생활용품": ["크리넥스", "화장지", "키친타올", "물티슈", "도브", "바세린", "섬유유연제", "세제", "부탄가스", "칫솔", "선크림"],
            "전자기기": ["갤럭시", "아이폰", "아이패드", "에어팟", "레노버", "그램", "로봇청소기", "보조배터리", "충전기"],
            "패션": ["나이키", "아디다스", "뉴발란스", "탑텐", "폴햄", "트레킹", "등산화"],
            "통신": ["알뜰폰", "토스모바일", "요금제"],
            "게임": ["닌텐도", "에픽"],
            "가전": ["에어프라이어"],
        }
        for cat, keywords in cat_map.items():
            if any(kw in product_name for kw in keywords):
                category = cat
                break

        items.append({
            "product": product_name,
            "category": category,
            "deal_count": data["count"],
            "price_avg": data["price_avg"],
            "price_median": data["price_median"],
            "price_min": data["price_min"],
            "price_max": data["price_max"],
            "price_godly": tiers["역대급"],
            "price_good": tiers["꿀딜"],
            "price_normal": tiers["보통"],
            "price_expensive": tiers["비쌈"],
            "avg_rec": data["avg_rec"],
            "best_deal_title": best.get("title", ""),
            "best_deal_price": best.get("price", 0),
            "best_deal_rec": best.get("rec", 0),
        })

    print(f"총 {len(items)}개 상품 가격 가이드")

    if not API_KEY:
        print("ADMIN_API_KEY 환경변수가 설정되지 않았습니다")
        print("로컬 저장만 수행합니다")

        # API 업로드 형식으로 저장
        output_path = os.path.join(BULK_DIR, "price_guide_upload.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        print(f"저장: {output_path}")

        # 카테고리별 요약
        from collections import Counter
        cats = Counter(i["category"] for i in items)
        print("\n카테고리별:")
        for cat, cnt in cats.most_common():
            print(f"  {cat}: {cnt}개")
        return

    # API 업로드
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    # 100개씩 배치
    batch_size = 100
    total_inserted = 0
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        resp = requests.post(
            f"{API_URL}/api/price-guide",
            headers=headers,
            json=batch,
            timeout=30,
        )
        if resp.status_code == 200:
            result = resp.json()
            total_inserted += result.get("inserted", 0)
            print(f"  배치 {i // batch_size + 1}: {result.get('inserted', 0)}개 업로드")
        else:
            print(f"  배치 {i // batch_size + 1} 실패: {resp.status_code} {resp.text[:200]}")

    print(f"\n업로드 완료: {total_inserted}개")


if __name__ == "__main__":
    upload()
