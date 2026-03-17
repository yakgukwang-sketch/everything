"""뽐뿌 데이터 분석 - 댓글 감성 분석 + 상세 페이지 크롤링 + 딜 스코어링"""

import json
import re
import os
import sys
import io
import time
import requests
from bs4 import BeautifulSoup
from collections import Counter, defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BULK_DIR = os.path.join(os.path.dirname(__file__), "bulk_output")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

# === 감성 분석 키워드 ===
POSITIVE_WORDS = [
    "좋", "싸다", "싸네", "쌈", "저렴", "개이득", "이득", "겟", "샀", "구매",
    "감사", "최저가", "역대", "대박", "꿀딜", "혜자", "착한", "추천", "강추",
    "갓", "ㄱㅇㄷ", "ㄱㅅ", "감솨", "굿", "good", "nice", "득템", "지름",
    "질렀", "샀어", "샀습", "주문", "결제", "완료", "고마", "땡큐", "개꿀",
    "핫딜", "가성비", "만족", "최고", "짱", "ㅊㅊ", "인생템", "미쳤",
]
NEGATIVE_WORDS = [
    "비싸", "비쌈", "별로", "가품", "사기", "쓰레기", "후회", "환불", "반품",
    "불량", "AS", "고장", "짝퉁", "거품", "뻥", "낚시", "바가지", "어제더쌌",
    "더비싸", "안좋", "최악", "폭탄", "쏠쏠", "ㅂㄹ", "노답",
]
SOLDOUT_WORDS = [
    "품절", "매진", "끝났", "종료", "sold", "out", "마감", "없어", "없네",
    "못사", "못삼", "늦었", "놓쳤", "ㅠ", "ㅜ",
]
QUESTION_WORDS = [
    "인가요", "일까요", "되나요", "할까요", "있나요", "어디서", "어떻게",
    "혹시", "문의", "질문", "궁금", "?",
]


def classify_comment(content: str) -> str:
    """댓글 감성 분류: positive / negative / soldout / question / neutral"""
    text = content.lower()

    # 품절 먼저 체크 (다른 감성과 겹칠 수 있음)
    soldout_score = sum(1 for w in SOLDOUT_WORDS if w in text)
    pos_score = sum(1 for w in POSITIVE_WORDS if w in text)
    neg_score = sum(1 for w in NEGATIVE_WORDS if w in text)
    q_score = sum(1 for w in QUESTION_WORDS if w in text)

    scores = {
        "positive": pos_score,
        "negative": neg_score,
        "soldout": soldout_score,
        "question": q_score,
    }

    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return "neutral"
    return best


