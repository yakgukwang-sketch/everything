"""뽐뿌 게시판 크롤러 — 게시글 + 댓글 대량 수집"""

import requests
from bs4 import BeautifulSoup
import re
import time
from .base import Deal, Comment

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

BASE_URL = "https://www.ppomppu.co.kr/zboard/zboard.php?id=ppomppu"
MAX_PAGES = 200


def parse_price(text: str) -> int:
    """가격 문자열에서 숫자 추출"""
    nums = re.findall(r"[\d,]+", text)
    for n in nums:
        val = int(n.replace(",", ""))
        if val > 0:
            return val
    return 0


def parse_page(soup) -> list[dict]:
    """한 페이지에서 게시글 상세 파싱 → dict 리스트 (Deal + 확장 필드)"""
    results = []
    links = soup.select('a[href*="view.php?id=ppomppu"]')
    seen = set()

    for a in links:
        try:
            title = a.text.strip()
            if not title or len(title) < 5:
                continue

            href = a.get("href", "")
            no_match = re.search(r"no=(\d+)", href)
            if not no_match:
                continue
            source_id = no_match.group(1)

            if source_id in seen:
                continue
            seen.add(source_id)

            link = f"https://www.ppomppu.co.kr/zboard/{href}" if not href.startswith("http") else href

            parent_tr = a.find_parent("tr")
            if not parent_tr:
                continue
            tds = parent_tr.select("td")
            if len(tds) < 6:
                continue

            # === td[1] 제목 셀: 카테고리 + 댓글수 ===
            title_td = tds[1]

            # 카테고리: em.subject_preface 또는 [XXX] 패턴
            category = ""
            cat_el = title_td.select_one("em.subject_preface")
            if cat_el:
                category = cat_el.text.strip().strip("[]")
            if not category:
                cat_match = re.match(r"\[(.+?)\]", title)
                category = cat_match.group(1) if cat_match else "핫딜"

            # 댓글수: span.baseList-c
            comment_count = 0
            cc_el = title_td.select_one("span.baseList-c")
            if cc_el:
                cc_text = cc_el.text.strip()
                if cc_text.isdigit():
                    comment_count = int(cc_text)

            # === td[2] 작성자 ===
            author = tds[2].get_text(strip=True)

            # === td[3] 날짜 ===
            posted_at = tds[3].get_text(strip=True)

            # === td[4] 추천 - 비추 ===
            rec_up = 0
            rec_down = 0
            rec_text = tds[4].get_text(strip=True)
            rec_match = re.search(r"(\d+)\s*-\s*(\d+)", rec_text)
            if rec_match:
                rec_up = int(rec_match.group(1))
                rec_down = int(rec_match.group(2))

            # === td[5] 조회수 ===
            views = 0
            views_text = tds[5].get_text(strip=True).replace(",", "")
            if views_text.isdigit():
                views = int(views_text)

            # === 가격 ===
            price_match = re.search(r"([\d,]+)\s*원", title)
            sale_price = parse_price(price_match.group(1)) if price_match else 0

            # === 이미지 ===
            image_url = ""
            img = parent_tr.select_one('img[src*="ppomppu.co.kr"]')
            if not img:
                for candidate in parent_tr.select("img[src]"):
                    src = candidate.get("src", "")
                    if any(skip in src for skip in ["icon", "blank", "spacer", "btn", "arrow", "emoji", "smiley"]):
                        continue
                    if candidate.get("width") and int(candidate.get("width", "0") or "0") < 30:
                        continue
                    img = candidate
                    break
            if img:
                image_url = img.get("src", "")
                if image_url.startswith("//"):
                    image_url = f"https:{image_url}"
                elif image_url and not image_url.startswith("http"):
                    image_url = f"https://www.ppomppu.co.kr{image_url}"

            results.append({
                "title": title,
                "url": link,
                "source": "ppomppu",
                "source_id": source_id,
                "sale_price": sale_price,
                "image_url": image_url,
                "category": category,
                "author": author,
                "posted_at": posted_at,
                "rec_up": rec_up,
                "rec_down": rec_down,
                "views": views,
                "comment_count": comment_count,
                "description": f"추천 {rec_up} 비추 {rec_down} | 조회 {views} | 댓글 {comment_count}",
            })

        except Exception as e:
            continue

    return results


