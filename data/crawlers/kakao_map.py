"""카카오맵 크롤러 (Kakao Local Search API)"""

import requests
import os
from dotenv import load_dotenv
from .base import Store

load_dotenv()

KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY", "")

HEADERS = {
    "Authorization": f"KakaoAK {KAKAO_REST_API_KEY}",
}

API_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"


def search_kakao_place(query: str, x: str = "", y: str = "", radius: int = 5000) -> list[Store]:
    """카카오 로컬 검색 API로 매장 검색

    Args:
        query: 검색어 (예: "부천 제육볶음")
        x: 경도 (lng) - 중심 좌표
        y: 위도 (lat) - 중심 좌표
        radius: 검색 반경 (미터, 최대 20000)

    Returns:
        Store 리스트
    """
    if not KAKAO_REST_API_KEY:
        print("[카카오] API 키가 설정되지 않음 (KAKAO_REST_API_KEY)")
        return []

    params = {
        "query": query,
        "size": 15,
    }

    if x and y:
        params["x"] = x
        params["y"] = y
        params["radius"] = min(radius, 20000)

    stores = []
    page = 1

    while True:
        params["page"] = page
        try:
            resp = requests.get(API_URL, headers=HEADERS, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            documents = data.get("documents", [])
            if not documents:
                break

            print(f"  [카카오] '{query}' 페이지 {page}: {len(documents)}개 결과")

            for doc in documents:
                try:
                    name = doc.get("place_name", "")
                    if not name:
                        continue

                    lng = float(doc.get("x", "0"))
                    lat = float(doc.get("y", "0"))

                    stores.append(Store(
                        name=name,
                        address=doc.get("address_name", ""),
                        road_address=doc.get("road_address_name", ""),
                        phone=doc.get("phone", ""),
                        category=doc.get("category_name", ""),
                        lat=lat,
                        lng=lng,
                        kakao_id=doc.get("id", ""),
                        source="kakao",
                    ))

                except Exception as e:
                    print(f"  [카카오] 파싱 에러: {e}")
                    continue

            # 다음 페이지 확인
            meta = data.get("meta", {})
            if meta.get("is_end", True):
                break

            page += 1
            if page > 3:
                break

        except Exception as e:
            print(f"  [카카오] API 요청 실패: {e}")
            break

    print(f"[카카오] 총 {len(stores)}개 수집")
    return stores


if __name__ == "__main__":
    results = search_kakao_place("부천 제육볶음")
    for s in results[:10]:
        print(f"  [{s.category}] {s.name} | {s.address} | {s.phone} | ({s.lat}, {s.lng})")
