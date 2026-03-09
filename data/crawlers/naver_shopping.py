"""네이버 쇼핑 최저가/특가 크롤러"""

import requests
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://search.shopping.naver.com/",
}


def crawl_deals(keyword: str = "오늘의 특가", limit: int = 30) -> list[Deal]:
    """네이버 쇼핑 검색 크롤링"""
    deals = []
    url = "https://search.shopping.naver.com/api/search/all"
    params = {
        "query": keyword,
        "sort": "rel",
        "pagingIndex": 1,
        "pagingSize": limit,
    }

    try:
        resp = requests.get(url, params=params, headers=HEADERS, timeout=10)
        data = resp.json()

        items = data.get("shoppingResult", {}).get("products", [])
        for item in items:
            try:
                low_price = int(item.get("lowPrice", 0))
                high_price = int(item.get("highPrice", 0)) or low_price
                discount = round((1 - low_price / high_price) * 100) if high_price > low_price else 0

                deals.append(Deal(
                    title=item.get("productName", ""),
                    url=item.get("mallProductUrl") or item.get("crUrl", ""),
                    source="naver_shopping",
                    source_id=str(item.get("id", "")),
                    sale_price=low_price,
                    original_price=high_price,
                    discount_rate=discount,
                    image_url=item.get("imageUrl", ""),
                    category=item.get("category1Name", "쇼핑"),
                ))
            except Exception as e:
                print(f"Parse error: {e}")
                continue

    except Exception as e:
        print(f"Naver Shopping crawl failed: {e}")

    print(f"[네이버쇼핑] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_deals("특가")
    for d in results[:5]:
        print(f"  {d.title} | {d.sale_price}원 ({d.discount_rate}% 할인)")
