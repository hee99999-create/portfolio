# -*- coding: utf-8 -*-
"""
/oauth/naver-profile 프록시 테스트 — 실제 네이버 API 호출은 monkeypatch로 대체(비용/네트워크 0).

실행:
  cd backend
  python -m unittest test_naver_profile.py -v
"""
import os
import sys
import unittest

os.environ.setdefault("OPENAI_API_KEY", "sk-test-dummy")
os.environ["CDA_RATE_LIMIT_PER_HOUR"] = "0"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import httpx  # noqa: E402
import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class FakeHTTPResponse:
    def __init__(self, status_code, json_data):
        self.status_code = status_code
        self._json = json_data

    def json(self):
        return self._json


class FakeAsyncClient:
    """httpx.AsyncClient(...) as h: await h.get(...) 를 그대로 흉내낸다."""
    def __init__(self, status_code=200, json_data=None, raise_error=None):
        self.status_code = status_code
        self.json_data = json_data if json_data is not None else {}
        self.raise_error = raise_error
        self.requested_headers = None

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, headers=None):
        self.requested_headers = headers
        if self.raise_error:
            raise self.raise_error
        return FakeHTTPResponse(self.status_code, self.json_data)


class NaverProfileTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self._orig_async_client = main.httpx.AsyncClient

    def tearDown(self):
        main.httpx.AsyncClient = self._orig_async_client

    def test_valid_token_returns_profile_and_forwards_bearer_header(self):
        fake = FakeAsyncClient(200, {"resultcode": "00", "message": "success",
                                      "response": {"email": "a@b.com", "name": "김은희", "nickname": "eunhee"}})
        main.httpx.AsyncClient = fake
        r = self.client.post("/oauth/naver-profile", json={"access_token": "test-token-123"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["response"]["email"], "a@b.com")
        self.assertEqual(fake.requested_headers["Authorization"], "Bearer test-token-123")

    def test_naver_non_200_becomes_502(self):
        fake = FakeAsyncClient(401, {"error": "invalid_token"})
        main.httpx.AsyncClient = fake
        r = self.client.post("/oauth/naver-profile", json={"access_token": "bad-token"})
        self.assertEqual(r.status_code, 502)

    def test_network_error_becomes_502(self):
        fake = FakeAsyncClient(raise_error=httpx.ConnectError("boom"))
        main.httpx.AsyncClient = fake
        r = self.client.post("/oauth/naver-profile", json={"access_token": "t"})
        self.assertEqual(r.status_code, 502)

    def test_empty_token_rejected(self):
        r = self.client.post("/oauth/naver-profile", json={"access_token": ""})
        self.assertEqual(r.status_code, 422)

    def test_secret_never_sent(self):
        # 이 프록시는 클라이언트 시크릿을 절대 알거나 전송하지 않는다 — 오직 전달받은
        # access_token만 그대로 Authorization 헤더에 담아 중계한다.
        fake = FakeAsyncClient(200, {"response": {}})
        main.httpx.AsyncClient = fake
        self.client.post("/oauth/naver-profile", json={"access_token": "only-this-token"})
        self.assertEqual(fake.requested_headers, {"Authorization": "Bearer only-this-token"})
        self.assertNotIn("secret", str(fake.requested_headers).lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
