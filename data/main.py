"""전체 크롤링 실행"""

from crawlers.base import upload_deals
from crawlers.ppomppu import crawl_hotdeal as crawl_ppomppu
from crawlers.ruliweb import crawl_hotdeal as crawl_ruliweb
from crawlers.clien import crawl_deals as crawl_clien


def run():
    print("=" * 50)
    print("everything 할인 상품 크롤러")
    print("=" * 50)

    all_deals = []

    # 뽐뿌 핫딜
    print("\n[1/3] 뽐뿌 핫딜...")
    all_deals.extend(crawl_ppomppu())

    # 루리웹 핫딜
    print("\n[2/3] 루리웹 핫딜...")
    all_deals.extend(crawl_ruliweb())

    # 클리앙 알뜰구매
    print("\n[3/3] 클리앙 알뜰구매...")
    all_deals.extend(crawl_clien())

    print(f"\n총 {len(all_deals)}개 수집 완료")

    if all_deals:
        print("\n업로드 중...")
        upload_deals(all_deals)
    else:
        print("\n수집된 데이터가 없습니다.")

    print("\n완료!")


if __name__ == "__main__":
    run()