def crawl_hotdeal() -> list[Deal]:
    """뽐뿌 게시판 크롤링 — Deal 객체 리턴 (하위호환)"""
    raw = crawl_hotdeal_full()
    return [Deal(
        title=r["title"],
        url=r["url"],
        source=r["source"],
        source_id=r["source_id"],
        sale_price=r["sale_price"],
        image_url=r["image_url"],
        category=r["category"],
        posted_at=r["posted_at"],
        description=r["description"],
    ) for r in raw]


def crawl_hotdeal_full(max_pages: int = None) -> list[dict]:
    """뽐뿌 게시판 크롤링 — 전체 필드 dict 리턴"""
    pages = max_pages or MAX_PAGES
    all_results = []

    for page in range(1, pages + 1):
        try:
            url = f"{BASE_URL}&page={page}"
            resp = requests.get(url, headers=HEADERS, timeout=10)
            text = resp.content.decode("euc-kr", errors="replace")
            soup = BeautifulSoup(text, "html.parser")

            results = parse_page(soup)
            if not results:
                break

            all_results.extend(results)

            if page % 10 == 0 or page == 1:
                print(f"  [뽐뿌] 페이지 {page}: {len(results)}개 (누적 {len(all_results)})")

            if page < pages:
                time.sleep(1)

        except Exception as e:
            print(f"  [뽐뿌] 페이지 {page} 실패: {e}")
            time.sleep(2)
            continue

    print(f"[뽐뿌] 총 {len(all_results)}개 수집")
    return all_results


def fetch_post_comments(source_id: str) -> list[Comment]:
    """뽐뿌 게시글의 댓글 수집"""
    url = f"https://www.ppomppu.co.kr/zboard/view.php?id=ppomppu&no={source_id}"
    comments = []

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        text = resp.content.decode("euc-kr", errors="replace")
        soup = BeautifulSoup(text, "html.parser")

        wrappers = soup.select("div.comment_wrapper")

        for wrapper in wrappers:
            try:
                content_el = wrapper.select_one("div.mid-text-area")
                if not content_el:
                    continue
                content = content_el.get_text(strip=True)
                if not content or len(content) < 2:
                    continue

                author = ""
                author_el = wrapper.select_one("b, font.comm_nick, a.comment_nick")
                if author_el:
                    author = author_el.text.strip()

                rec = 0
                vote_td = wrapper.select_one("td[class*='vote']")
                if vote_td:
                    rec_match = re.search(r"(\d+)", vote_td.text)
                    if rec_match:
                        rec = int(rec_match.group(1))

                created_at = ""
                full_text = wrapper.get_text()
                date_m = re.search(r"(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})", full_text)
                if date_m:
                    created_at = date_m.group(1)

                comments.append(Comment(
                    source="ppomppu",
                    post_id=source_id,
                    author=author,
                    content=content,
                    created_at=created_at,
                    recommendations=rec,
                ))

            except Exception:
                continue

    except Exception as e:
        print(f"  [뽐뿌] 댓글 수집 실패 (no={source_id}): {e}")

    return comments


def crawl_comments_for_deals(deals: list[Deal], max_posts: int = 100) -> list[Comment]:
    """수집된 딜 목록에서 각 게시글 댓글 수집"""
    all_comments = []
    targets = [d for d in deals if d.source_id][:max_posts]

    for i, deal in enumerate(targets, 1):
        try:
            comments = fetch_post_comments(deal.source_id)
            all_comments.extend(comments)

            if i % 10 == 0:
                print(f"  [뽐뿌] 댓글 {i}/{len(targets)}: 누적 {len(all_comments)}개")

            if i < len(targets):
                time.sleep(1.5)
        except Exception as e:
            print(f"  [뽐뿌] 댓글 실패 no={deal.source_id}: {e}")

    print(f"[뽐뿌] 총 댓글 {len(all_comments)}개 수집")
    return all_comments


if __name__ == "__main__":
    results = crawl_hotdeal_full(max_pages=2)
    for r in results[:5]:
        print(f"  [{r['category']}] {r['title'][:40]}")
        print(f"    작성자={r['author']} | 추천={r['rec_up']} 비추={r['rec_down']} | 조회={r['views']} | 댓글={r['comment_count']}")
