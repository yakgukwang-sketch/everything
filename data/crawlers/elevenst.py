"""11번가 쇼킹딜 크롤러"""

import requests
from bs4 import BeautifulSoup
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}


def crawl_shocking_deals() -> list[Deal]:
    """11번가 쇼킹딜 크롤링"""
    deals = []
    url = "https://www.11st.co.kr/html/event/shockingdeal.html"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")

        items = soup.select(".deal_item, .l_deal_item")
        for item in items[:30]:
            try:
                title_tag = item.select_one(".deal_title, .tit_deal")
                price_tag = item.select_one(".deal_price .value, .price_sale .value")
                original_tag = item.select_one(".ori_price .value, .price_origin .value")
                discount_tag = item.select_one(".rate .value, .sale_rate .value")
                link_tag = item.select_one("a")
                img_tag = item.select_one("img")

                if not title_tag:
                    continue

                def parse_price(tag):
                    if not tag:
                        return 0
                    return int(tag.text.strip().replace(",", "").replace("원", ""))

                deals.append(Deal(
                    title=title_tag.text.strip(),
                    url=f"https://www.11st.co.kr{link_tag.get('href', '')}" if link_tag else "",
                    source="11st",
                    sale_price=parse_price(price_tag),
                    original_price=parse_price(original_tag),
                    discount_rate=int(discount_tag.text.strip().replace("%", "")) if discount_tag else 0,
                    image_url=img_tag.get("src", "") if img_tag else "",
                    category="쇼핑",
                ))
            except Exception as e:
                print(f"Parse error: {e}")
                continue

    except Exception as e:
        print(f"11st crawl failed: {e}")

    print(f"[11번가] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_shocking_deals()
    for d in results[:5]:
        print(f"  {d.title} | {d.sale_price}원 ({d.discount_rate}% 할인)")
