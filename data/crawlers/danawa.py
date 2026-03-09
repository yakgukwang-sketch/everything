"""다나와 가격비교 크롤러"""

import requests
from bs4 import BeautifulSoup
import re
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

# 인기 카테고리
CATEGORIES = {
    "노트북": "112758",
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
    """다나와 인기상품 크롤링"""
    deals = []

    for cat_name, cat_id in CATEGORIES.items():
        try:
            url = f"https://prod.danawa.com/list/?cate={cat_id}&sort=saveDESC"
            resp = requests.get(url, headers=HEADERS, timeout=10)
            resp.encoding = "utf-8"
            soup = BeautifulSoup(resp.text, "html.parser")

            items = soup.select(".prod_main_info")
            for item in items:
                try:
                    name_el = item.select_one(".prod_name a")
                    if not name_el:
                        continue

                    title = name_el.text.strip()
                    if not title:
                        continue

                    # 링크
                    href = name_el.get("href", "")
                    if href and not href.startswith("http"):
                        href = f"https://prod.danawa.com{href}"

                    # source_id
                    id_match = re.search(r"pcode=(\d+)", href)
                    source_id = id_match.group(1) if id_match else ""

                    # 가격
                    price_el = item.select_one(".price_sect a")
                    sale_price = parse_price(price_el.text) if price_el else 0

                    # 스펙
                    spec_el = item.select_one(".spec_list")
                    spec = spec_el.text.strip()[:120] if spec_el else ""

                    # 가격 없는 광고 상품 건너뛰기
                    if sale_price == 0:
                        continue

                    deals.append(Deal(
                        title=title,
                        url=href,
                        source="danawa",
                        source_id=source_id,
                        sale_price=sale_price,
                        category=cat_name,
                        description=spec,
                    ))
                except Exception as e:
                    print(f"  Parse error: {e}")
                    continue

        except Exception as e:
            print(f"Danawa {cat_name} crawl failed: {e}")

    print(f"[다나와] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_hotdeal()
    for d in results[:10]:
        print(f"  {d.title} | {d.sale_price}원 | {d.category}")
