"""뽐뿌 전체 크롤링"""

import requests
from bs4 import BeautifulSoup
import re
import time
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

BASE_URL = "https://www.ppomppu.co.kr/zboard/zboard.php?id=ppomppu"
DELAY = 1
SAVE_EVERY = 50  # 50페이지마다 중간 저장
MAX_POSTS = 5000


def crawl_page(divpage, page):
    url = f"{BASE_URL}&page={page}&divpage={divpage}"
    resp = requests.get(url, headers=HEADERS, timeout=15)
    text = resp.content.decode("euc-kr", errors="replace")
    soup = BeautifulSoup(text, "html.parser")

    posts = []
    links = soup.select('a[href*="view.php?id=ppomppu"]')
    seen = set()

    for a in links:
        title = a.text.strip()
        if not title or len(title) < 5:
            continue
        m = re.search(r"no=(\d+)", a.get("href", ""))
        if not m or m.group(1) in seen:
            continue
        seen.add(m.group(1))

        source_match = re.match(r"\[(.+?)\]", title)
        source = source_match.group(1) if source_match else ""

        price_match = re.search(r"([\d,]+)\s*원", title)
        price = int(price_match.group(1).replace(",", "")) if price_match else 0

        # 이미지
        image_url = ""
        tr = a.find_parent("tr")
        if tr:
            img = tr.select_one('img[src*="cdn2.ppomppu.co.kr"]')
            if img:
                image_url = img.get("src", "")
                if image_url.startswith("//"):
                    image_url = f"https:{image_url}"
                elif image_url and not image_url.startswith("http"):
                    image_url = f"https://www.ppomppu.co.kr{image_url}"

        posts.append({
            "no": int(m.group(1)),
            "title": title,
            "source": source,
            "price": price,
            "image_url": image_url,
        })

    return posts


def main():
    all_posts = []
    total_pages = 0
    errors = 0

    # divpage 109 (최신) -> 1 (과거) 순으로
    for divpage in range(109, 0, -1):
        for page in range(1, 12):  # 각 divpage당 최대 11페이지
            try:
                posts = crawl_page(divpage, page)
                if not posts:
                    break  # 이 divpage의 마지막 페이지

                all_posts.extend(posts)
                total_pages += 1

                if total_pages % 10 == 0:
                    print(f"  divpage={divpage} page={page} | 누적 {len(all_posts)}개 | 페이지 {total_pages}")

                # 중간 저장
                if total_pages % SAVE_EVERY == 0:
                    with open("ppomppu_all.json", "w", encoding="utf-8") as f:
                        json.dump(all_posts, f, ensure_ascii=False)
                    print(f"  [저장] {len(all_posts)}개 -> ppomppu_all.json")

                if len(all_posts) >= MAX_POSTS:
                    break

                time.sleep(DELAY)

            except Exception as e:
                errors += 1
                print(f"  [에러] divpage={divpage} page={page}: {e}")
                if errors > 10:
                    print("에러 10회 초과, 딜레이 3초로 증가")
                    time.sleep(3)
                if errors > 30:
                    print("에러 30회 초과, 중단")
                    break
                time.sleep(2)
                continue

        if errors > 30:
            break

        if len(all_posts) >= MAX_POSTS:
            print(f"  {MAX_POSTS}개 도달, 중단")
            break

    # 최종 저장
    with open("ppomppu_all.json", "w", encoding="utf-8") as f:
        json.dump(all_posts, f, ensure_ascii=False)

    print(f"\n완료! 총 {len(all_posts)}개 수집, {total_pages}페이지, 에러 {errors}회")
    print("저장: ppomppu_all.json")


if __name__ == "__main__":
    main()
