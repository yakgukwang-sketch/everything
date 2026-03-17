"""전체 크롤링 실행"""

from crawlers.base import upload_deals, upload_comments
from crawlers.ppomppu import crawl_hotdeal as crawl_ppomppu, crawl_comments_for_deals as crawl_ppomppu_comments
from crawlers.dcinside import crawl_hotdeal as crawl_dcinside, crawl_comments_for_deals_compat as crawl_dcinside_comments

CRAWLERS = [
    ("뽐뿌", crawl_ppomppu, crawl_ppomppu_comments),
    ("디시인사이드", crawl_dcinside, crawl_dcinside_comments),
]


def run():
    print("=" * 50)
    print("everything 크롤러")
    print("=" * 50)

    all_deals = []
    all_comments = []

    for i, (name, deal_crawler, comment_crawler) in enumerate(CRAWLERS, 1):
        print(f"\n[{i}/{len(CRAWLERS)}] {name} — 게시글 수집...")
        try:
            deals = deal_crawler()
            all_deals.extend(deals)

            # 댓글 수집
            print(f"[{i}/{len(CRAWLERS)}] {name} — 댓글 수집...")
            comments = comment_crawler(deals)
            all_comments.extend(comments)
        except Exception as e:
            print(f"  Error: {e}")

    print(f"\n총 {len(all_deals)}개 딜, {len(all_comments)}개 댓글 수집 완료")

    if all_deals:
        print("\n딜 업로드 중...")
        upload_deals(all_deals)

    if all_comments:
        print("\n댓글 업로드 중...")
        upload_comments(all_comments)

    if not all_deals and not all_comments:
        print("\n수집된 데이터가 없습니다.")

    print("\n완료!")


if __name__ == "__main__":
    run()
