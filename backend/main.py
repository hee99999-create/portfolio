"""
PORTRI AI — 백엔드 (증거 기반 역량 추출)

링크 또는 텍스트를 받아 원본을 가져오고, Claude로 STAR 분해 + K-CESA 역량을
'증거 인용'과 함께 추출한다. 증거(원문 인용)가 없는 역량은 응답에서 제외한다.

실행:
  cd backend
  python -m venv .venv && . .venv/Scripts/activate   # (mac/linux: source .venv/bin/activate)
  pip install -r requirements.txt
  copy .env.example .env   # 그리고 ANTHROPIC_API_KEY 채우기
  uvicorn main:app --reload --port 8000
  # → http://localhost:8000/docs 에서 테스트
"""
import os
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import anthropic

load_dotenv()

MODEL = os.getenv("CDA_MODEL", "claude-opus-4-8")
ORIGINS = [o.strip() for o in os.getenv("CDA_ALLOWED_ORIGINS", "*").split(",")]

client = anthropic.Anthropic()  # ANTHROPIC_API_KEY 를 환경에서 읽음

app = FastAPI(title="PORTRI AI — Competency Extraction API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- K-CESA 6대 핵심역량 ----
KCESA = ["자기관리", "대인관계", "자원·정보·기술활용", "글로벌", "의사소통", "종합적사고력"]

SYSTEM_PROMPT = (
    "당신은 학생의 경험에서 역량을 추출하는 코치입니다. "
    "반드시 원본 텍스트의 정확한 인용(evidence)을 근거로만 역량을 부여합니다. "
    "인용은 원문에 실제로 존재하는 문장이어야 합니다(요약·창작 금지). "
    "증거가 없는 역량은 절대 포함하지 마세요. 추측하지 마세요. "
    "역량명은 반드시 K-CESA 6대 핵심역량 중에서만 선택합니다: " + ", ".join(KCESA) + "."
)

# ---- 구조화 출력용 도구(strict tool use) ----
EXTRACT_TOOL = {
    "name": "record_competencies",
    "description": "학생 경험에서 STAR와 증거 기반 K-CESA 역량을 기록한다.",
    "strict": True,
    "input_schema": {
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
                        "source_ref": {"type": "string", "description": "인용 위치(예: README.md, 3번째 문단)"},
                    },
                    "required": ["name", "confidence", "evidence", "source_ref"],
                },
            },
        },
        "required": ["title", "star", "competencies"],
    },
}


class AnalyzeRequest(BaseModel):
    source_url: Optional[str] = Field(None, description="분석할 링크")
    text: Optional[str] = Field(None, description="링크 대신 직접 붙여넣은 텍스트/증빙 내용")
    title: Optional[str] = None
    category: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}


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

    # 2) Claude 호출 (strict tool use 로 구조화)
    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=2000,
            system=SYSTEM_PROMPT,
            tools=[EXTRACT_TOOL],
            tool_choice={"type": "tool", "name": "record_competencies"},
            messages=[{
                "role": "user",
                "content": (
                    f"{hint}다음 경험 원본을 분석해 STAR와 K-CESA 역량을 추출하세요. "
                    f"각 역량에는 원문에서 그대로 인용한 evidence를 반드시 넣으세요.\n\n"
                    f"[원본 출처: {src}]\n\n{content}"
                ),
            }],
        )
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI 분석 실패: {e}")

    # 3) tool_use 블록에서 결과 추출
    result = next((b.input for b in resp.content if b.type == "tool_use"), None)
    if result is None:
        raise HTTPException(502, "구조화된 결과를 받지 못했습니다.")

    # 4) 증거 검증: 인용문이 실제 원문에 존재하는 역량만 통과 (할루시네이션 차단)
    verified = [
        c for c in result.get("competencies", [])
        if c.get("evidence") and c["evidence"][:40] in content
    ]
    result["competencies"] = verified
    result["source"] = src
    result["taxonomy"] = "K-CESA"
    return result
