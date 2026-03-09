"""쿠팡 골드박스/특가 크롤러"""

import requests
from bs4 import BeautifulSoup
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}


def crawl_goldbox() -> list[Deal]:
    """쿠팡 골드박스 크롤링"""
    deals = []
    url = "https://www.coupang.com/np/goldbox"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")

        items = soup.select(".baby-product-link")
        for item in items[:30]:
            try:
                title = item.select_one(".descriptions .name")
                if not title:
                    continue

                price_tag = item.select_one(".price-value")
                original_tag = item.select_one(".base-price")
                discount_tag = item.select_one(".discount-percentage")
                img_tag = item.select_one("img")
                link = item.get("href", "")

                sale_price = int(price_tag.text.replace(",", "")) if price_tag else 0
                original_price = int(original_tag.text.replace(",", "")) if original_tag else 0
                discount_rate = int(discount_tag.text.replace("%", "")) if discount_tag else 0

                deals.append(Deal(
                    title=title.text.strip(),
                    url=f"https://www.coupang.com{link}" if link.startswith("/") else link,
                    source="coupang",
                    source_id=link.split("/")[-1] if link else "",
                    sale_price=sale_price,
                    original_price=original_price,
                    discount_rate=discount_rate,
                    image_url=img_tag.get("src", "") if img_tag else "",
                    category="쇼핑",
                ))
            except Exception as e:
                print(f"Parse error: {e}")
                continue

    except Exception as e:
        print(f"Coupang crawl failed: {e}")

    print(f"[쿠팡] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_goldbox()
    for d in results[:5]:
        print(f"  {d.title} | {d.sale_price}원 ({d.discount_rate}% 할인)")
