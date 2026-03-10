"""이미지 없는 딜에 og:image 추출하여 백필"""

import requests
from bs4 import BeautifulSoup
import time
import sys

sys.stdout.reconfigure(encoding="utf-8")

API_URL = "https://everything-api.deri58.workers.dev"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}


def get_og_image(url: str) -> str:
    """URL에서 og:image 메타태그 추출"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10, allow_redirects=True)
        # euc-kr 인코딩 대응
        if b"euc-kr" in resp.content[:500].lower():
            text = resp.content.decode("euc-kr", errors="replace")
        else:
            text = resp.text
        soup = BeautifulSoup(text, "html.parser")

        # og:image
        og = soup.select_one('meta[property="og:image"]')
        if og and og.get("content"):
            img = og["content"]
            if img.startswith("//"):
                return f"https:{img}"
            if img.startswith("http"):
                return img

        # twitter:image
        tw = soup.select_one('meta[name="twitter:image"]')
        if tw and tw.get("content"):
            img = tw["content"]
            if img.startswith("//"):
                return f"https:{img}"
            if img.startswith("http"):
                return img

        # 본문 첫 번째 큰 이미지
        for img_tag in soup.select("img[src]"):
            src = img_tag.get("src", "")
            # 아이콘/작은 이미지 제외
            if any(skip in src.lower() for skip in ["icon", "logo", "blank", "spacer", "btn", "arrow", "emoji", "avatar", "1x1"]):
                continue
            w = img_tag.get("width", "")
            if w and w.isdigit() and int(w) < 50:
                continue
            if src.startswith("//"):
                return f"https:{src}"
            if src.startswith("http"):
                return src

    except Exception as e:
        print(f"  Error fetching {url[:60]}: {e}")
    return ""


def update_image(deal_id: int, image_url: str) -> bool:
    """API를 통해 이미지 URL 업데이트"""
    try:
        resp = requests.patch(
            f"{API_URL}/api/backfill/{deal_id}/image",
            json={"image_url": image_url},
            timeout=10,
        )
        return resp.status_code == 200
    except Exception:
        return False


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    print(f"이미지 없는 딜 {limit}개 조회 중...")

    resp = requests.get(f"{API_URL}/api/backfill/no-image?limit={limit}", timeout=10)
    deals = resp.json().get("data", [])
    print(f"{len(deals)}개 발견\n")

    updated = 0
    failed = 0

    for i, deal in enumerate(deals, 1):
        title = deal.get("title", "")[:40]
        url = deal.get("url", "")
        deal_id = deal.get("id")

        print(f"[{i}/{len(deals)}] {title}...")

        image_url = get_og_image(url)

        if image_url:
            if update_image(deal_id, image_url):
                updated += 1
                print(f"  OK: {image_url[:60]}")
            else:
                failed += 1
                print(f"  FAIL: API update error")
        else:
            failed += 1
            print(f"  SKIP: no image found")

        time.sleep(0.5)

    print(f"\n완료! 업데이트: {updated}, 실패/스킵: {failed}")


if __name__ == "__main__":
    main()