def analyze_comments(posts, comments):
    """댓글 감성 분석 + 게시글별 집계"""
    print("\n" + "=" * 60)
    print("1단계: 댓글 감성 분석")
    print("=" * 60)

    # 댓글 분류
    classified = []
    for c in comments:
        sentiment = classify_comment(c["content"])
        classified.append({**c, "sentiment": sentiment})

    # 전체 분포
    dist = Counter(c["sentiment"] for c in classified)
    print(f"\n전체 감성 분포 ({len(classified)}개):")
    for s, cnt in dist.most_common():
        pct = cnt / len(classified) * 100
        print(f"  {s}: {cnt}개 ({pct:.1f}%)")

    # 게시글별 감성 집계
    by_post = defaultdict(lambda: {"positive": 0, "negative": 0, "soldout": 0, "question": 0, "neutral": 0, "total": 0})
    for c in classified:
        by_post[c["post_id"]][c["sentiment"]] += 1
        by_post[c["post_id"]]["total"] += 1

    # 긍정 비율 높은 게시글
    post_map = {p["source_id"]: p for p in posts}
    post_sentiments = []
    for pid, sent in by_post.items():
        if sent["total"] < 3:  # 댓글 3개 이상만
            continue
        pos_ratio = sent["positive"] / sent["total"]
        neg_ratio = sent["negative"] / sent["total"]
        soldout_ratio = sent["soldout"] / sent["total"]
        post = post_map.get(pid, {})
        post_sentiments.append({
            "source_id": pid,
            "title": post.get("title", ""),
            "rec_up": post.get("rec_up", 0),
            "rec_down": post.get("rec_down", 0),
            "views": post.get("views", 0),
            "sale_price": post.get("sale_price", 0),
            "comment_count": post.get("comment_count", 0),
            "analyzed_comments": sent["total"],
            "positive": sent["positive"],
            "negative": sent["negative"],
            "soldout": sent["soldout"],
            "pos_ratio": pos_ratio,
            "neg_ratio": neg_ratio,
            "soldout_ratio": soldout_ratio,
        })

    print(f"\n댓글 3개 이상 게시글: {len(post_sentiments)}개")

    # 긍정 비율 TOP
    print("\n--- 긍정 반응 TOP 10 ---")
    by_pos = sorted(post_sentiments, key=lambda x: (x["pos_ratio"], x["positive"]), reverse=True)[:10]
    for p in by_pos:
        print(f"  긍정={p['positive']}/{p['analyzed_comments']} ({p['pos_ratio']:.0%}) 추천={p['rec_up']}")
        print(f"    {p['title'][:70]}")

    # 부정 반응 TOP
    print("\n--- 부정 반응 TOP 5 ---")
    by_neg = sorted(post_sentiments, key=lambda x: (x["neg_ratio"], x["negative"]), reverse=True)[:5]
    for p in by_neg:
        print(f"  부정={p['negative']}/{p['analyzed_comments']} ({p['neg_ratio']:.0%}) 추천={p['rec_up']}")
        print(f"    {p['title'][:70]}")

    # 품절 많은 글
    print("\n--- 품절 반응 TOP 5 ---")
    by_sold = sorted(post_sentiments, key=lambda x: (x["soldout_ratio"], x["soldout"]), reverse=True)[:5]
    for p in by_sold:
        print(f"  품절={p['soldout']}/{p['analyzed_comments']} ({p['soldout_ratio']:.0%})")
        print(f"    {p['title'][:70]}")

    return classified, post_sentiments


