# PORTRI AI — 백엔드 (실제 역량 추출, OpenAI)

프론트엔드의 mock 분석을 **진짜 OpenAI 분석**으로 대체하는 FastAPI 서버입니다.
링크/텍스트 → 원본 fetch → Claude가 STAR 분해 + K-CESA 역량을 **증거 인용과 함께** 추출.
증거(원문 인용)가 실제 원문에 없으면 그 역량은 응답에서 제외됩니다(할루시네이션 차단).

## 필요한 것 (당신이 준비)

1. **OpenAI API 키** — https://platform.openai.com/api-keys 에서 발급 (유료, 사용량 과금)
2. **Python 3.10+** (이미 설치됨 — 3.14)

## 실행 (로컬)

```bash
cd C:\dev\portfolio\backend
python -m venv .venv
.venv\Scripts\activate            # PowerShell/CMD
pip install -r requirements.txt
copy .env.example .env            # .env 열어서 OPENAI_API_KEY 채우기
uvicorn main:app --reload --port 8000
```

→ 브라우저에서 http://localhost:8000/docs (Swagger UI)에서 `/analyze` 테스트.

## 테스트 예시

```bash
curl -X POST http://localhost:8000/analyze -H "Content-Type: application/json" ^
  -d "{\"source_url\": \"https://raw.githubusercontent.com/facebook/react/main/README.md\"}"
```

## 프론트엔드 연결 (이미 되어 있음)

`app/app.js`가 이 백엔드를 자동으로 호출합니다:
- 경력관리에서 링크/파일로 경험 등록 → `POST /analyze` 호출 → 실제 역량 추출
- **백엔드가 꺼져 있으면 자동으로 mock으로 폴백**하므로 배포 사이트는 항상 동작합니다.

로컬에서 진짜로 쓰려면 **둘 다 로컬**로 띄우세요:
1. 백엔드: (위 실행 명령) → http://localhost:8000
2. 프론트: `cd app && python serve.py 8125` → http://localhost:8125

> 참고: 배포된 https 사이트(github.io)는 브라우저 보안(mixed content) 때문에
> http://localhost 백엔드를 호출하지 못합니다. 그래서 배포본은 mock으로 동작하고,
> 실제 AI 분석은 로컬(둘 다 http) 또는 백엔드를 https로 호스팅했을 때 작동합니다.
> 백엔드 주소를 바꾸려면 브라우저 콘솔에서 `localStorage.setItem('cda_api','https://내백엔드주소')`.

## 주의

- `.env`(API 키)는 **절대 GitHub에 커밋하지 마세요.** (`.gitignore`로 제외됨)
- 모델 기본값은 `gpt-4o`. 비용을 줄이려면 `.env`의 `CDA_MODEL=gpt-4o-mini`로 변경.
- 성적증명서/자격증 **이미지·PDF 인식**은 이 스캐폴드에 아직 없습니다(텍스트/링크만).
  추가하려면 OpenAI에 이미지(vision) 입력을 붙이면 됩니다 — 다음 단계.
