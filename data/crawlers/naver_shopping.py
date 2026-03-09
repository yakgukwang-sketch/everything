"""네이버 쇼핑 크롤러 (현재 418 차단 — 비활성)"""

from .base import Deal


def crawl_hotdeal() -> list[Deal]:
    """네이버 쇼핑은 현재 봇 차단 (418). 추후 대응 예정."""
    print("[네이버쇼핑] 봇 차단으로 비활성 (418)")
    return []