def crawl_detail_pages(posts, max_posts=50):
    """상세 페이지에서 원가/할인율/배송비/쿠폰 추출"""
    print("\n" + "=" * 60)
    print("2단계: 상세 페이지 크롤링 (TOP 50)")
    print("=" * 60)

    # 추천 높은 순으로 50개
    targets = sorted(posts, key=lambda x: x["rec_up"], reverse=True)[:max_posts]
    details = []

    for i, post in enumerate(targets, 1):
        try:
            url = post["url"]
            resp = requests.get(url, headers=HEADERS, timeout=10)
            text = resp.content.decode("euc-kr", errors="replace")
            soup = BeautifulSoup(text, "html.parser")

            body = soup.select_one("div.sub_content, div.board-contents, td.board-contents")
            body_text = body.get_text(separator=" ", strip=True) if body else ""

            # 원가 추출
            original_price = 0
            orig_patterns = [
                r"정가\s*:?\s*([\d,]+)\s*원",
                r"원가\s*:?\s*([\d,]+)\s*원",
                r"판매가\s*:?\s*([\d,]+)\s*원",
                r"소비자가\s*:?\s*([\d,]+)\s*원",
                r"정상가\s*:?\s*([\d,]+)\s*원",
            ]
            for pat in orig_patterns:
                m = re.search(pat, body_text)
                if m:
                    original_price = int(m.group(1).replace(",", ""))
                    break

            # 할인율 추출
            discount_pct = 0
            disc_m = re.search(r"(\d{1,2})\s*%\s*(할인|off|세일|DC)", body_text, re.IGNORECASE)
            if disc_m:
                discount_pct = int(disc_m.group(1))
            elif original_price > 0 and post["sale_price"] > 0 and original_price > post["sale_price"]:
                discount_pct = round((1 - post["sale_price"] / original_price) * 100)

            # 배송비
            shipping = "확인필요"
            if re.search(r"무료\s*배송|무배|배송\s*무료|무료배송", body_text):
                shipping = "무료"
            elif re.search(r"배송비\s*:?\s*([\d,]+)", body_text):
                sm = re.search(r"배송비\s*:?\s*([\d,]+)", body_text)
                shipping = f"{sm.group(1)}원"

            # 쿠폰
            has_coupon = bool(re.search(r"쿠폰|coupon|할인코드|프로모코드|적용시", body_text, re.IGNORECASE))

            # 품절 여부
            is_soldout = bool(re.search(r"품절|매진|sold\s*out|마감|종료", body_text, re.IGNORECASE))

            # 구매 링크
            buy_links = []
            for a in (body.select("a[href]") if body else []):
                href = a.get("href", "")
                if any(d in href for d in ["coupang", "11st", "gmarket", "auction", "naver", "tmon", "wemake"]):
                    buy_links.append(href)

            detail = {
                "source_id": post["source_id"],
                "title": post["title"],
                "sale_price": post["sale_price"],
                "original_price": original_price,
                "discount_pct": discount_pct,
                "shipping": shipping,
                "has_coupon": has_coupon,
                "is_soldout": is_soldout,
                "buy_link_count": len(buy_links),
                "rec_up": post["rec_up"],
                "rec_down": post["rec_down"],
                "views": post["views"],
                "comment_count": post["comment_count"],
                "body_length": len(body_text),
            }
            details.append(detail)

            if i % 10 == 0:
                print(f"  상세 {i}/{len(targets)} 완료")

            time.sleep(1)

        except Exception as e:
            if i % 10 == 0:
                print(f"  상세 {i}/{len(targets)} 실패: {e}")
            continue

    print(f"\n상세 수집 완료: {len(details)}개")

    # 할인율 있는 것들
    with_discount = [d for d in details if d["discount_pct"] > 0]
    print(f"할인율 파악 가능: {len(with_discount)}개")

    if with_discount:
        print("\n--- 할인율 TOP 10 ---")
        by_disc = sorted(with_discount, key=lambda x: x["discount_pct"], reverse=True)[:10]
        for d in by_disc:
            print(f"  {d['discount_pct']}% 할인 | {d['original_price']:,}원 -> {d['sale_price']:,}원 | 추천={d['rec_up']}")
            print(f"    {d['title'][:70]}")

    # 쿠폰 있는 것들
    with_coupon = [d for d in details if d["has_coupon"]]
    print(f"\n쿠폰/할인코드 있음: {len(with_coupon)}개")

    # 품절
    soldout = [d for d in details if d["is_soldout"]]
    print(f"품절 표시: {len(soldout)}개")

    return details


