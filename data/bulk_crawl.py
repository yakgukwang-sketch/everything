"""대량 크롤링 -디시 63개 쇼핑 갤러리 + 뽐뿌 200페이지"""

import json
import time
import os
import sys
from dataclasses import asdict
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from crawlers.base import Deal, Comment
from crawlers.dcinside import crawl_gallery, crawl_comments_for_deals
from crawlers.ppomppu import crawl_hotdeal_full as crawl_ppomppu_full, crawl_comments_for_deals as crawl_ppomppu_comments, crawl_hotdeal as crawl_ppomppu

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "bulk_output")
DC_PAGES_PER_GALLERY = 20       # 갤러리당 20페이지 (약 1000개 글)
DC_COMMENTS_PER_GALLERY = 30    # 갤러리당 상위 30개 글 댓글
PPOMPPU_PAGES = 200              # 뽐뿌 200페이지
PPOMPPU_COMMENTS = 100           # 뽐뿌 상위 100개 글 댓글


def save_json(data, filename):
    """결과를 JSON 파일로 저장"""
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  → 저장: {filename} ({len(data)}건)")


def load_progress():
    """진행 상황 로드"""
    path = os.path.join(OUTPUT_DIR, "_progress.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"completed_galleries": [], "ppomppu_done": False}


def save_progress(progress):
    """진행 상황 저장"""
    path = os.path.join(OUTPUT_DIR, "_progress.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


def run_dc_bulk():
    """디시인사이드 63개 쇼핑 갤러리 대량 크롤링"""
    galleries_path = os.path.join(os.path.dirname(__file__), "dc_shopping_galleries.json")
    with open(galleries_path, "r", encoding="utf-8") as f:
        galleries = json.load(f)

    progress = load_progress()
    completed = set(progress["completed_galleries"])

    remaining = [g for g in galleries if g["id"] not in completed]
    print(f"\n{'='*60}")
    print(f"디시인사이드 쇼핑 갤러리 대량 크롤링")
    print(f"전체: {len(galleries)}개 | 완료: {len(completed)}개 | 남은: {len(remaining)}개")
    print(f"갤러리당: {DC_PAGES_PER_GALLERY}페이지 + 상위 {DC_COMMENTS_PER_GALLERY}글 댓글")
    print(f"{'='*60}")

    total_posts = 0
    total_comments = 0

    for i, gall in enumerate(remaining, 1):
        gid = gall["id"]
        gtype = "mgallery/board" if gall["type"] == "mgall" else "board"
        label = gall["name"]

        print(f"\n[{i}/{len(remaining)}] {label} ({gid}) -{gall['group']}")

        # 게시글 크롤링
        try:
            posts = crawl_gallery(gid, gtype, max_pages=DC_PAGES_PER_GALLERY, label=label)
            print(f"  게시글: {len(posts)}개")
            total_posts += len(posts)

            if posts:
                save_json([asdict(p) for p in posts], f"dc_{gid}_posts.json")

                # 댓글 크롤링
                comments = crawl_comments_for_deals(gid, gtype, posts, max_posts=DC_COMMENTS_PER_GALLERY, label=label)
                print(f"  댓글: {len(comments)}개")
                total_comments += len(comments)

                if comments:
                    save_json([asdict(c) for c in comments], f"dc_{gid}_comments.json")

        except Exception as e:
            print(f"  에러: {e}")

        # 진행 저장
        progress["completed_galleries"].append(gid)
        save_progress(progress)

        # 갤러리 간 딜레이
        if i < len(remaining):
            time.sleep(3)

    print(f"\n디시 완료: 게시글 {total_posts}개, 댓글 {total_comments}개")
    return total_posts, total_comments


def run_ppomppu_bulk():
    """뽐뿌 대량 크롤링"""
    progress = load_progress()
    if progress.get("ppomppu_done"):
        print("\n뽐뿌: 이미 완료됨 (스킵)")
        return 0, 0

    print(f"\n{'='*60}")
    print(f"뽐뿌 대량 크롤링 ({PPOMPPU_PAGES}페이지 + 상위 {PPOMPPU_COMMENTS}글 댓글)")
    print(f"수집 필드: 제목, 작성자, 추천/비추, 조회수, 댓글수, 가격, 카테고리")
    print(f"{'='*60}")

    # 전체 필드로 크롤링 (추천수, 비추, 댓글수, 작성자 등)
    posts_full = crawl_ppomppu_full(max_pages=PPOMPPU_PAGES)
    print(f"  게시글: {len(posts_full)}개")

    if posts_full:
        save_json(posts_full, "ppomppu_posts.json")

        # 댓글 수집 -댓글이 있는 글만 + 추천 많은 순 정렬
        posts_with_comments = sorted(
            [p for p in posts_full if p.get("comment_count", 0) > 0],
            key=lambda x: x.get("comment_count", 0),
            reverse=True
        )[:PPOMPPU_COMMENTS]

        # Deal 객체로 변환해서 댓글 수집
        from crawlers.base import Deal
        deal_targets = [Deal(
            title=p["title"], url=p["url"], source=p["source"],
            source_id=p["source_id"], sale_price=p.get("sale_price", 0),
        ) for p in posts_with_comments]

        comments = crawl_ppomppu_comments(deal_targets, max_posts=PPOMPPU_COMMENTS)
        print(f"  댓글: {len(comments)}개")

        if comments:
            save_json([asdict(c) for c in comments], "ppomppu_comments.json")
    else:
        comments = []

    progress["ppomppu_done"] = True
    save_progress(progress)

    print(f"\n뽐뿌 완료: 게시글 {len(posts_full)}개, 댓글 {len(comments)}개")
    return len(posts_full), len(comments)


def merge_all():
    """모든 결과를 통합 파일로 머지"""
    all_posts = []
    all_comments = []

    for fname in os.listdir(OUTPUT_DIR):
        if fname.startswith("_") or not fname.endswith(".json"):
            continue
        path = os.path.join(OUTPUT_DIR, fname)
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "_posts" in fname:
            all_posts.extend(data)
        elif "_comments" in fname:
            all_comments.extend(data)

    save_json(all_posts, "_all_posts.json")
    save_json(all_comments, "_all_comments.json")

    print(f"\n통합 완료: 게시글 {len(all_posts)}개, 댓글 {len(all_comments)}개")
    return all_posts, all_comments


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    start = datetime.now()
    print(f"대량 크롤링 시작: {start.strftime('%Y-%m-%d %H:%M:%S')}")

    # 1. 뽐뿌
    pp_posts, pp_comments = run_ppomppu_bulk()

    # 2. 디시인사이드
    dc_posts, dc_comments = run_dc_bulk()

    # 3. 통합
    merge_all()

    elapsed = datetime.now() - start
    print(f"\n{'='*60}")
    print(f"전체 완료!")
    print(f"  뽐뿌: 게시글 {pp_posts} + 댓글 {pp_comments}")
    print(f"  디시: 게시글 {dc_posts} + 댓글 {dc_comments}")
    print(f"  소요시간: {elapsed}")
    print(f"  출력: {OUTPUT_DIR}/")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
