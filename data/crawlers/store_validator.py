"""매장 교차 검증 (네이버 + 카카오 데이터 병합)"""

from .base import Store
from .naver_place import search_naver_place
from .kakao_map import search_kakao_place


def normalize_name(name: str) -> str:
    """비교용 이름 정규화 (공백, 특수문자 제거)"""
    import re
    name = re.sub(r"[^\w가-힣a-zA-Z0-9]", "", name)
    return name.lower().strip()


def name_similarity(a: str, b: str) -> float:
    """두 이름의 유사도 계산 (0.0 ~ 1.0)

    부분 문자열 매칭 + 공통 문자 비율 사용
    """
    na = normalize_name(a)
    nb = normalize_name(b)

    if not na or not nb:
        return 0.0

    # 완전 일치
    if na == nb:
        return 1.0

    # 부분 문자열 포함
    if na in nb or nb in na:
        shorter = min(len(na), len(nb))
        longer = max(len(na), len(nb))
        return shorter / longer

    # 공통 문자 비율 (간단한 유사도)
    set_a = set(na)
    set_b = set(nb)
    if not set_a or not set_b:
        return 0.0

    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union)


def address_overlap(addr_a: str, addr_b: str) -> bool:
    """주소가 겹치는지 확인 (구/동 단위)"""
    if not addr_a or not addr_b:
        return False

    # 공백 기준 토큰 비교
    tokens_a = set(addr_a.split())
    tokens_b = set(addr_b.split())

    common = tokens_a & tokens_b
    # 시/구/동 중 2개 이상 일치하면 같은 지역
    return len(common) >= 2


def merge_stores(naver: Store, kakao: Store) -> Store:
    """네이버 + 카카오 데이터 병합

    이름: 네이버 우선
    좌표: 카카오 우선 (WGS84 직접 제공)
    나머지: 비어있지 않은 값 우선
    """
    merged = Store(
        name=naver.name,
        address=naver.address or kakao.address,
        road_address=naver.road_address or kakao.road_address,
        phone=naver.phone or kakao.phone,
        category=naver.category or kakao.category,
        lat=kakao.lat if kakao.lat != 0.0 else naver.lat,
        lng=kakao.lng if kakao.lng != 0.0 else naver.lng,
        naver_id=naver.naver_id,
        kakao_id=kakao.kakao_id,
        source="naver+kakao",
        menu_info=naver.menu_info or kakao.menu_info,
        image_url=naver.image_url or kakao.image_url,
    )
    merged.verified = True
    return merged


def validate_stores(naver_stores: list[Store], kakao_stores: list[Store]) -> list[Store]:
    """네이버/카카오 검색 결과 교차 검증 및 병합

    양쪽 모두에 있는 매장 → 병합 (verified)
    한쪽에만 있는 매장 → 그대로 포함

    Args:
        naver_stores: 네이버 검색 결과
        kakao_stores: 카카오 검색 결과

    Returns:
        병합된 Store 리스트 (verified 우선 정렬)
    """
    matched_kakao = set()  # 이미 매칭된 카카오 인덱스
    verified = []
    unmatched_naver = []

    for ns in naver_stores:
        best_match = None
        best_score = 0.0
        best_idx = -1

        for idx, ks in enumerate(kakao_stores):
            if idx in matched_kakao:
                continue

            score = name_similarity(ns.name, ks.name)
            has_addr = address_overlap(ns.address, ks.address) or address_overlap(
                ns.road_address, ks.road_address
            )

            # 이름 유사도 0.6 이상 + 주소 겹침 → 같은 매장
            if score >= 0.6 and has_addr and score > best_score:
                best_match = ks
                best_score = score
                best_idx = idx
            # 이름 유사도 0.8 이상이면 주소 없어도 매칭
            elif score >= 0.8 and score > best_score:
                best_match = ks
                best_score = score
                best_idx = idx

        if best_match:
            matched_kakao.add(best_idx)
            merged = merge_stores(ns, best_match)
            verified.append(merged)
            print(f"  [검증] 매칭: {ns.name} ↔ {best_match.name} (유사도: {best_score:.2f})")
        else:
            unmatched_naver.append(ns)

    # 매칭 안 된 카카오 매장
    unmatched_kakao = [ks for idx, ks in enumerate(kakao_stores) if idx not in matched_kakao]

    # verified 먼저, 나머지는 뒤에
    result = verified + unmatched_naver + unmatched_kakao
    print(f"[검증] 교차 확인: {len(verified)}개 | 네이버만: {len(unmatched_naver)}개 | 카카오만: {len(unmatched_kakao)}개")
    return result


def search_and_validate(query: str) -> list[Store]:
    """네이버 + 카카오 동시 검색 후 교차 검증

    Args:
        query: 검색어 (예: "부천 제육볶음")

    Returns:
        검증된 Store 리스트
    """
    print(f"[검색] '{query}' 교차 검증 시작...")

    naver_stores = search_naver_place(query)
    kakao_stores = search_kakao_place(query)

    if not naver_stores and not kakao_stores:
        print("[검색] 결과 없음")
        return []

    return validate_stores(naver_stores, kakao_stores)


if __name__ == "__main__":
    results = search_and_validate("부천 제육볶음")
    print(f"\n총 {len(results)}개 매장:")
    for s in results:
        verified = "v" if s.source == "naver+kakao" else " "
        print(f"  [{verified}] {s.name} | {s.address} | {s.phone} | ({s.lat}, {s.lng}) [{s.source}]")
