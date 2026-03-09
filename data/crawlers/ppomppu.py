"""뽐뿌 핫딜 크롤러"""

import requests
from bs4 import BeautifulSoup
import re
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}


def parse_price(text: str) -> int:
    """가격 문자열에서 숫자 추출"""
    nums = re.findall(r"[\d,]+", text)
    for n in nums:
        val = int(n.replace(",", ""))
        if val > 0:
            return val
    return 0


def crawl_hotdeal() -> list[Deal]:
    """뽐뿌 핫딜 게시판 크롤링"""
    deals = []
    url = "https://www.ppomppu.co.kr/zboard/zboard.php?id=ppomppu"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        text = resp.content.decode("euc-kr", errors="replace")
        soup = BeautifulSoup(text, "html.parser")

        links = soup.select('a[href*="view.php?id=ppomppu"]')
        seen = set()

        for a in links:
            try:
                title = a.text.strip()
                if not title or len(title) < 5:
                    continue

                href = a.get("href", "")
                # no= 추출
                no_match = re.search(r"no=(\d+)", href)
                if not no_match:
                    continue
                source_id = no_match.group(1)

                if source_id in seen:
                    continue
                seen.add(source_id)

                link = f"https://www.ppomppu.co.kr/zboard/{href}" if not href.startswith("http") else href

                # 가격 추출 (제목에서 "XX,XXX원" 패턴)
                price_match = re.search(r"([\d,]+)\s*원", title)
                sale_price = parse_price(price_match.group(1)) if price_match else 0

                # 출처 추출 [XXX] 패턴
                source_match = re.match(r"\[(.+?)\]", title)
                category = source_match.group(1) if source_match else "핫딜"

                # 이미지 (부모 tr에서 찾기)
                parent_tr = a.find_parent("tr")
                image_url = ""
                if parent_tr:
                    img = parent_tr.select_one("img.thumb_border, img.baseList-img")
                    if img:
                        image_url = img.get("src", "")
                        if image_url and not image_url.startswith("http"):
                            image_url = f"https:{image_url}" if image_url.startswith("//") else f"https://www.ppomppu.co.kr{image_url}"

                deals.append(Deal(
                    title=title,
                    url=link,
                    source="ppomppu",
                    source_id=source_id,
                    sale_price=sale_price,
                    image_url=image_url,
                    category=category,
                ))

                if len(deals) >= 30:
                    break

            except Exception as e:
                print(f"  Parse error: {e}")
                continue

    except Exception as e:
        print(f"Ppomppu crawl failed: {e}")

    print(f"[뽐뿌] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_hotdeal()
    for d in results[:5]:
        print(f"  {d.title} | {d.sale_price}원 | {d.category}")
