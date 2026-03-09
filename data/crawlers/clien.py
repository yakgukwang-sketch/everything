"""클리앙 알뜰구매 크롤러"""

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


def crawl_deals() -> list[Deal]:
    """클리앙 알뜰구매 게시판 크롤링"""
    deals = []
    url = "https://www.clien.net/service/board/jirum"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")

        links = soup.select("a[data-role=list-title-text]")
        for a in links[:30]:
            try:
                title = a.text.strip()
                if not title:
                    continue

                href = a.get("href", "")
                link = f"https://www.clien.net{href}" if href and not href.startswith("http") else href

                # source_id
                id_match = re.search(r"/(\d+)\?", href)
                source_id = id_match.group(1) if id_match else ""

                # 가격 추출 (제목에서)
                price_match = re.search(r"([\d,]+)\s*원", title)
                sale_price = parse_price(price_match.group(1)) if price_match else 0

                # 출처 [XXX] 패턴
                source_match = re.match(r"\[(.+?)\]", title)
                category = source_match.group(1) if source_match else "알뜰구매"

                # 추천수
                parent = a.find_parent(".list_item")
                rec_text = ""
                if parent:
                    rec = parent.select_one(".symph_count")
                    rec_text = rec.text.strip() if rec else "0"

                deals.append(Deal(
                    title=title,
                    url=link,
                    source="clien",
                    source_id=source_id,
                    sale_price=sale_price,
                    category=category,
                    description=f"추천 {rec_text}" if rec_text else "",
                ))
            except Exception as e:
                print(f"  Parse error: {e}")
                continue

    except Exception as e:
        print(f"Clien crawl failed: {e}")

    print(f"[클리앙] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_deals()
    for d in results[:5]:
        print(f"  {d.title} | {d.sale_price}원")
