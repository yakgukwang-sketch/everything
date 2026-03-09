"""전체 크롤링 실행"""

from crawlers.base import upload_deals
from crawlers.ppomppu import crawl_hotdeal as crawl_ppomppu
from crawlers.ruliweb import crawl_hotdeal as crawl_ruliweb
from crawlers.clien import crawl_deals as crawl_clien
from crawlers.fmkorea import crawl_hotdeal as crawl_fmkorea
from crawlers.quasarzone import crawl_hotdeal as crawl_quasarzone
from crawlers.elevenst import crawl_hotdeal as crawl_11st
from crawlers.danawa import crawl_hotdeal as crawl_danawa
from crawlers.coupang_api import crawl_hotdeal as crawl_coupang_api
from crawlers.naver_api import crawl_hotdeal as crawl_naver_api
from crawlers.elevenst_api import crawl_hotdeal as crawl_11st_api
from crawlers.elevenst_search import crawl_hotdeal as crawl_11st_search
from crawlers.lotteon import crawl_hotdeal as crawl_lotteon
from crawlers.gsshop import crawl_hotdeal as crawl_gsshop

CRAWLERS = [
    # 공식 API (키 있으면 동작)
    ("쿠팡 파트너스 API", crawl_coupang_api),
    ("네이버 쇼핑 API", crawl_naver_api),
    ("11번가 오픈 API", crawl_11st_api),
    # 쇼핑몰 크롤링
    ("11번가 베스트", crawl_11st),
    ("다나와 가격비교", crawl_danawa),
    ("롯데온 베스트", crawl_lotteon),
    ("11번가 검색 핫딜", crawl_11st_search),
    ("GS샵 TV쇼핑", crawl_gsshop),
    # 커뮤니티 크롤링
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
