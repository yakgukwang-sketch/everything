"""퀘사이저존 핫딜 크롤러"""

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
    """퀘사이저존 핫딜 게시판 크롤링"""
    deals = []
    url = "https://quasarzone.com/bbs/qb_saleinfo"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")

        rows = soup.select("div.market-info-list-cont, tr.market-info-list-cont")
        if not rows:
            rows = soup.select(".market-type-list .tit")
            if not rows:
                # fallback to links
                for a in soup.select("a[href*='qb_saleinfo/views']")[:30]:
                    title = a.text.strip()
                    if not title or len(title) < 3:
                        continue
                    href = a.get("href", "")
                    if href and not href.startswith("http"):
                        href = f"https://quasarzone.com{href}"

                    price_match = re.search(r"([\d,]+)\s*원", title)
                    sale_price = parse_price(price_match.group(1)) if price_match else 0

                    source_match = re.match(r"\[(.+?)\]", title)
                    category = source_match.group(1) if source_match else "핫딜"

                    id_match = re.search(r"/(\d+)", href)
                    source_id = id_match.group(1) if id_match else ""

                    deals.append(Deal(
                        title=title,
                        url=href,
                        source="quasarzone",
                        source_id=source_id,
                        sale_price=sale_price,
                        category=category,
                    ))

        for row in rows[:30]:
            try:
                title_tag = row.select_one("a.subject-link, a.tit")
                if not title_tag:
                    continue
                title = title_tag.text.strip()
                href = title_tag.get("href", "")
                if href and not href.startswith("http"):
                    href = f"https://quasarzone.com{href}"

                price_tag = row.select_one(".text-orange, .market-info-sub span")
                sale_price = parse_price(price_tag.text) if price_tag else 0
                if not sale_price:
                    price_match = re.search(r"([\d,]+)\s*원", title)
                    sale_price = parse_price(price_match.group(1)) if price_match else 0

                source_match = re.match(r"\[(.+?)\]", title)
                category = source_match.group(1) if source_match else "핫딜"

                id_match = re.search(r"/(\d+)", href)
                source_id = id_match.group(1) if id_match else ""

                deals.append(Deal(
                    title=title,
                    url=href,
                    source="quasarzone",
                    source_id=source_id,
                    sale_price=sale_price,
                    category=category,
                ))
            except Exception as e:
                print(f"  Parse error: {e}")
                continue

    except Exception as e:
        print(f"Quasarzone crawl failed: {e}")

    print(f"[퀘사이저존] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_hotdeal()
    for d in results[:5]:
        print(f"  {d.title} | {d.sale_price}원")
