"""쿠팡 크롤러 (현재 403 차단 — 비활성)"""

from .base import Deal


def crawl_hotdeal() -> list[Deal]:
    """쿠팡은 현재 봇 차단 (403). 추후 대응 예정."""
    print("[쿠팡] 봇 차단으로 비활성 (403)")
    return []