def score_deals(posts, post_sentiments, details):
    """종합 딜 스코어 계산"""
    print("\n" + "=" * 60)
    print("3단계: 종합 딜 스코어링")
    print("=" * 60)

    sentiment_map = {p["source_id"]: p for p in post_sentiments}
    detail_map = {d["source_id"]: d for d in details}

    scored = []
    for post in posts:
        pid = post["source_id"]
        sent = sentiment_map.get(pid, {})
        det = detail_map.get(pid, {})

        # 스코어 계산 (100점 만점)
        score = 0

        # 1. 추천 점수 (최대 30점)
        rec_score = min(post["rec_up"] * 0.5, 30)
        # 비추 감점
        rec_score -= post["rec_down"] * 2
        rec_score = max(rec_score, 0)
        score += rec_score

        # 2. 조회수 점수 (최대 15점) - 관심도
        if post["views"] > 0:
            view_score = min(post["views"] / 3000, 15)
            score += view_score

        # 3. 댓글 감성 점수 (최대 25점)
        if sent:
            pos_ratio = sent.get("pos_ratio", 0)
            neg_ratio = sent.get("neg_ratio", 0)
            soldout_ratio = sent.get("soldout_ratio", 0)
            score += pos_ratio * 20
            score -= neg_ratio * 15
            # 품절이면 감점
            if soldout_ratio > 0.3:
                score -= 10

        # 4. 할인율 점수 (최대 20점)
        discount = det.get("discount_pct", 0)
        if discount > 0:
            score += min(discount * 0.4, 20)

        # 5. 쿠폰/배송 보너스 (최대 10점)
        if det.get("has_coupon"):
            score += 3
        if det.get("shipping") == "무료":
            score += 5
        if det.get("is_soldout"):
            score -= 20  # 품절 대감점

        scored.append({
            "source_id": pid,
            "title": post["title"],
            "url": post["url"],
            "category": post["category"],
            "sale_price": post["sale_price"],
            "rec_up": post["rec_up"],
            "rec_down": post["rec_down"],
            "views": post["views"],
            "comment_count": post["comment_count"],
            "pos_ratio": sent.get("pos_ratio", 0) if sent else None,
            "discount_pct": det.get("discount_pct", 0),
            "shipping": det.get("shipping", ""),
            "is_soldout": det.get("is_soldout", False),
            "score": round(score, 1),
        })

    scored.sort(key=lambda x: x["score"], reverse=True)

    # TOP 20 출력
    print("\n=== 종합 스코어 TOP 20 (진짜 좋은 딜) ===\n")
    for rank, deal in enumerate(scored[:20], 1):
        soldout_tag = " [품절]" if deal["is_soldout"] else ""
        price_tag = f" {deal['sale_price']:,}원" if deal["sale_price"] > 0 else ""
        discount_tag = f" ({deal['discount_pct']}%할인)" if deal["discount_pct"] > 0 else ""
        pos_tag = f" 긍정={deal['pos_ratio']:.0%}" if deal["pos_ratio"] is not None else ""

        print(f"  #{rank} [{deal['score']}점] {deal['title'][:65]}")
        print(f"     추천={deal['rec_up']} 조회={deal['views']:,}{price_tag}{discount_tag}{pos_tag}{soldout_tag}")
        print()

    # WORST 10
    print("=== 종합 스코어 WORST 10 (피해야 할 딜) ===\n")
    for rank, deal in enumerate(scored[-10:], 1):
        print(f"  #{rank} [{deal['score']}점] {deal['title'][:65]}")
        print(f"     추천={deal['rec_up']} 비추={deal['rec_down']} 조회={deal['views']:,}")
        print()

    return scored


def main():
    # 데이터 로드
    with open(os.path.join(BULK_DIR, "ppomppu_posts.json"), "r", encoding="utf-8") as f:
        posts = json.load(f)
    with open(os.path.join(BULK_DIR, "ppomppu_comments.json"), "r", encoding="utf-8") as f:
        comments = json.load(f)

    print(f"데이터 로드: 게시글 {len(posts)}개, 댓글 {len(comments)}개")

    # 1. 댓글 감성 분석
    classified_comments, post_sentiments = analyze_comments(posts, comments)

    # 2. 상세 페이지 크롤링
    details = crawl_detail_pages(posts, max_posts=50)

    # 3. 종합 스코어링
    scored = score_deals(posts, post_sentiments, details)

    # 결과 저장
    output = {
        "summary": {
            "total_posts": len(posts),
            "total_comments": len(comments),
            "analyzed_posts": len(post_sentiments),
            "detail_crawled": len(details),
            "top_score": scored[0]["score"] if scored else 0,
        },
        "top_deals": scored[:50],
        "worst_deals": scored[-20:],
        "comment_sentiments": post_sentiments,
        "detail_info": details,
    }

    output_path = os.path.join(BULK_DIR, "ppomppu_analysis.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n결과 저장: {output_path}")

    # 분류된 댓글도 저장
    classified_path = os.path.join(BULK_DIR, "ppomppu_comments_classified.json")
    with open(classified_path, "w", encoding="utf-8") as f:
        json.dump(classified_comments, f, ensure_ascii=False, indent=2)
    print(f"분류 댓글 저장: {classified_path}")


if __name__ == "__main__":
    main()
