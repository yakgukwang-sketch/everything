"""쇼핑 데이터 일일 크롤링 스크립트

네이버 쇼핑: 329개 키워드 x 100개 = 최대 ~25,000개 상품
쿠팡 파트너스: 10개 키워드 x 10개 = 최대 ~100개 상품
합계: ~25,100개/일
"""

import sys
import time
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
load_dotenv()

from crawlers.naver_shopping import crawl_shopping
from crawlers.coupang import crawl_coupang
from crawlers.base import upload_deals

BATCH_SIZE = 50


def upload_batch(deals, source_name):
    """배치 업로드"""
    success = 0
    failed = 0
    for i in range(0, len(deals), BATCH_SIZE):
        batch = deals[i:i + BATCH_SIZE]
        result = upload_deals(batch)
        if result:
            success += result.get("inserted", 0)
        else:
            failed += len(batch)
        time.sleep(0.5)
    print(f"  [{source_name}] 업로드: 성공 {success}개, 실패 {failed}개")
    return success, failed


def main():
    start = datetime.now()
    print(f"=== 쇼핑 데이터 크롤링 시작: {start.strftime('%Y-%m-%d %H:%M:%S')} ===")

    total_collected = 0
    total_success = 0
    total_failed = 0

    # 1. 네이버 쇼핑 (329 키워드 x 100개)
    print("\n--- 네이버 쇼핑 ---")
    naver_deals = crawl_shopping()
    print(f"수집: {len(naver_deals)}개")
    total_collected += len(naver_deals)

    if naver_deals:
        s, f = upload_batch(naver_deals, "네이버쇼핑")
        total_success += s
        total_failed += f

    # 2. 쿠팡 (10 키워드 x 10개, 시간당 10회 제한)
    print("\n--- 쿠팡 ---")
    coupang_deals = crawl_coupang()
    print(f"수집: {len(coupang_deals)}개")
    total_collected += len(coupang_deals)

    if coupang_deals:
        s, f = upload_batch(coupang_deals, "쿠팡")
        total_success += s
        total_failed += f

    elapsed = (datetime.now() - start).total_seconds()
    print(f"\n=== 크롤링 완료 ===")
    print(f"  총 수집: {total_collected}개 (네이버 {len(naver_deals)} + 쿠팡 {len(coupang_deals)})")
    print(f"  업로드 성공: {total_success}개")
    print(f"  업로드 실패: {total_failed}개")
    print(f"  소요시간: {elapsed:.1f}초")


if __name__ == "__main__":
    main()
