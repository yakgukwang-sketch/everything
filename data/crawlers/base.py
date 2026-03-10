"""크롤러 베이스 클래스"""

import requests
import json
import os
from dataclasses import dataclass, asdict
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv("API_URL", "https://everything-api.deri58.workers.dev")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")


@dataclass
class Store:
    name: str
    address: str
    road_address: str = ""
    phone: str = ""
    category: str = ""
    lat: float = 0.0
    lng: float = 0.0
    naver_id: str = ""
    kakao_id: str = ""
    source: str = ""
    menu_info: str = ""
    image_url: str = ""


@dataclass
class Deal:
    title: str
    url: str
    source: str
    description: str = ""
    original_price: int = 0
    sale_price: int = 0
    discount_rate: int = 0
    image_url: str = ""
    category: str = ""
    source_id: str = ""
    posted_at: str = ""
    expires_at: str = ""


def upload_deals(deals: list[Deal]):
    """수집한 딜을 API에 업로드"""
    data = [asdict(d) for d in deals]
    headers = {}
    if ADMIN_API_KEY:
        headers["Authorization"] = f"Bearer {ADMIN_API_KEY}"
    try:
        resp = requests.post(f"{API_URL}/api/deals", json=data, headers=headers)
        result = resp.json()
        print(f"Uploaded {result.get('inserted', 0)} deals")
        return result
    except Exception as e:
        print(f"Upload failed: {e}")
        # 로컬 백업
        with open("deals_backup.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("Saved backup to deals_backup.json")
        return None


def upload_stores(stores: list[Store]):
    """수집한 매장을 API에 업로드"""
    data = [asdict(s) for s in stores]
    headers = {}
    if ADMIN_API_KEY:
        headers["Authorization"] = f"Bearer {ADMIN_API_KEY}"
    try:
        resp = requests.post(f"{API_URL}/api/stores", json=data, headers=headers)
        result = resp.json()
        print(f"Uploaded {result.get('inserted', 0)} stores")
        return result
    except Exception as e:
        print(f"Upload failed: {e}")
        # 로컬 백업
        with open("stores_backup.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("Saved backup to stores_backup.json")
        return None
