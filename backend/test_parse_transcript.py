# -*- coding: utf-8 -*-
"""
/parse-transcript 엔드포인트 테스트 — 실제 OpenAI 호출은 monkeypatch로 대체(비용 0원).

main.py를 import하려면 OPENAI_API_KEY 환경변수가 있어야 하므로(OpenAI() 생성자 요구사항),
테스트 전에 더미 키를 설정한다. 실제 네트워크 호출은 하지 않는다.

실행:
  cd backend
  python -m unittest test_parse_transcript.py -v
"""
import json
import os
import sys
import unittest

os.environ.setdefault("OPENAI_API_KEY", "sk-test-dummy")
os.environ["CDA_RATE_LIMIT_PER_HOUR"] = "0"  # 이 테스트에서는 rate limit을 별도로 다루지 않음
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class FakeToolCall:
    def __init__(self, arguments):
        self.function = type("F", (), {"name": "record_courses", "arguments": arguments})


class FakeMessage:
    def __init__(self, tool_calls):
        self.tool_calls = tool_calls


class FakeResponse:
    def __init__(self, tool_calls):
        self.choices = [type("C", (), {"message": FakeMessage(tool_calls)})]


def make_fake_create(courses):
    def _fake_create(*args, **kwargs):
        return FakeResponse([FakeToolCall(json.dumps({"courses": courses}))])
    return _fake_create


class ParseTranscriptTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self._orig_create = main.client.chat.completions.create

    def tearDown(self):
        main.client.chat.completions.create = self._orig_create

    def test_valid_courses_returned_as_is(self):
        main.client.chat.completions.create = make_fake_create([
            {"name": "자료구조", "division": "전공필수", "credit": 3, "grade": "A+"},
            {"name": "비판적 사고와 글쓰기", "division": "교양", "credit": 2, "grade": "B+"},
        ])
        r = self.client.post("/parse-transcript", json={"text": "자료구조 3학점 A+ ... 비판적 사고와 글쓰기 2학점 B+"})
        self.assertEqual(r.status_code, 200)
        courses = r.json()["courses"]
        self.assertEqual(len(courses), 2)
        self.assertEqual(courses[0]["name"], "자료구조")
        self.assertEqual(courses[0]["division"], "전공필수")
        self.assertEqual(courses[0]["grade"], "A+")

    def test_courses_with_invalid_division_or_grade_are_dropped(self):
        # 모델이 스키마를 어기는 극단적인 경우(enum 밖 값)에도 서버가 방어적으로 걸러낸다
        main.client.chat.completions.create = make_fake_create([
            {"name": "정상 과목", "division": "전공필수", "credit": 3, "grade": "A+"},
            {"name": "이상한 과목", "division": "부전공", "credit": 3, "grade": "A+"},   # division 밖
            {"name": "이상한 과목2", "division": "교양", "credit": 3, "grade": "S"},      # grade 밖
        ])
        r = self.client.post("/parse-transcript", json={"text": "임의의 성적증명서 텍스트"})
        self.assertEqual(r.status_code, 200)
        courses = r.json()["courses"]
        self.assertEqual(len(courses), 1)
        self.assertEqual(courses[0]["name"], "정상 과목")

    def test_empty_text_rejected(self):
        r = self.client.post("/parse-transcript", json={"text": "   "})
        self.assertEqual(r.status_code, 400)

    def test_text_over_max_length_rejected(self):
        too_long = "가" * (main.MAX_TEXT_LEN + 1)
        r = self.client.post("/parse-transcript", json={"text": too_long})
        self.assertEqual(r.status_code, 422)

    def test_no_tool_call_returns_502(self):
        def _no_tool_call(*args, **kwargs):
            return FakeResponse([])
        main.client.chat.completions.create = _no_tool_call
        r = self.client.post("/parse-transcript", json={"text": "성적증명서 텍스트"})
        self.assertEqual(r.status_code, 502)


if __name__ == "__main__":
    unittest.main(verbosity=2)
