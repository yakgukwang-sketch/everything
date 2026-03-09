"""GS샵 TV 현재 방송 상품 크롤러"""

import requests
from bs4 import BeautifulSoup
import re
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

TV_URL = "https://www.gsshop.com/shop/sect/sectL.gs?sectid=1378"


def parse_price(text: str) -> int:
    nums = re.findall(r"[\d]+", text.replace(",", ""))
    if nums:
        try:
            return int(nums[0])
        except ValueError:
            pass
    return 0


def crawl_hotdeal() -> list[Deal]:
    """GS샵 TV 현재 방송 상품 크롤링"""
    deals = []

    try:
        resp = requests.get(TV_URL, headers=HEADERS, timeout=10)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")

        items = soup.select(".prd-item")
        for item in items:
            try:
                # 상품명: .prd-name 안의 a 태그 텍스트
                name_link = item.select_one(".prd-name a")
                if not name_link:
                    continue

                # a 태그 텍스트에서 [TV상품] 등 태그 제거
                title = name_link.get_text(strip=True)
                title = re.sub(r"\[TV상품\]|\[TV\]", "", title).strip()
                if not title:
                    continue

                # 링크
                href = name_link.get("href", "")
                if href and not href.startswith("http"):
                    href = f"https://www.gsshop.com{href}"

                # source_id
                id_match = re.search(r"lseq=(\w+)", href)
                source_id = id_match.group(1) if id_match else ""

                # 판매가: .set-price strong
                price_el = item.select_one(".set-price strong")
                sale_price = parse_price(price_el.text) if price_el else 0

                # 원가: del.price-upper
                orig_el = item.select_one("del.price-upper")
                original_price = parse_price(orig_el.text) if orig_el else 0

                # 할인율
                rate_el = item.select_one(".price-discount span")
                discount_rate = 0
                if rate_el:
                    rate_match = re.search(r"(\d+)", rate_el.text)
                    discount_rate = int(rate_match.group(1)) if rate_match else 0

                # 이미지: img alt 속성이 상품명
                img_el = item.select_one("img")
                image_url = ""
                if img_el:
                    image_url = img_el.get("src", "")
                    if image_url and image_url.startswith("//"):
                        image_url = f"https:{image_url}"

                deals.append(Deal(
                    title=title,
                    url=href,
                    source="gsshop",
                    source_id=source_id,
                    sale_price=sale_price,
                    original_price=original_price,
                    discount_rate=discount_rate,
                    image_url=image_url,
                    category="TV쇼핑",
                ))
            except Exception as e:
                print(f"  Parse error: {e}")
                continue

    except Exception as e:
        print(f"GS샵 crawl failed: {e}")

    print(f"[GS샵] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_hotdeal()
    for d in results[:10]:
        print(f"  {d.title} | {d.sale_price}원")
