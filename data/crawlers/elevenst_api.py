"""11번가 오픈 API 크롤러

가입: https://openapi.11st.co.kr
1. 11번가 판매자 계정으로 로그인
2. 서비스 등록 → API키 발급 (1시간 이내)

환경변수:
  ELEVENST_API_KEY=...
"""

import os
import requests
from bs4 import BeautifulSoup
import re
from .base import Deal

API_KEY = os.getenv("ELEVENST_API_KEY", "")


def parse_price(text: str) -> int:
    nums = re.findall(r"[\d]+", text.replace(",", ""))
    if nums:
        try:
            return int(nums[0])
        except ValueError:
            pass
    return 0


def crawl_hotdeal(keywords: list[str] | None = None) -> list[Deal]:
    """11번가 오픈 API로 상품 검색"""
    if not API_KEY:
        print("[11번가API] API 키 미설정 (ELEVENST_API_KEY)")
        return []

    if keywords is None:
        keywords = ["특가", "베스트", "타임딜"]

    deals = []

    for keyword in keywords:
        try:
            resp = requests.get(
                "http://openapi.11st.co.kr/openapi/OpenApiService.tmall",
                params={
                    "key": API_KEY,
                    "apiCode": "ProductSearch",
                    "keyword": keyword,
                    "option": "Ranking",
                    "pageSize": 20,
                    "pageNum": 1,
                },
                timeout=10,
            )

            if resp.status_code != 200:
                print(f"  11번가 API {resp.status_code}: {keyword}")
                continue

            # XML 응답 파싱
            soup = BeautifulSoup(resp.content, "xml")
            products = soup.find_all("Product")

            for p in products:
                title = p.find("ProductName")
                price = p.find("SalePrice")
                original = p.find("ProductPrice")
                discount = p.find("Discount")
                url = p.find("DetailPageUrl")
                img = p.find("ProductImage300")
                pid = p.find("ProductCode")

                sale_price = parse_price(price.text) if price else 0
                original_price = parse_price(original.text) if original else 0
                disc_rate = parse_price(discount.text) if discount else 0

                if not disc_rate and original_price > sale_price > 0:
                    disc_rate = round((1 - sale_price / original_price) * 100)

                deals.append(Deal(
                    title=title.text.strip() if title else "",
                    url=url.text.strip() if url else "",
                    source="11st",
                    source_id=pid.text.strip() if pid else "",
                    sale_price=sale_price,
                    original_price=original_price,
                    discount_rate=disc_rate,
                    image_url=img.text.strip() if img else "",
                    category="쇼핑",
                ))

        except Exception as e:
            print(f"  11번가 API error ({keyword}): {e}")

    # 중복 제거
    seen = set()
    unique = []
    for d in deals:
        if d.source_id and d.source_id not in seen:
            seen.add(d.source_id)
            unique.append(d)
        elif not d.source_id:
            unique.append(d)
    deals = unique

    print(f"[11번가API] {len(deals)}개 수집")
    return deals


if __name__ == "__main__":
    results = crawl_hotdeal()
    for d in results[:5]:
        print(f"  {d.title} | {d.sale_price}원 ({d.discount_rate}%)")
