"""뽐뿌 게시판 크롤러"""

import requests
from bs4 import BeautifulSoup
import re
import time
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

BASE_URL = "https://www.ppomppu.co.kr/zboard/zboard.php?id=ppomppu"
MAX_PAGES = 5


def parse_price(text: str) -> int:
    """가격 문자열에서 숫자 추출"""
    nums = re.findall(r"[\d,]+", text)
    for n in nums:
        val = int(n.replace(",", ""))
        if val > 0:
            return val
    return 0


def parse_page(soup) -> list[Deal]:
    """한 페이지에서 게시글 파싱"""
    deals = []
    links = soup.select('a[href*="view.php?id=ppomppu"]')
    seen = set()

    for a in links:
        try:
            title = a.text.strip()
            if not title or len(title) < 5:
                continue

            href = a.get("href", "")
            no_match = re.search(r"no=(\d+)", href)
            if not no_match:
                continue
            source_id = no_match.group(1)

            if source_id in seen:
                continue
            seen.add(source_id)

            link = f"https://www.ppomppu.co.kr/zboard/{href}" if not href.startswith("http") else href

            # 가격 추출
            price_match = re.search(r"([\d,]+)\s*원", title)
            sale_price = parse_price(price_match.group(1)) if price_match else 0

            # 출처 추출 [XXX] 패턴
            source_match = re.match(r"\[(.+?)\]", title)
            category = source_match.group(1) if source_match else "핫딜"

            # 추천수, 조회수 (부모 tr에서)
            parent_tr = a.find_parent("tr")
            recommendations = 0
            views = 0
            image_url = ""

            if parent_tr:
                tds = parent_tr.select("td")
                if len(tds) >= 5:
                    rec_text = tds[4].text.strip()
                    rec_match = re.search(r"(\d+)\s*-\s*(\d+)", rec_text)
                    if rec_match:
                        recommendations = int(rec_match.group(1)) - int(rec_match.group(2))
                if len(tds) >= 6:
                    views_text = tds[5].text.strip().replace(",", "")
                    if views_text.isdigit():
                        views = int(views_text)

                # 이미지: ppomppu CDN 여러 도메인 + 일반 img 폴백
                img = parent_tr.select_one('img[src*="ppomppu.co.kr"]')
                if not img:
                    # 아이콘/이모지 제외, 실제 썸네일만
                    for candidate in parent_tr.select("img[src]"):
                        src = candidate.get("src", "")
                        if any(skip in src for skip in ["icon", "blank", "spacer", "btn", "arrow", "emoji", "smiley"]):
                            continue
                        if candidate.get("width") and int(candidate.get("width", "0") or "0") < 30:
                            continue
                        img = candidate
                        break
                if img:
                    image_url = img.get("src", "")
                    if image_url.startswith("//"):
                        image_url = f"https:{image_url}"
                    elif image_url and not image_url.startswith("http"):
                        image_url = f"https://www.ppomppu.co.kr{image_url}"

            deals.append(Deal(
                title=title,
                url=link,
                source="ppomppu",
                source_id=source_id,
                sale_price=sale_price,
                image_url=image_url,
                category=category,
                description=f"추천 {recommendations} | 조회 {views}" if views > 0 else "",
            ))

        except Exception as e:
            print(f"  Parse error: {e}")
            continue

    return deals


def crawl_hotdeal() -> list[Deal]:
    """뽐뿌 게시판 크롤링 (여러 페이지)"""
    all_deals = []

    for page in range(1, MAX_PAGES + 1):
        try:
            url = f"{BASE_URL}&page={page}"
            resp = requests.get(url, headers=HEADERS, timeout=10)
            text = resp.content.decode("euc-kr", errors="replace")
            soup = BeautifulSoup(text, "html.parser")

            deals = parse_page(soup)
            if not deals:
                break

            all_deals.extend(deals)
            print(f"  [뽐뿌] 페이지 {page}: {len(deals)}개")

            if page < MAX_PAGES:
                time.sleep(1)

        except Exception as e:
            print(f"  [뽐뿌] 페이지 {page} 실패: {e}")
            break

    print(f"[뽐뿌] 총 {len(all_deals)}개 수집")
    return all_deals


if __name__ == "__main__":
    results = crawl_hotdeal()
    for d in results[:10]:
        print(f"  [{d.category}] {d.title[:50]} | {d.sale_price}원 | {d.description}")
