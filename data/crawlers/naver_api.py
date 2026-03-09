"""네이버 쇼핑 검색 공식 API 크롤러

가입: https://developers.naver.com
1. 애플리케이션 등록 → 사용 API: "검색" 선택
2. Client ID / Client Secret 발급
무료, 일 25,000회

환경변수:
  NAVER_CLIENT_ID=...
  NAVER_CLIENT_SECRET=...
"""

import os
import requests
from .base import Deal

CLIENT_ID = os.getenv("NAVER_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET", "")


def crawl_hotdeal(keywords: list[str] | None = None) -> list[Deal]:
    """네이버 쇼핑 검색 API로 상품 수집"""
    if not CLIENT_ID or not CLIENT_SECRET:
        print("[네이버API] API 키 미설정 (NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)")
        return []

    if keywords is None:
        keywords = ["오늘의특가", "핫딜", "타임세일"]

    deals = []

    for keyword in keywords:
        try:
            resp = requests.get(
                "https://openapi.naver.com/v1/search/shop.json",
                params={
                    "query": keyword,
                    "display": 20,
                    "sort": "date",
                },
                headers={
                    "X-Naver-Client-Id": CLIENT_ID,
                    "X-Naver-Client-Secret": CLIENT_SECRET,
                },
                timeout=10,
            )

            if resp.status_code != 200:
                print(f"  네이버 API {resp.status_code}: {keyword}")
                continue

            data = resp.json()
            items = data.get("items", [])

            for item in items:
                # HTML 태그 제거
                title = item.get("title", "").replace("<b>", "").replace("</b>", "")
                low_price = int(item.get("lprice", 0))
                high_price = int(item.get("hprice", 0)) or low_price
                discount = round((1 - low_price / high_price) * 100) if high_price > low_price else 0

                deals.append(Deal(
                    title=title,
                    url=item.get("link", ""),
                    source="naver_shopping",
                    source_id=str(item.get("productId", "")),
                    sale_price=low_price,
                    original_price=high_price,
                    discount_rate=discount,
                    image_url=item.get("image", ""),
                    category=item.get("category1", "쇼핑"),
                ))

        except Exception as e:
            print(f"  네이버 API error ({keyword}): {e}")

    # 중복 제거 (productId 기준)
    seen = set()
    unique = []
    for d in deals:
        if d.source_id and d.source_id not in seen:
            seen.add(d.source_id)
            unique.append(d)
        elif not d.source_id:
            unique.append(d)
    deals = unique

    print(f"[네이버API] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_hotdeal()
    for d in results[:5]:
        print(f"  {d.title} | {d.sale_price}원 ({d.discount_rate}%)")
