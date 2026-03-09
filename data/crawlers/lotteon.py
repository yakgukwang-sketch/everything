"""롯데온 크롤러 (현재 SPA + 봇 차단 — 비활성)"""

from .base import Deal


def crawl_hotdeal() -> list[Deal]:
    """롯데온은 SPA 렌더링 + 봇 차단으로 requests 기반 크롤링 불가. 추후 대응 예정."""
    print("[롯데온] SPA 렌더링으로 비활성 (CSR only)")
    return []
