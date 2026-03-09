"""크롤러 베이스 클래스"""

import requests
import json
import os
from dataclasses import dataclass, asdict
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv("API_URL", "https://everything-api.deri58.workers.dev")


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
    try:
        resp = requests.post(f"{API_URL}/api/deals", json=data)
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
