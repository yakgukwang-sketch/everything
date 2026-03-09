"""크롤링 데이터를 Cloudflare D1에 업로드"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()


class D1Uploader:
    def __init__(self):
        self.account_id = os.getenv("CF_ACCOUNT_ID")
        self.api_token = os.getenv("CF_API_TOKEN")
        self.database_id = os.getenv("CF_D1_DATABASE_ID")
        self.base_url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/d1/database/{self.database_id}"

    def _headers(self):
        return {"Authorization": f"Bearer {self.api_token}"}

    def execute_sql(self, sql: str, params: list = None):
        """D1에 SQL 실행"""
        payload = {"sql": sql}
        if params:
            payload["params"] = params
        resp = requests.post(
            f"{self.base_url}/query",
            headers=self._headers(),
            json=payload,
        )
        return resp.json()

    def upload_restaurant(self, restaurant: dict):
        """음식점 데이터 업로드"""
        sql = """
        INSERT OR REPLACE INTO restaurants
        (name, address, lat, lng, category, phone, rating, review_count, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = [
            restaurant["name"],
            restaurant["address"],
            restaurant["lat"],
            restaurant["lng"],
            restaurant["category"],
            restaurant["phone"],
            restaurant["rating"],
            restaurant["review_count"],
            restaurant["source"],
        ]
        return self.execute_sql(sql, params)
