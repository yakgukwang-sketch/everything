"""11번가 베스트셀러 크롤러"""

import requests
from bs4 import BeautifulSoup
import re
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}


def parse_price(text: str) -> int:
    nums = re.findall(r"[\d]+", text.replace(",", ""))
    if nums:
        try:
            return int(nums[0])
        except ValueError:
            pass
    return 0


def crawl_hotdeal() -> list[Deal]:
    """11번가 베스트셀러 크롤링"""
    deals = []
    url = "https://www.11st.co.kr/browsing/BestSeller.tmall?method=getBestSellerMain"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(resp.content, "html.parser", from_encoding="euc-kr")

        # Top 20 (c-card-item)
        cards = soup.select(".c-card-item")
        for card in cards:
            try:
                name_el = card.select_one(".c-card-item__name")
                price_el = card.select_one(".c-card-item__price")
                link_el = card.select_one("a")

                if not name_el:
                    continue

                title = name_el.text.strip()
                # "상품명" 접두사 제거
                if title.startswith("상품명"):
                    title = title[3:]
                if not title:
                    continue

                href = link_el.get("href", "") if link_el else ""
                if href and not href.startswith("http"):
                    href = f"https://www.11st.co.kr{href}"

                id_match = re.search(r"/(\d+)$", href)
                source_id = id_match.group(1) if id_match else ""

                sale_price = parse_price(price_el.text) if price_el else 0

                deals.append(Deal(
                    title=title,
                    url=href,
                    source="11st",
                    source_id=source_id,
                    sale_price=sale_price,
                    category="베스트",
                ))
            except Exception as e:
                print(f"  Parse error (card): {e}")
                continue

    except Exception as e:
        print(f"11st crawl failed: {e}")

    print(f"[11번가] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_hotdeal()
    for d in results[:10]:
        print(f"  {d.title} | {d.sale_price}원")
