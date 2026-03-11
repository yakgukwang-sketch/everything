"""쿠팡 파트너스 Open API 크롤러"""

import hmac
import hashlib
import os
import time
import urllib.parse
import requests
from time import gmtime, strftime
from .base import Deal

COUPANG_ACCESS_KEY = os.getenv("COUPANG_ACCESS_KEY", "")
COUPANG_SECRET_KEY = os.getenv("COUPANG_SECRET_KEY", "")

DOMAIN = "https://api-gateway.coupang.com"
SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search"

DEFAULT_KEYWORDS = [
    "노트북", "무선이어폰", "키보드", "마우스", "모니터",
    "태블릿", "스마트워치", "충전기", "SSD", "그래픽카드",
    "에어컨", "선풍기", "공기청정기", "로봇청소기", "전자레인지",
    "운동화", "백팩", "텀블러", "비타민", "프로틴",
]


def _generate_hmac(method: str, url: str) -> str:
    """HMAC-SHA256 인증 헤더 생성"""
    path, *query_parts = url.split("?")
    query = query_parts[0] if query_parts else ""
    datetime_gmt = strftime("%y%m%d", gmtime()) + "T" + strftime("%H%M%S", gmtime()) + "Z"
    message = datetime_gmt + method + path + query

    signature = hmac.new(
        COUPANG_SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return f"CEA algorithm=HmacSHA256, access-key={COUPANG_ACCESS_KEY}, signed-date={datetime_gmt}, signature={signature}"


def search_products(keyword: str, limit: int = 10) -> list[Deal]:
    """쿠팡 상품 검색

    Args:
        keyword: 검색어
        limit: 결과 개수 (최대 10, API 제한)
    """
    if not COUPANG_ACCESS_KEY or not COUPANG_SECRET_KEY:
        print("[쿠팡] API 키가 설정되지 않았습니다. .env 파일을 확인하세요.")
        return []

    encoded_keyword = urllib.parse.quote(keyword)
    url_path = f"{SEARCH_PATH}?keyword={encoded_keyword}&limit={min(limit, 10)}"
    authorization = _generate_hmac("GET", url_path)

    try:
        resp = requests.get(
            f"{DOMAIN}{url_path}",
            headers={
                "Authorization": authorization,
                "Content-Type": "application/json;charset=UTF-8",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[쿠팡] API 호출 실패 ({keyword}): {e}")
        return []

    product_data = data.get("data", {}).get("productData", [])
    deals = []

    for item in product_data:
        product_id = str(item.get("productId", ""))
        title = item.get("productName", "")
        price = int(item.get("productPrice", 0) or 0)
        image = item.get("productImage", "")
        url = item.get("productUrl", "")
        is_rocket = item.get("isRocket", False)
        is_free_shipping = item.get("isFreeShipping", False)
        category = item.get("categoryName", keyword)
        rank = item.get("rank", 0)

        description = "쿠팡"
        if is_rocket:
            description += " | 로켓배송"
        if is_free_shipping:
            description += " | 무료배송"

        deals.append(Deal(
            title=title,
            url=url,
            source="쿠팡",
            source_id=f"coupang_{product_id}" if product_id else "",
            original_price=0,
            sale_price=price,
            discount_rate=0,
            image_url=image,
            category=category or keyword,
            description=description,
        ))

    return deals


def crawl_coupang(keywords: list[str] | None = None, limit: int = 10) -> list[Deal]:
    """여러 키워드로 쿠팡 크롤링

    주의: Search API는 시간당 10회 제한이므로 키워드 수를 조절해야 함
    """
    if keywords is None:
        keywords = DEFAULT_KEYWORDS[:10]  # API 제한 때문에 10개로 제한

    all_deals = []
    seen_ids = set()

    for i, kw in enumerate(keywords):
        deals = search_products(kw, limit=limit)
        new_count = 0
        for d in deals:
            if d.source_id and d.source_id in seen_ids:
                continue
            if d.source_id:
                seen_ids.add(d.source_id)
            all_deals.append(d)
            new_count += 1

        print(f"  [{i+1}/{len(keywords)}] '{kw}': {new_count}개 (중복 제외)")

        if i < len(keywords) - 1:
            time.sleep(6)  # 시간당 10회 제한 → 6초 간격

    print(f"[쿠팡] 총 {len(all_deals)}개 수집")
    return all_deals


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    results = search_products("노트북", limit=5)
    for d in results:
        print(f"  {d.title[:50]} | {d.sale_price:,}원 | {d.description}")

    print(f"\n총 {len(results)}개")
