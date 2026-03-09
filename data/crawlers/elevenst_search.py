"""11번가 모바일 검색 API 크롤러 (API키 불필요)"""

import requests
import re
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Accept": "application/json",
}

SEARCH_API = "https://apis.11st.co.kr/search/api/tab/v3"

# 핫딜 관련 검색 키워드
KEYWORDS = ["핫딜", "타임세일", "특가"]


def crawl_hotdeal(keywords: list[str] | None = None) -> list[Deal]:
    """11번가 모바일 검색 API로 핫딜/특가 상품 수집"""
    deals = []
    seen_ids = set()

    if keywords is None:
        keywords = KEYWORDS

    for keyword in keywords:
        try:
            resp = requests.get(
                SEARCH_API,
                params={
                    "kwd": keyword,
                    "tabId": "MAIN_TAB",
                    "pageNo": 1,
                    "sortCd": "BEST",
                },
                headers=HEADERS,
                timeout=10,
            )

            if resp.status_code != 200:
                print(f"  11번가 검색 API {resp.status_code}: {keyword}")
                continue

            data = resp.json()

            for group in data.get("data", []):
                if group.get("groupName") not in ("list", "topAdArea"):
                    continue

                for item in group.get("items", []):
                    product_id = str(item.get("id", ""))
                    if not product_id or product_id in seen_ids:
                        continue
                    seen_ids.add(product_id)

                    title = item.get("title", "").strip()
                    if not title:
                        continue

                    # 가격
                    sale_price = int(item.get("finalPrc", 0) or 0)

                    # 링크
                    link = item.get("linkUrl", "")
                    if link and link.startswith("//"):
                        link = f"https:{link}"

                    # 이미지
                    image_url = item.get("imageUrl", "")
                    if image_url and image_url.startswith("//"):
                        image_url = f"https:{image_url}"

                    # 할인 정보
                    max_info = item.get("maxDiscountInfo", {})
                    original_price = int(max_info.get("sellPrice", 0) or 0)
                    discount_rate = 0
                    if original_price > sale_price > 0:
                        discount_rate = round(
                            (1 - sale_price / original_price) * 100
                        )

                    # 리뷰/배송 정보
                    desc_parts = []
                    review = item.get("reviewCountText", "")
                    if review:
                        score = item.get("satisfactionScore", "")
                        desc_parts.append(f"리뷰 {review}건 ({score}점)")
                    delivery = item.get("deliveryDescription", "")
                    if delivery:
                        desc_parts.append(f"배송: {delivery}")
                    eta = item.get("estimatedTimeOfArrival", {})
                    if eta and not eta.get("empty"):
                        desc_parts.append(eta.get("colorText", ""))

                    deals.append(Deal(
                        title=title,
                        url=link,
                        source="11st",
                        source_id=product_id,
                        sale_price=sale_price,
                        original_price=original_price,
                        discount_rate=discount_rate,
                        image_url=image_url,
                        category="핫딜",
                        description=" | ".join(desc_parts),
                    ))

        except Exception as e:
            print(f"  11번가 검색 API error ({keyword}): {e}")

    print(f"[11번가 검색] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_hotdeal()
    for d in results[:10]:
        print(f"  {d.title} | {d.sale_price}원 | {d.description}")
