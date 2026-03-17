"""디시인사이드 멀티 갤러리 크롤러"""

import requests
from bs4 import BeautifulSoup
import re
import time
from .base import Deal, Comment

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}


def _gallery_urls(gallery_id: str, gallery_type: str):
    """갤러리 URL 생성"""
    base = f"https://gall.dcinside.com/{gallery_type}/lists/?id={gallery_id}"
    view = f"https://gall.dcinside.com/{gallery_type}/view/?id={gallery_id}"
    comment = f"https://gall.dcinside.com/{gallery_type}/comment/"
    return base, view, comment


def crawl_gallery(gallery_id: str, gallery_type: str = "board", max_pages: int = 10, label: str = "") -> list[Deal]:
    """단일 갤러리 게시글 크롤링"""
    base_url, _, _ = _gallery_urls(gallery_id, gallery_type)
    label = label or gallery_id
    all_deals = []
    session = requests.Session()
    session.headers.update(HEADERS)

    for page in range(1, max_pages + 1):
        try:
            url = f"{base_url}&page={page}"
            resp = session.get(url, timeout=10)
            resp.raise_for_status()

            if len(resp.text) < 500 or "alert(" in resp.text[:300]:
                print(f"    [{label}] 접근 불가 (폐쇄/차단)")
                break

            soup = BeautifulSoup(resp.text, "html.parser")
            rows = soup.select("tr.ub-content")
            if not rows:
                break

            page_count = 0
            for row in rows:
                try:
                    num_el = row.select_one("td.gall_num")
                    if not num_el:
                        continue
                    num_text = num_el.text.strip()
                    if num_text in ("공지", "설문", "AD") or not num_text.isdigit():
                        continue

                    source_id = num_text

                    title_el = row.select_one("td.gall_tit a")
                    if not title_el:
                        continue
                    title = title_el.text.strip()
                    if not title or len(title) < 3:
                        continue

                    href = title_el.get("href", "")
                    if href.startswith("javascript"):
                        continue
                    link = f"https://gall.dcinside.com{href}" if href.startswith("/") else href

                    views = 0
                    count_el = row.select_one("td.gall_count")
                    if count_el:
                        v = count_el.text.strip().replace(",", "")
                        if v.isdigit():
                            views = int(v)

                    rec = 0
                    rec_el = row.select_one("td.gall_recommend")
                    if rec_el:
                        r = rec_el.text.strip()
                        if r.lstrip("-").isdigit():
                            rec = int(r)

                    date_el = row.select_one("td.gall_date")
                    posted_at = date_el.get("title", date_el.text.strip()) if date_el else ""

                    price_match = re.search(r"([\d,]+)\s*원", title)
                    sale_price = int(price_match.group(1).replace(",", "")) if price_match else 0

                    cat_match = re.match(r"\[(.+?)\]", title)
                    category = cat_match.group(1) if cat_match else label

                    all_deals.append(Deal(
                        title=title,
                        url=link,
                        source=f"dc_{gallery_id}",
                        source_id=source_id,
                        sale_price=sale_price,
                        category=category,
                        posted_at=posted_at,
                        description=f"추천 {rec} | 조회 {views}" if views > 0 else "",
                    ))
                    page_count += 1

                except Exception:
                    continue

            if page % 10 == 0 or page == 1:
                print(f"    [{label}] 페이지 {page}: {page_count}개 (누적 {len(all_deals)})")

            if page < max_pages:
                time.sleep(1.5)

        except Exception as e:
            print(f"    [{label}] 페이지 {page} 실패: {e}")
            time.sleep(3)
            continue

    return all_deals


def fetch_post_comments(gallery_id: str, gallery_type: str, post_no: str) -> list[Comment]:
    """디시인사이드 게시글 댓글 수집"""
    _, view_base, comment_api_url = _gallery_urls(gallery_id, gallery_type)
    comments = []
    session = requests.Session()
    session.headers.update(HEADERS)

    try:
        view_url = f"{view_base}&no={post_no}"
        resp = session.get(view_url, timeout=10)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        e_s_n_o = ""
        esno_input = soup.select_one("input[name='e_s_n_o']")
        if esno_input:
            e_s_n_o = esno_input.get("value", "")

        # 댓글 페이지 순회 (최대 5페이지)
        for cmt_page in range(1, 6):
            payload = {
                "id": gallery_id,
                "no": post_no,
                "cmt_id": gallery_id,
                "cmt_no": post_no,
                "e_s_n_o": e_s_n_o,
                "comment_page": str(cmt_page),
                "sort": "",
            }
            headers = {
                **HEADERS,
                "X-Requested-With": "XMLHttpRequest",
                "Referer": view_url,
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            }

            resp = session.post(comment_api_url, data=payload, headers=headers, timeout=10)
            if resp.status_code != 200:
                break

            try:
                data = resp.json()
                comment_list = data.get("comments") or []
                if not comment_list:
                    break

                for cmt in comment_list:
                    content = cmt.get("memo", "")
                    content = BeautifulSoup(content, "html.parser").get_text(strip=True)
                    if not content or len(content) < 2:
                        continue

                    comments.append(Comment(
                        source=f"dc_{gallery_id}",
                        post_id=post_no,
                        author=cmt.get("name", ""),
                        content=content,
                        created_at=cmt.get("reg_date", ""),
                        recommendations=0,
                    ))

                total = data.get("total_cnt", 0)
                if len(comments) >= total:
                    break

            except (ValueError, KeyError):
                break

            time.sleep(0.5)

    except Exception as e:
        pass

    return comments


def crawl_comments_for_deals(gallery_id: str, gallery_type: str, deals: list[Deal], max_posts: int = 50, label: str = "") -> list[Comment]:
    """수집된 딜 목록에서 댓글 일괄 수집"""
    label = label or gallery_id
    all_comments = []
    targets = [d for d in deals if d.source_id][:max_posts]

    for i, deal in enumerate(targets, 1):
        try:
            comments = fetch_post_comments(gallery_id, gallery_type, deal.source_id)
            all_comments.extend(comments)

            if i % 10 == 0:
                print(f"    [{label}] 댓글 {i}/{len(targets)}: 누적 {len(all_comments)}개")

            if i < len(targets):
                time.sleep(1.5)
        except Exception:
            continue

    return all_comments


# === 하위호환: 기존 main.py에서 호출하는 함수들 ===

def crawl_hotdeal() -> list[Deal]:
    return crawl_gallery("appliance", "board", max_pages=3, label="가전")


def crawl_comments_for_deals_compat(deals: list[Deal], max_posts: int = 20) -> list[Comment]:
    return crawl_comments_for_deals("appliance", "board", deals, max_posts, label="가전")


if __name__ == "__main__":
    results = crawl_gallery("appliance", "board", max_pages=2, label="가전")
    print(f"총 {len(results)}개")
    for d in results[:5]:
        print(f"  [{d.category}] {d.title[:50]}")
