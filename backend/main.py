"""
PORTRI AI — 백엔드 (증거 기반 역량 추출, OpenAI)

링크 또는 텍스트를 받아 원본을 가져오고, OpenAI로 STAR 분해 + K-CESA 역량을
'증거 인용'과 함께 추출한다. 증거(원문 인용)가 없는 역량은 응답에서 제외한다.

실행:
  cd backend
  python -m venv .venv && .venv\\Scripts\\activate   # (mac/linux: source .venv/bin/activate)
  pip install -r requirements.txt
  copy .env.example .env   # 그리고 OPENAI_API_KEY 채우기
  uvicorn main:app --reload --port 8000
  # → http://localhost:8000/docs 에서 테스트
"""
import json
import os
import threading
import time
from collections import defaultdict, deque
from typing import Optional

import httpx
import openai
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

from evidence_verification import verify_evidence_against_source, dedupe_competencies_by_evidence

load_dotenv()

MODEL = os.getenv("CDA_MODEL", "gpt-4o").strip()
ORIGINS = [o.strip() for o in os.getenv("CDA_ALLOWED_ORIGINS", "*").split(",")]

# 환경변수 값에 실수로 섞여 들어간 개행/공백을 방어적으로 제거한다.
# (실제로 겪은 장애: Render 대시보드에 키를 붙여넣을 때 끝에 개행(\n)이 함께
# 들어가면, Authorization 헤더 값에 개행이 섞여 httpx가 "Illegal header value"
# 로 모든 요청을 거부한다 — 겉으로는 502 "Connection error."로만 보여서
# 원인 파악이 어려웠다. 여기서 한 번 정리해두면 이런 실수가 재발해도 안전하다.)
_openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
client = OpenAI(api_key=_openai_key) if _openai_key else OpenAI()  # 값이 없으면 SDK 기본 동작 유지

# ============================================================
# 비용 방어: 사용량 제한 (Rate Limit) + 입력 길이 제한
# 백엔드가 공개 주소를 가지면 누구나 호출해 OpenAI 크레딧을 소모할 수 있다.
# 이 두 가지는 최소한의 방어선이며, 실제 지출 상한은 OpenAI 대시보드에서
# 별도로 설정해야 한다(코드로는 막을 수 없음).
# ============================================================
RATE_LIMIT_PER_HOUR = int(os.getenv("CDA_RATE_LIMIT_PER_HOUR", "20"))  # 0 이하 = 제한 없음(로컬 개발용)
RATE_LIMIT_WINDOW_SEC = 3600
MAX_TEXT_LEN = int(os.getenv("CDA_MAX_TEXT_LEN", "6000"))
# 성적증명서는 경험 서술문보다 훨씬 길 수 있다(여러 학기·페이지) — 별도 상수로 분리.
MAX_TRANSCRIPT_LEN = int(os.getenv("CDA_MAX_TRANSCRIPT_LEN", "20000"))

_rate_lock = threading.Lock()
_request_log: dict = defaultdict(deque)  # {ip: deque[timestamp, ...]}


