# PORTRI AI — 백엔드 (실제 역량 추출)

프론트엔드의 mock 분석을 **진짜 Claude 분석**으로 대체하는 FastAPI 서버입니다.
링크/텍스트 → 원본 fetch → Claude가 STAR 분해 + K-CESA 역량을 **증거 인용과 함께** 추출.
증거(원문 인용)가 실제 원문에 없으면 그 역량은 응답에서 제외됩니다(할루시네이션 차단).

## 필요한 것 (당신이 준비)

1. **Anthropic API 키** — https://console.anthropic.com 에서 발급 (유료, 사용량 과금)
2. **Python 3.10+** (이미 설치됨 — 3.14)

## 실행 (로컬)

```bash
cd C:\dev\portfolio\backend
python -m venv .venv
.venv\Scripts\activate            # PowerShell/CMD
pip install -r requirements.txt
copy .env.example .env            # .env 열어서 ANTHROPIC_API_KEY 채우기
uvicorn main:app --reload --port 8000
```

→ 브라우저에서 http://localhost:8000/docs (Swagger UI)에서 `/analyze` 테스트.

## 테스트 예시

```bash
curl -X POST http://localhost:8000/analyze -H "Content-Type: application/json" ^
  -d "{\"source_url\": \"https://raw.githubusercontent.com/facebook/react/main/README.md\"}"
```

## 프론트엔드 연결 (다음 단계)

`app/app.js`의 `startAnalysis()` / `makeExperience()`가 지금은 mock입니다.
백엔드를 켠 뒤, 그 함수에서 `fetch('http://localhost:8000/analyze', {...})`로
실제 결과를 받아 카드를 만들도록 바꾸면 진짜 앱이 됩니다. (원하면 제가 연결해 드립니다.)

## 주의

- `.env`(API 키)는 **절대 GitHub에 커밋하지 마세요.** (`.gitignore`로 제외됨)
- 모델 기본값은 `claude-opus-4-8`. 비용을 줄이려면 `.env`의 `CDA_MODEL=claude-sonnet-5`로 변경.
- 성적증명서/자격증 **이미지·PDF 인식**은 이 스캐폴드에 아직 없습니다(텍스트/링크만).
  추가하려면 Claude에 파일(vision/PDF) 입력을 붙이면 됩니다 — 다음 단계.
