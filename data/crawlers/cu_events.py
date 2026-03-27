"""CU 편의점 행사 크롤러 — 1+1, 2+1 상품 수집"""

import requests
from bs4 import BeautifulSoup
import time
import json
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

AJAX_URL = "https://cu.bgfretail.com/event/plusAjax.do"

# searchCondition: "" = 전체, "23" = 1+1, "24" = 2+1
EVENT_TYPES = {
    "": "전체",
    "23": "1+1",
    "24": "2+1",
}


def crawl_events(event_filter: str = "", max_pages: int = 100) -> list[Deal]:
    """CU 행사 상품 크롤링

    Args:
        event_filter: "" = 전체, "23" = 1+1만, "24" = 2+1만
        max_pages: 최대 페이지 수
    """
    all_deals = []
    page = 1

    while page <= max_pages:
        try:
            resp = requests.post(AJAX_URL, data={
                "pageIndex": page,
                "listType": "1",
                "searchCondition": event_filter,
            }, headers=HEADERS, timeout=10)

            soup = BeautifulSoup(resp.text, "html.parser")
            items = soup.select("li.prod_list")

            if not items:
                break

            for item in items:
                try:
                    # 상품명
                    name_el = item.select_one(".name p")
                    if not name_el:
                        continue
                    name = name_el.text.strip()

                    # 가격
                    price_el = item.select_one(".price strong")
                    price = int(price_el.text.strip().replace(",", "")) if price_el else 0

                    # 이미지
                    img_el = item.select_one(".prod_img img")
                    image_url = ""
                    if img_el:
                        src = img_el.get("src", "")
                        if src.startswith("//"):
                            image_url = f"https:{src}"
                        elif src:
                            image_url = src

                    # 행사 유형
                    event_type = ""
                    if item.select_one(".plus1"):
                        event_type = "1+1"
                    elif item.select_one(".plus2"):
                        event_type = "2+1"

                    # 태그 (new, best)
                    tags = []
                    if item.select_one(".new"):
                        tags.append("NEW")
                    if item.select_one(".best"):
                        tags.append("BEST")

                    # 상품 ID
                    source_id = ""
                    a_el = item.select_one("a[href*='view']")
                    if a_el:
                        href = a_el.get("href", "")
                        if "(" in href:
                            source_id = href.split("(")[1].rstrip(");'\"")

                    desc_parts = [event_type]
                    if tags:
                        desc_parts.append(" ".join(tags))
                    description = " | ".join(desc_parts)

                    all_deals.append(Deal(
                        title=f"[CU {event_type}] {name}",
                        url=f"https://cu.bgfretail.com/event/plus.do",
                        source="cu",
                        source_id=f"cu_{source_id}" if source_id else f"cu_{name}",
                        sale_price=price,
                        image_url=image_url,
                        category="편의점",
                        description=description,
                    ))

                except Exception:
                    continue

            if page % 10 == 0 or page == 1:
                print(f"  [CU] 페이지 {page}: {len(items)}개 (누적 {len(all_deals)})")

            page += 1
            time.sleep(0.3)

        except Exception as e:
            print(f"  [CU] 페이지 {page} 실패: {e}")
            page += 1
            time.sleep(1)

    print(f"[CU] 총 {len(all_deals)}개 행사 상품 수집")
    return all_deals


if __name__ == "__main__":
    deals = crawl_events(max_pages=2)
    for d in deals[:10]:
        print(f"  {d.title} — {d.sale_price}원 | {d.image_url[:50]}...")
    print(f"\n총 {len(deals)}개")
