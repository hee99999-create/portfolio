# -*- coding: utf-8 -*-
"""
/oauth/kakao-token, /oauth/kakao-profile 프록시 테스트 — 실제 카카오 API 호출은 대체(비용/네트워크 0).

실행:
  cd backend
  python -m unittest test_kakao_oauth.py -v
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
    def __init__(self, status_code=200, json_data=None, raise_error=None):
        self.status_code = status_code
        self.json_data = json_data if json_data is not None else {}
        self.raise_error = raise_error
        self.requested_url = None
        self.requested_headers = None
        self.requested_data = None

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, headers=None):
        self.requested_url, self.requested_headers = url, headers
        if self.raise_error:
            raise self.raise_error
        return FakeHTTPResponse(self.status_code, self.json_data)

    async def post(self, url, data=None, headers=None):
        self.requested_url, self.requested_data, self.requested_headers = url, data, headers
        if self.raise_error:
            raise self.raise_error
        return FakeHTTPResponse(self.status_code, self.json_data)


TOKEN_BODY = {"code": "auth-code", "redirect_uri": "http://localhost:8125/app/login.html", "client_id": "rest-key"}


class KakaoTokenTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self._orig = main.httpx.AsyncClient

    def tearDown(self):
        main.httpx.AsyncClient = self._orig

    def test_exchanges_code_with_exact_form_fields_and_no_secret(self):
        fake = FakeAsyncClient(200, {"access_token": "at-1", "token_type": "bearer"})
        main.httpx.AsyncClient = fake
        r = self.client.post("/oauth/kakao-token", json=TOKEN_BODY)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["access_token"], "at-1")
        self.assertEqual(fake.requested_url, "https://kauth.kakao.com/oauth/token")
        self.assertEqual(fake.requested_data, {
            "grant_type": "authorization_code",
            "client_id": "rest-key",
            "redirect_uri": "http://localhost:8125/app/login.html",
            "code": "auth-code",
        })
        self.assertNotIn("client_secret", fake.requested_data)

    def test_kakao_error_becomes_502(self):
        main.httpx.AsyncClient = FakeAsyncClient(400, {"error": "invalid_grant"})
        r = self.client.post("/oauth/kakao-token", json=TOKEN_BODY)
        self.assertEqual(r.status_code, 502)

    def test_network_error_becomes_502(self):
        main.httpx.AsyncClient = FakeAsyncClient(raise_error=httpx.ConnectError("boom"))
        r = self.client.post("/oauth/kakao-token", json=TOKEN_BODY)
        self.assertEqual(r.status_code, 502)

    def test_missing_code_rejected(self):
        r = self.client.post("/oauth/kakao-token", json={**TOKEN_BODY, "code": ""})
        self.assertEqual(r.status_code, 422)


class KakaoProfileTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self._orig = main.httpx.AsyncClient

    def tearDown(self):
        main.httpx.AsyncClient = self._orig

    def test_forwards_only_bearer_token(self):
        fake = FakeAsyncClient(200, {"kakao_account": {"profile": {"nickname": "은희"}}})
        main.httpx.AsyncClient = fake
        r = self.client.post("/oauth/kakao-profile", json={"access_token": "at-1"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["kakao_account"]["profile"]["nickname"], "은희")
        self.assertEqual(fake.requested_url, "https://kapi.kakao.com/v2/user/me")
        self.assertEqual(fake.requested_headers, {"Authorization": "Bearer at-1"})

    def test_invalid_token_becomes_502(self):
        main.httpx.AsyncClient = FakeAsyncClient(401, {"msg": "this access token does not exist"})
        r = self.client.post("/oauth/kakao-profile", json={"access_token": "bad"})
        self.assertEqual(r.status_code, 502)

    def test_empty_token_rejected(self):
        r = self.client.post("/oauth/kakao-profile", json={"access_token": ""})
        self.assertEqual(r.status_code, 422)


if __name__ == "__main__":
    unittest.main(verbosity=2)
