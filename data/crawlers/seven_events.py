"""세븐일레븐 편의점 행사 크롤러 — 1+1, 2+1, 할인 상품 수집"""

import requests
from bs4 import BeautifulSoup
import re
import time
from .base import Deal

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.7-eleven.co.kr/product/presentList.asp",
    "Content-Type": "application/x-www-form-urlencoded",
}

AJAX_URL = "https://www.7-eleven.co.kr/product/listMoreAjax.asp"

# pTab: 1=1+1, 2=2+1, 3=증정행사, 4=할인행사
EVENT_TABS = {
    "1": "1+1",
    "2": "2+1",
    "4": "할인",
}


def crawl_events(tabs: dict[str, str] = None, page_size: int = 100) -> list[Deal]:
    """세븐일레븐 행사 상품 크롤링

    Args:
        tabs: {"1": "1+1", "2": "2+1", "4": "할인"} 등. None이면 전체.
        page_size: 페이지당 상품 수
    """
    target_tabs = tabs or EVENT_TABS
    all_deals = []

    for tab_id, label in target_tabs.items():
        page = 1

        while True:
            try:
                resp = requests.post(AJAX_URL, data={
                    "pTab": tab_id,
                    "intCurrPage": page,
                    "intPageSize": page_size,
                }, headers=HEADERS, timeout=10)

                soup = BeautifulSoup(resp.text, "html.parser")
                items = soup.select("li")

                # 실제 상품 li만 필터 (상품명이 있는 것)
                product_items = [li for li in items if li.select_one(".tit_product, .name")]

                if not product_items:
                    break

                for item in product_items:
                    try:
                        # 상품명
                        name_el = item.select_one(".tit_product") or item.select_one(".name")
                        if not name_el:
                            continue
                        name = name_el.text.strip()
                        if not name:
                            continue

                        # 가격
                        price = 0
                        price_el = item.select_one(".price_list span") or item.select_one(".price span")
                        if price_el:
                            price_text = price_el.text.strip().replace(",", "")
                            if price_text.isdigit():
                                price = int(price_text)

                        # 이미지 — /upload/ 경로 우선 선택
                        image_url = ""
                        for img_el in item.select("img[src]"):
                            src = img_el.get("src", "")
                            if not src or any(skip in src for skip in ["icon", "blank", "btn", "product_list"]):
                                continue
                            if src.startswith("/"):
                                image_url = f"https://www.7-eleven.co.kr{src}"
                                break
                            elif src.startswith("http"):
                                image_url = src
                                break

                        # 상품코드
                        source_id = ""
                        onclick = item.select_one("a[onclick]")
                        if onclick:
                            match = re.search(r"'(\d+)'", onclick.get("onclick", ""))
                            if match:
                                source_id = match.group(1)
                        if not source_id:
                            # fncGoView 패턴
                            link_el = item.select_one("a[href*='GoView'], a[onclick*='GoView']")
                            if link_el:
                                match = re.search(r"\([\'\"]?(\w+)", link_el.get("onclick", "") or link_el.get("href", ""))
                                if match:
                                    source_id = match.group(1)

                        all_deals.append(Deal(
                            title=f"[세븐일레븐 {label}] {name}",
                            url="https://www.7-eleven.co.kr/product/presentList.asp",
                            source="seven_eleven",
                            source_id=f"7e_{source_id}" if source_id else f"7e_{name}",
                            sale_price=price,
                            image_url=image_url,
                            category="편의점",
                            description=label,
                        ))

                    except Exception:
                        continue

                # 남은 상품 수 확인
                list_cnt_el = soup.select_one("#listCnt, input[id='listCnt']")
                remaining = 0
                if list_cnt_el:
                    try:
                        remaining = int(list_cnt_el.get("value", "0"))
                    except ValueError:
                        pass

                if page == 1 or page % 5 == 0:
                    print(f"  [세븐일레븐 {label}] 페이지 {page}: {len(product_items)}개 (누적 {len(all_deals)})")

                if remaining <= 0 and len(product_items) < page_size:
                    break

                page += 1
                time.sleep(0.3)

            except Exception as e:
                print(f"  [세븐일레븐 {label}] 페이지 {page} 실패: {e}")
                page += 1
                time.sleep(1)

    print(f"[세븐일레븐] 총 {len(all_deals)}개 행사 상품 수집")
    return all_deals


if __name__ == "__main__":
    deals = crawl_events(tabs={"1": "1+1"}, page_size=20)
    for d in deals[:10]:
        print(f"  {d.title} — {d.sale_price}원 | {d.image_url[:50] if d.image_url else 'no img'}...")
    print(f"\n총 {len(deals)}개")
