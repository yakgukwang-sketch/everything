"""GS25 편의점 행사 크롤러 — 1+1, 2+1 상품 수집 (JSON API)"""

import requests
import json
import time
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
}

EVENT_PAGE_URL = "http://gs25.gsretail.com/gscvs/ko/products/event-goods.do"
SEARCH_URL = "http://gs25.gsretail.com/gscvs/ko/products/event-goods-search"

EVENT_TYPES = ["ONE_TO_ONE", "TWO_TO_ONE", "GIFT"]
EVENT_LABELS = {"ONE_TO_ONE": "1+1", "TWO_TO_ONE": "2+1", "GIFT": "덤증정"}


def get_csrf_token(session: requests.Session) -> str:
    """이벤트 페이지에서 CSRF 토큰 추출"""
    resp = session.get(EVENT_PAGE_URL, headers=HEADERS, timeout=10)
    # CSRFToken은 hidden input이나 meta 태그에 있음
    text = resp.text
    # <input type="hidden" name="CSRFToken" value="...">
    import re
    match = re.search(r'name=["\']CSRFToken["\']\s+value=["\']([^"\']+)', text)
    if match:
        return match.group(1)
    # meta 태그
    match = re.search(r'content=["\']([^"\']+)["\']\s+name=["\']csrf', text)
    if match:
        return match.group(1)
    return ""


def crawl_events(event_types: list[str] = None, page_size: int = 100) -> list[Deal]:
    """GS25 행사 상품 크롤링

    Args:
        event_types: ["ONE_TO_ONE", "TWO_TO_ONE", "GIFT"] 중 선택. None이면 전체.
        page_size: 페이지당 상품 수 (최대 100)
    """
    types = event_types or EVENT_TYPES
    all_deals = []
    session = requests.Session()

    # CSRF 토큰 획득
    csrf = get_csrf_token(session)
    if not csrf:
        print("[GS25] CSRF 토큰 획득 실패 — 토큰 없이 시도")

    for etype in types:
        label = EVENT_LABELS.get(etype, etype)
        page = 1

        while True:
            try:
                data = {
                    "pageNum": page,
                    "pageSize": page_size,
                    "parameterList": etype,
                }
                if csrf:
                    data["CSRFToken"] = csrf

                resp = session.post(SEARCH_URL, data=data, headers=HEADERS, timeout=15)
                raw = resp.json()

                # GS25는 이중 JSON 인코딩 — 문자열 안에 JSON
                if isinstance(raw, str):
                    raw = json.loads(raw)

                pagination = raw.get("pagination", {})
                results = raw.get("results", [])

                if not results:
                    break

                for item in results:
                    try:
                        name = item.get("goodsNm", "").strip()
                        if not name:
                            continue

                        price = int(item.get("price", 0))
                        image_url = item.get("attFileNm", "")
                        event_label = item.get("eventTypeNm", label)

                        all_deals.append(Deal(
                            title=f"[GS25 {event_label}] {name}",
                            url="http://gs25.gsretail.com/gscvs/ko/products/event-goods.do",
                            source="gs25",
                            source_id=f"gs25_{item.get('goodsCd', name)}",
                            sale_price=price,
                            image_url=image_url,
                            category="편의점",
                            description=event_label,
                        ))
                    except Exception:
                        continue

                total_pages = pagination.get("numberOfPages", 1)
                if page % 5 == 0 or page == 1:
                    print(f"  [GS25 {label}] 페이지 {page}/{total_pages}: {len(results)}개 (누적 {len(all_deals)})")

                if page >= total_pages:
                    break

                page += 1
                time.sleep(0.3)

            except Exception as e:
                print(f"  [GS25 {label}] 페이지 {page} 실패: {e}")
                # CSRF 만료 시 재발급
                if "403" in str(e) or "csrf" in str(e).lower():
                    csrf = get_csrf_token(session)
                    continue
                page += 1
                time.sleep(1)

    print(f"[GS25] 총 {len(all_deals)}개 행사 상품 수집")
    return all_deals


if __name__ == "__main__":
    deals = crawl_events(event_types=["ONE_TO_ONE"], page_size=20)
    for d in deals[:10]:
        print(f"  {d.title} — {d.sale_price}원")
    print(f"\n총 {len(deals)}개")
