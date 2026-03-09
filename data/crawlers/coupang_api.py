"""쿠팡 파트너스 공식 API 크롤러

가입: https://partners.coupang.com
조건: 가입 후 판매 15만원 이상 → 최종승인 → API키 발급
제한: 1시간 10회, 1회 최대 10개 상품

환경변수:
  COUPANG_ACCESS_KEY=...
  COUPANG_SECRET_KEY=...
"""

import os
import time
import hmac
import hashlib
import urllib.parse
import requests
from .base import Deal

ACCESS_KEY = os.getenv("COUPANG_ACCESS_KEY", "")
SECRET_KEY = os.getenv("COUPANG_SECRET_KEY", "")

DOMAIN = "https://api-gateway.coupang.com"


def _generate_auth(method: str, url: str) -> str:
    """HMAC 인증 헤더 생성"""
    parsed = urllib.parse.urlparse(url)
    path = parsed.path
    query = parsed.query

    dt = time.strftime("%y%m%dT%H%M%SZ", time.gmtime())
    message = dt + method.upper() + path + query
    signature = hmac.new(
        SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return f"CEA algorithm=HmacSHA256, access-key={ACCESS_KEY}, signed-date={dt}, signature={signature}"


def crawl_hotdeal(keywords: list[str] | None = None) -> list[Deal]:
    """쿠팡 파트너스 API로 상품 검색"""
    if not ACCESS_KEY or not SECRET_KEY:
        print("[쿠팡API] API 키 미설정 (COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY)")
        return []

    if keywords is None:
        keywords = ["특가", "할인", "베스트"]

    deals = []

    for keyword in keywords:
        try:
            encoded = urllib.parse.quote(keyword)
            url = f"/v2/providers/affiliate_open_api/apis/openapi/products/search?keyword={encoded}&limit=10"
            full_url = DOMAIN + url

            auth = _generate_auth("GET", full_url)

            resp = requests.get(
                full_url,
                headers={
                    "Authorization": auth,
                    "Content-Type": "application/json;charset=UTF-8",
                },
                timeout=10,
            )

            if resp.status_code != 200:
                print(f"  쿠팡 API {resp.status_code}: {keyword}")
                continue

            data = resp.json()
            products = data.get("data", {}).get("productData", [])

            for p in products:
                sale_price = int(p.get("productPrice", 0))
                original_price = int(p.get("originalPrice", 0)) or sale_price
                discount = round((1 - sale_price / original_price) * 100) if original_price > sale_price else 0

                deals.append(Deal(
                    title=p.get("productName", ""),
                    url=p.get("productUrl", ""),
                    source="coupang",
                    source_id=str(p.get("productId", "")),
                    sale_price=sale_price,
                    original_price=original_price,
                    discount_rate=discount,
                    image_url=p.get("productImage", ""),
                    category=p.get("categoryName", "쇼핑"),
                ))

        except Exception as e:
            print(f"  쿠팡 API error ({keyword}): {e}")

    print(f"[쿠팡API] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_hotdeal()
    for d in results[:5]:
        print(f"  {d.title} | {d.sale_price}원 ({d.discount_rate}%)")
