"""전체 크롤링 실행"""

from crawlers.base import upload_deals
from crawlers.ppomppu import crawl_hotdeal as crawl_ppomppu
from crawlers.ruliweb import crawl_hotdeal as crawl_ruliweb
from crawlers.clien import crawl_deals as crawl_clien
from crawlers.fmkorea import crawl_hotdeal as crawl_fmkorea
from crawlers.quasarzone import crawl_hotdeal as crawl_quasarzone

CRAWLERS = [
    ("뽐뿌 핫딜", crawl_ppomppu),
    ("루리웹 핫딜", crawl_ruliweb),
    ("클리앙 알뜰구매", crawl_clien),
    ("FM코리아 핫딜", crawl_fmkorea),
    ("퀘사이저존 핫딜", crawl_quasarzone),
]


def run():
    print("=" * 50)
    print("everything 할인 상품 크롤러")
    print("=" * 50)

    all_deals = []

    for i, (name, crawler) in enumerate(CRAWLERS, 1):
        print(f"\n[{i}/{len(CRAWLERS)}] {name}...")
        try:
            deals = crawler()
            all_deals.extend(deals)
        except Exception as e:
            print(f"  Error: {e}")

    print(f"\n총 {len(all_deals)}개 수집 완료")

    if all_deals:
        print("\n업로드 중...")
        upload_deals(all_deals)
    else:
        print("\n수집된 데이터가 없습니다.")

    print("\n완료!")


if __name__ == "__main__":
    run()
