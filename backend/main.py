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
from typing import Optional

import httpx
import openai
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

load_dotenv()

MODEL = os.getenv("CDA_MODEL", "gpt-4o")
ORIGINS = [o.strip() for o in os.getenv("CDA_ALLOWED_ORIGINS", "*").split(",")]

client = OpenAI()  # OPENAI_API_KEY 를 환경에서 읽음

app = FastAPI(title="PORTRI AI — Competency Extraction API (OpenAI)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- K-CESA 6대 핵심역량 ----
KCESA = ["자기관리", "대인관계", "자원·정보·기술활용", "글로벌", "의사소통", "종합적사고력"]

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
    source_url: Optional[str] = Field(None, description="분석할 링크")
    text: Optional[str] = Field(None, description="링크 대신 직접 붙여넣은 텍스트/증빙 내용")
    title: Optional[str] = None
    category: Optional[str] = None


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
async def analyze(req: AnalyzeRequest):
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
        raise HTTPException(502, f"AI 분석 실패: {e}")

    # 3) function call 결과 파싱
    msg = resp.choices[0].message
    if not msg.tool_calls:
        raise HTTPException(502, "구조화된 결과를 받지 못했습니다.")
    try:
        result = json.loads(msg.tool_calls[0].function.arguments)
    except json.JSONDecodeError:
        raise HTTPException(502, "결과 파싱 실패.")

    # 4) 증거 검증: 인용문이 실제 원문에 존재하는 역량만 통과 (할루시네이션 차단)
    #    통과한 증거는 verified=True 로 표기 → 프론트 Evidence Index 계산에 반영됨
    verified = []
    for c in result.get("competencies", []):
        if c.get("evidence") and c["evidence"][:40] in content:
            c["verified"] = True
            verified.append(c)
    result["competencies"] = verified
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
def advise(req: AdviseRequest):
    profile = json.dumps(
        {"competencies": req.competencies, "categories": req.categories, "experiences": req.experiences},
        ensure_ascii=False,
    )
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
        raise HTTPException(502, f"AI 조언 실패: {e}")
    msg = resp.choices[0].message
    if not msg.tool_calls:
        raise HTTPException(502, "결과를 받지 못했습니다.")
    return json.loads(msg.tool_calls[0].function.arguments)
