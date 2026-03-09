"""루리웹 핫딜 크롤러"""

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
    """루리웹 핫딜 게시판 크롤링"""
    deals = []
    url = "https://bbs.ruliweb.com/market/board/1020"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")

        rows = soup.select("tr.table_body.blocktarget")
        for row in rows[:30]:
            try:
                title_tag = row.select_one("a.deco")
                if not title_tag:
                    continue

                title = re.sub(r"\s*\(\d+\)\s*$", "", title_tag.text.strip())
                link = title_tag.get("href", "")
                if link and not link.startswith("http"):
                    link = f"https://bbs.ruliweb.com{link}"

                # 날짜
                date_tag = row.select_one(".time")
                posted_at = date_tag.text.strip() if date_tag else ""

                # 추천
                recommend = row.select_one(".recomd")
                rec_text = recommend.text.strip() if recommend else "0"

                # 가격 추출 (제목에서)
                price_match = re.search(r"(\d[\d,]*)\s*원", title)
                sale_price = parse_price(price_match.group(1)) if price_match else 0

                deals.append(Deal(
                    title=title,
                    url=link,
                    source="ruliweb",
                    source_id=link.split("/")[-1] if link else "",
                    sale_price=sale_price,
                    category="핫딜",
                    posted_at=posted_at,
                    description=f"추천 {rec_text}",
                ))
            except Exception as e:
                print(f"  Parse error: {e}")
                continue

    except Exception as e:
        print(f"Ruliweb crawl failed: {e}")

    print(f"[루리웹] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_hotdeal()
    for d in results[:5]:
        print(f"  {d.title} | {d.sale_price}원")
