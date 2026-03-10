"""네이버 플레이스 크롤러 (Naver Search Local API)"""

import requests
import os
import re
from dotenv import load_dotenv
from .base import Store

load_dotenv()

NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET", "")

HEADERS = {
    "X-Naver-Client-Id": NAVER_CLIENT_ID,
    "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
}

API_URL = "https://openapi.naver.com/v1/search/local.json"


def strip_html(text: str) -> str:
    """HTML 태그 제거 (<b> 등)"""
    return re.sub(r"<[^>]+>", "", text).strip()


def search_naver_place(query: str, display: int = 20) -> list[Store]:
    """네이버 지역 검색 API로 매장 검색

    Args:
        query: 검색어 (예: "부천 제육볶음")
        display: 결과 개수 (최대 5~20)

    Returns:
        Store 리스트
    """
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        print("[네이버] API 키가 설정되지 않음 (NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)")
        return []

    params = {
        "query": query,
        "display": min(display, 20),
        "sort": "comment",
    }

    stores = []
    try:
        resp = requests.get(API_URL, headers=HEADERS, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        items = data.get("items", [])
        print(f"  [네이버] '{query}' 검색: {len(items)}개 결과")

        for item in items:
            try:
                name = strip_html(item.get("title", ""))
                if not name:
                    continue

                # mapx/mapy: KATECH 좌표 → WGS84 변환
                mapx = item.get("mapx", "0")
                mapy = item.get("mapy", "0")
                lng = float(mapx) / 10000000 if mapx else 0.0
                lat = float(mapy) / 10000000 if mapy else 0.0

                # link에서 naver place id 추출 시도
                link = item.get("link", "")
                naver_id = ""
                id_match = re.search(r"/(\d+)", link)
                if id_match:
                    naver_id = id_match.group(1)

                stores.append(Store(
                    name=name,
                    address=item.get("address", ""),
                    road_address=item.get("roadAddress", ""),
                    phone=item.get("telephone", ""),
                    category=item.get("category", ""),
                    lat=lat,
                    lng=lng,
                    naver_id=naver_id,
                    source="naver",
                ))

            except Exception as e:
                print(f"  [네이버] 파싱 에러: {e}")
                continue

    except Exception as e:
        print(f"  [네이버] API 요청 실패: {e}")

    print(f"[네이버] 총 {len(stores)}개 수집")
    return stores


if __name__ == "__main__":
    results = search_naver_place("부천 제육볶음")
    for s in results[:10]:
        print(f"  [{s.category}] {s.name} | {s.address} | {s.phone} | ({s.lat}, {s.lng})")