def _client_ip(request: Request) -> str:
    """Render 등 프록시 뒤에서는 X-Forwarded-For 의 첫 값이 실제 클라이언트 IP."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _log_openai_error(tag: str, e: Exception):
    """OpenAI 호출 실패의 실제 원인을 서버 로그(Render Logs 등)에 남긴다.
    클라이언트에는 str(e)만 짧게 보여주지만, 진단하려면 예외 타입과 원인
    체인(__cause__)이 필요하다 — 502만 봐서는 네트워크/인증/타임아웃 중
    무엇인지 알 수 없다."""
    print(f"[{tag}] OpenAI 호출 실패: {type(e).__name__}: {e!r}")
    cause = getattr(e, "__cause__", None)
    if cause is not None:
        print(f"[{tag}]   원인(cause): {type(cause).__name__}: {cause!r}")


def check_rate_limit(request: Request):
    """IP당 시간당 요청 수를 제한한다. 초과 시 429를 던진다."""
    if RATE_LIMIT_PER_HOUR <= 0:
        return
    ip = _client_ip(request)
    now = time.time()
    with _rate_lock:
        q = _request_log[ip]
        while q and now - q[0] > RATE_LIMIT_WINDOW_SEC:
            q.popleft()
        if len(q) >= RATE_LIMIT_PER_HOUR:
            raise HTTPException(
                429,
                f"요청이 너무 많습니다. 이 서버는 시간당 최대 {RATE_LIMIT_PER_HOUR}회까지 분석할 수 있습니다. "
                f"잠시 후 다시 시도해주세요.",
            )
        q.append(now)

app = FastAPI(title="PORTRI AI — Competency Extraction API (OpenAI)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- K-CESA 6대 핵심역량 ----
KCESA = ["자기관리", "대인관계", "자원·정보·기술활용", "글로벌", "의사소통", "종합적사고력"]

# ---- 교과관리(성적증명서) 파싱용 어휘 — app.js/curricular.html과 동일하게 유지 ----
DIVISIONS = ["전공필수", "전공선택", "교양", "일반선택"]
GRADES = ["A+", "A0", "B+", "B0", "C+", "C0", "D+", "D0", "F"]

SYSTEM_PROMPT = (
    "당신은 학생의 경험에서 '검증 가능한 역량 증거'를 발견하는 코치입니다. "
    "학생의 역량 자체를 평가하지 않습니다. 오직 원본 텍스트에 실제로 존재하는 "
    "정확한 인용(evidence)을 근거로만 역량을 연결합니다(요약·창작 금지). "
    "증거가 없는 역량은 절대 포함하지 마세요. 추측하지 마세요. "
    "각 증거에는 그 인용이 왜 해당 역량에 연결되는지 competency_reason 을 원문에 나타난 행동으로 설명하세요. "
    "각 증거에는 강도(strengthLevel)를 1~4단계로 매기되, 반드시 인용된 원문 내용에만 근거해 판단하고, "
    "그 이유(strength_reason)를 원문에 나타난 사실로 설명하세요. 근거 없는 강도 평가는 금지합니다. "
    "강도 기준 — 1: 단순 참여/언급, 2: 구체적 행동 확인, "
    "3: 주도적 행동·문제해결·협업·의사결정 확인, 4: 구체적 행동과 측정 가능한 결과·성과가 함께 확인. "
    "역량명은 반드시 K-CESA 6대 핵심역량 중에서만 선택합니다: " + ", ".join(KCESA) + "."
)

# ---- 구조화 출력용 함수(OpenAI function calling) ----
EXTRACT_FUNCTION = {
    "type": "function",
    "function": {
        "name": "record_competencies",
        "description": "학생 경험에서 STAR와 증거 기반 K-CESA 역량을 기록한다.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string", "description": "경험 제목(없으면 생성)"},
                "star": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "situation": {"type": "string"},
                        "task": {"type": "string"},
                        "action": {"type": "string"},
                        "result": {"type": "string"},
                    },
                    "required": ["situation", "task", "action", "result"],
                },
                "competencies": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string", "enum": KCESA},
                            "confidence": {"type": "integer", "enum": [1, 2, 3, 4, 5]},
                            "evidence": {"type": "string", "description": "원문에서 그대로 인용한 문장"},
                            "competency_reason": {"type": "string", "description": "이 evidence가 왜 해당 K-CESA 역량에 연결되는지 — 원문에 나타난 행동으로 설명"},
                            "strengthLevel": {"type": "integer", "enum": [1, 2, 3, 4], "description": "1:단순참여 2:구체적행동 3:주도·문제해결 4:성과입증 (인용 원문 근거로만 판단)"},
                            "strength_reason": {"type": "string", "description": "그 강도로 판단한 이유 — 원문에 나타난 사실로 설명 (strengthLevel과 반드시 함께 반환)"},
                            "source_ref": {"type": "string", "description": "인용 위치(예: README.md, 3번째 문단)"},
                        },
                        "required": ["name", "confidence", "evidence", "competency_reason", "strengthLevel", "strength_reason", "source_ref"],
                    },
                },
            },
            "required": ["title", "star", "competencies"],
        },
    },
}


class AnalyzeRequest(BaseModel):
    source_url: Optional[str] = Field(None, max_length=2000, description="분석할 링크")
    text: Optional[str] = Field(None, max_length=MAX_TEXT_LEN, description="링크 대신 직접 붙여넣은 텍스트/증빙 내용")
    title: Optional[str] = Field(None, max_length=200)
    category: Optional[str] = Field(None, max_length=50)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL, "provider": "openai"}


async def fetch_url(url: str) -> str:
    """URL 본문을 가져와 텍스트로 추출 (GitHub raw README, 일반 웹 본문)."""
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as h:
        r = await h.get(url, headers={"User-Agent": "PORTRI-AI/1.0"})
        r.raise_for_status()
        ctype = r.headers.get("content-type", "")
        if "html" in ctype:
            soup = BeautifulSoup(r.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            text = soup.get_text("\n", strip=True)
        else:
            text = r.text
        return text[:20000]  # 과도한 길이 방지


@app.post("/analyze")
async def analyze(req: AnalyzeRequest, request: Request):
    check_rate_limit(request)
    # 1) 원본 콘텐츠 확보
    if req.text:
        content = req.text
        src = "제출 텍스트"
    elif req.source_url:
        try:
            content = await fetch_url(req.source_url)
        except Exception as e:
            raise HTTPException(400, f"링크를 가져오지 못했습니다: {e}")
        src = req.source_url
    else:
        raise HTTPException(400, "source_url 또는 text 중 하나는 필요합니다.")

    if not content.strip():
        raise HTTPException(400, "원본에서 분석할 내용을 찾지 못했습니다.")

    hint = f"제목 힌트: {req.title}\n" if req.title else ""
    hint += f"카테고리: {req.category}\n" if req.category else ""

    # 2) OpenAI 호출 (function calling 으로 구조화)
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            temperature=0,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"{hint}다음 경험 원본을 분석해 STAR와 K-CESA 역량을 추출하세요. "
                    f"각 역량에는 원문에서 그대로 인용한 evidence를 반드시 넣으세요.\n\n"
                    f"[원본 출처: {src}]\n\n{content}"
                )},
            ],
            tools=[EXTRACT_FUNCTION],
            tool_choice={"type": "function", "function": {"name": "record_competencies"}},
        )
    except openai.OpenAIError as e:
        _log_openai_error("analyze", e)
        raise HTTPException(502, f"AI 분석 실패: {e}")

    # 3) function call 결과 파싱
    msg = resp.choices[0].message
    if not msg.tool_calls:
        raise HTTPException(502, "구조화된 결과를 받지 못했습니다.")
    try:
        result = json.loads(msg.tool_calls[0].function.arguments)
    except json.JSONDecodeError:
        raise HTTPException(502, "결과 파싱 실패.")

    # 4) 증거 검증: evidence '전체' 문자열이 실제 원문에 존재하는 역량만 통과 (할루시네이션 차단)
    #    이전에는 evidence[:40] in content 처럼 앞 40자만 확인했음 — AI가 40자 뒤에
    #    원문에 없는 문장을 이어붙이거나, 서로 떨어진 문장을 합쳐도 통과하는 결함이 있었다.
    #    verify_evidence_against_source()는 전체 문자열을 대조하고, 통과한 것만
    #    verified=True 로 표기해 프론트 Evidence Index 계산에 반영되게 한다.
    checked = []
    for c in result.get("competencies", []):
        verdict = verify_evidence_against_source(c.get("evidence") or "", content)
        if not verdict["verified"]:
            continue
        c["verified"] = True
        c["sourceStart"] = verdict["sourceStart"]
        c["sourceEnd"] = verdict["sourceEnd"]
        checked.append(c)
    # 5) 동일하거나 공백/개행만 다른 Evidence가 중복 반환된 경우 하나만 남긴다
    result["competencies"] = dedupe_competencies_by_evidence(checked)
    result["source"] = src
    result["source_text"] = content          # 프론트 원문 재검증용
    result["taxonomy"] = "K-CESA"
    return result


# ============================================================
# AI 선배 — 전체 활동·역량 기반 진로/취업 조언
# ============================================================
class AdviseRequest(BaseModel):
    competencies: list = []   # [{name, score}]
    categories: list = []     # [{label, count}]
    experiences: list = []    # [{title, category}]


ADVISE_FUNCTION = {
    "type": "function",
    "function": {
        "name": "career_advice",
        "description": "학생의 누적 활동·역량을 근거로 진로/취업 방향을 조언한다.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "strengths": {"type": "string", "description": "강점 요약 2~3문장"},
                "careers": {
                    "type": "array",
                    "items": {
                        "type": "object", "additionalProperties": False,
                        "properties": {
                            "role": {"type": "string", "description": "추천 진로/직무"},
                            "why": {"type": "string", "description": "근거가 된 역량/활동"},
                        },
                        "required": ["role", "why"],
                    },
                },
                "gaps": {"type": "array", "items": {"type": "string"}, "description": "증거가 더 필요한 역량(능력 부족이 아니라 아직 기록·증거가 적은 영역)"},
                "next_actions": {"type": "array", "items": {"type": "string"}, "description": "그 역량의 증거를 만들 수 있는 다음 경험"},
                "encouragement": {"type": "string", "description": "한 줄 응원"},
            },
            "required": ["strengths", "careers", "gaps", "next_actions", "encouragement"],
        },
    },
}


@app.post("/advise")
def advise(req: AdviseRequest, request: Request):
    check_rate_limit(request)
    profile = json.dumps(
        {"competencies": req.competencies, "categories": req.categories, "experiences": req.experiences},
        ensure_ascii=False,
    )
    if len(profile) > MAX_TEXT_LEN * 2:
        raise HTTPException(400, "프로필 데이터가 너무 큽니다.")
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            temperature=0.3,
            messages=[
                {"role": "system", "content": (
                    "당신은 대학생의 진로·취업을 돕는 따뜻하지만 솔직한 선배입니다. "
                    "학생의 누적 경험에서 발견된 검증 가능한 역량 증거(역량 증거지수)에 근거해서만 조언하고, "
                    "데이터에 없는 사실은 지어내지 않습니다. 학생의 능력이 부족하다고 단정하지 말고, "
                    "'증거가 아직 적은 역량'으로 표현하세요. 구체적이고 실행 가능하게 말합니다."
                )},
                {"role": "user", "content": (
                    "다음은 한 학생의 역량 증거 프로필입니다(index=역량 증거지수, level=수준). "
                    "강점 요약, 추천 진로/직무 2~3개(각 근거), 증거가 더 필요한 역량, "
                    "그 증거를 만들 다음 경험, 한 줄 응원을 알려주세요.\n\n" + profile
                )},
            ],
            tools=[ADVISE_FUNCTION],
            tool_choice={"type": "function", "function": {"name": "career_advice"}},
        )
    except openai.OpenAIError as e:
        _log_openai_error("advise", e)
        raise HTTPException(502, f"AI 조언 실패: {e}")
    msg = resp.choices[0].message
    if not msg.tool_calls:
        raise HTTPException(502, "결과를 받지 못했습니다.")
    return json.loads(msg.tool_calls[0].function.arguments)


# ============================================================
# 교과관리 — 성적증명서 원문에서 수강 과목 추출
# 프론트(curricular.html)가 pdf.js로 PDF에서 뽑아낸 원문 텍스트를 보내면,
# 여기서 과목명/이수구분/학점/성적을 구조화해 돌려준다. 실제 K-CESA 점수
# 계산(analyzeTranscript)은 여전히 프론트에서 하고, 이 엔드포인트는
# "원문 텍스트 → 과목 목록"만 담당한다(책임 분리).
# ============================================================
class ParseTranscriptRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TRANSCRIPT_LEN, description="PDF에서 추출한 성적증명서 원문 텍스트")


PARSE_TRANSCRIPT_SYSTEM_PROMPT = (
    "당신은 한국 대학 성적증명서 원문에서 수강 과목 정보를 정확히 추출하는 도우미입니다. "
    "이 문서는 성적증명서가 아닐 수도 있습니다(예: 출장보고서, 활동보고서 등). "
    "과목명·이수구분·학점·성적이 함께 표기된 표나 목록이 원문에 실제로 존재할 때만 과목으로 기록하세요. "
    "그런 표나 목록을 전혀 찾을 수 없으면 courses를 빈 배열로 반환하세요 — 절대 지어내지 마세요. "
    "'프로젝트', '보고서', '활동' 같은 단어가 보인다고 해서 그것을 과목으로 만들지 마세요. "
    "각 과목에는 반드시 evidence(그 과목의 학점·성적이 표기된 원문 부분을 그대로, 요약·수정 없이 인용)를 "
    "포함하세요 — 원문에 실제로 존재하는 문자열이어야 합니다(검증합니다). "
    "이수구분은 반드시 다음 중 하나로 매핑하세요: " + ", ".join(DIVISIONS) + " "
    "(원문에 '전공기초', '핵심교양', '자유선택' 등 다른 명칭이 있으면 의미가 가장 가까운 항목으로 매핑하세요). "
    "성적은 반드시 다음 중 하나로 표기하세요: " + ", ".join(GRADES) + " "
    "(원문이 'A', '4.5', 'P/NP' 등 다른 표기여도 가장 가까운 항목으로 변환하세요. 판단할 수 없으면 그 과목은 제외하세요). "
    "학점(credit)은 원문에 명시된 정수 값을 그대로 사용하세요."
)

PARSE_TRANSCRIPT_FUNCTION = {
    "type": "function",
    "function": {
        "name": "record_courses",
        "description": "성적증명서 원문에서 수강 과목 목록을 기록한다. 과목표를 찾을 수 없으면 빈 배열을 반환한다.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "courses": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string", "description": "과목명 (원문 표기 그대로)"},
                            "division": {"type": "string", "enum": DIVISIONS},
                            "credit": {"type": "integer", "minimum": 1, "maximum": 6},
                            "grade": {"type": "string", "enum": GRADES},
                            "evidence": {"type": "string", "description": "이 과목의 학점·성적이 표기된 원문 부분을 그대로 인용 (예: '자료구조 전공필수 3 A+')"},
                        },
                        "required": ["name", "division", "credit", "grade", "evidence"],
                    },
                },
            },
            "required": ["courses"],
        },
    },
}


@app.post("/parse-transcript")
async def parse_transcript(req: ParseTranscriptRequest, request: Request):
    check_rate_limit(request)
    content = req.text.strip()
    if not content:
        raise HTTPException(400, "분석할 텍스트가 없습니다.")

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            temperature=0,
            messages=[
                {"role": "system", "content": PARSE_TRANSCRIPT_SYSTEM_PROMPT},
                {"role": "user", "content": f"다음 성적증명서 원문에서 수강 과목을 추출하세요.\n\n{content}"},
            ],
            tools=[PARSE_TRANSCRIPT_FUNCTION],
            tool_choice={"type": "function", "function": {"name": "record_courses"}},
        )
    except openai.OpenAIError as e:
        _log_openai_error("parse-transcript", e)
        raise HTTPException(502, f"성적증명서 분석 실패: {e}")

    msg = resp.choices[0].message
    if not msg.tool_calls:
        raise HTTPException(502, "구조화된 결과를 받지 못했습니다.")
    try:
        result = json.loads(msg.tool_calls[0].function.arguments)
    except json.JSONDecodeError:
        raise HTTPException(502, "결과 파싱 실패.")

    # 검증: evidence(그 과목 행을 그대로 인용한 원문)가 실제 원문에 존재하는 과목만 통과시킨다.
    # /analyze와 동일한 원칙 — 성적증명서가 아닌 문서를 넣었을 때 AI가 그럴듯한 과목을
    # 지어내는 것(예: 출장보고서의 '프로젝트'를 '전공선택 3학점 A0' 과목으로 둔갑시키는 것)을
    # 차단한다. enum을 벗어난 값도 함께 걸러낸다.
    valid_divisions, valid_grades = set(DIVISIONS), set(GRADES)
    courses = []
    for c in result.get("courses", []):
        if not (c.get("name") and c.get("division") in valid_divisions and c.get("grade") in valid_grades):
            continue
        verdict = verify_evidence_against_source(c.get("evidence") or "", content)
        if not verdict["verified"]:
            continue
        courses.append({"name": c["name"], "division": c["division"], "credit": c.get("credit"), "grade": c["grade"]})
    return {"courses": courses}


# ============================================================
# 네이버 로그인 — 프로필 조회 프록시
# 프론트(login.html)는 네이버 OAuth(암묵적 흐름)로 access_token만 브라우저에서
# 직접 받는다(클라이언트 시크릿 불필요). 다만 브라우저에서 네이버 프로필 API를
# 직접 호출하면 CORS로 차단되므로, 이 서버가 대신 호출해 그대로 중계한다.
# 시크릿을 저장하거나 사용하지 않으며, 전달받은 토큰만 그대로 넘긴다.
# ============================================================
class NaverProfileRequest(BaseModel):
    access_token: str = Field(..., min_length=1, max_length=2000)


@app.post("/oauth/naver-profile")
async def naver_profile(req: NaverProfileRequest, request: Request):
    check_rate_limit(request)
    try:
        async with httpx.AsyncClient(timeout=10) as h:
            r = await h.get(
                "https://openapi.naver.com/v1/nid/me",
                headers={"Authorization": f"Bearer {req.access_token}"},
            )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"네이버 프로필 조회 실패: {e}")
    if r.status_code != 200:
        raise HTTPException(502, f"네이버 프로필 조회 실패 (status {r.status_code})")
    try:
        data = r.json()
    except ValueError:
        raise HTTPException(502, "네이버 응답 파싱 실패.")
    return data


# ============================================================
# 카카오 로그인 — 인가 코드 교환 + 프로필 조회 프록시
# 카카오 JS SDK(v2)는 Auth.login(팝업)을 지원하지 않아 Auth.authorize(전체
# 페이지 리다이렉트, 인가 코드 방식)를 쓴다. 인가 코드를 access_token으로
# 바꾸는 카카오 토큰 엔드포인트는 브라우저에서 직접 호출할 수 없어(CORS)
# 이 서버가 대신 호출한다. REST API 키/클라이언트 ID는 카카오 문서상
# 공개 식별자이며(클라이언트 시크릿과 다름), 클라이언트 시크릿은 이 앱에서
# 사용하지 않는다.
# ============================================================
class KakaoTokenRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=2000)
    redirect_uri: str = Field(..., min_length=1, max_length=2000)
    client_id: str = Field(..., min_length=1, max_length=200)


@app.post("/oauth/kakao-token")
async def kakao_token(req: KakaoTokenRequest, request: Request):
    check_rate_limit(request)
    try:
        async with httpx.AsyncClient(timeout=10) as h:
            r = await h.post(
                "https://kauth.kakao.com/oauth/token",
                data={
                    "grant_type": "authorization_code",
                    "client_id": req.client_id,
                    "redirect_uri": req.redirect_uri,
                    "code": req.code,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"카카오 토큰 발급 실패: {e}")
    if r.status_code != 200:
        raise HTTPException(502, f"카카오 토큰 발급 실패 (status {r.status_code})")
    try:
        data = r.json()
    except ValueError:
        raise HTTPException(502, "카카오 토큰 응답 파싱 실패.")
    return data


class KakaoProfileRequest(BaseModel):
    access_token: str = Field(..., min_length=1, max_length=2000)


@app.post("/oauth/kakao-profile")
async def kakao_profile(req: KakaoProfileRequest, request: Request):
    check_rate_limit(request)
    try:
        async with httpx.AsyncClient(timeout=10) as h:
            r = await h.get(
                "https://kapi.kakao.com/v2/user/me",
                headers={"Authorization": f"Bearer {req.access_token}"},
            )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"카카오 프로필 조회 실패: {e}")
    if r.status_code != 200:
        raise HTTPException(502, f"카카오 프로필 조회 실패 (status {r.status_code})")
    try:
        data = r.json()
    except ValueError:
        raise HTTPException(502, "카카오 응답 파싱 실패.")
    return data
