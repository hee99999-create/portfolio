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

## 공개(https) 배포 — 배포 사이트(github.io)에서 실제 AI 쓰기

배포된 https 사이트는 http://localhost 백엔드를 부를 수 없습니다(mixed content 차단).
배포 사이트에서도 실제 AI를 쓰려면 백엔드를 **공개 https 주소**로 올려야 합니다.

### ⚠️ 배포 전 반드시 할 것 — 비용 방어

백엔드 주소가 공개되면 **그 주소를 아는 누구나 요청을 보내 내 OpenAI 크레딧을 소모**할 수 있습니다.
이 코드에는 최소한의 방어 장치가 들어 있지만, **가장 확실한 방어는 OpenAI 대시보드의 지출 상한**입니다.

1. https://platform.openai.com/settings/organization/limits 접속
2. **월 지출 한도(Usage limit)**를 감당 가능한 금액(예: $5)으로 설정
3. 코드 방어 장치(이미 적용됨, `main.py`):
   - `CDA_RATE_LIMIT_PER_HOUR` — IP당 시간당 분석 요청 수 제한 (기본 20회)
   - `CDA_MAX_TEXT_LEN` — 요청 텍스트 최대 길이 제한 (기본 6000자)
   - 초과 시 각각 `429`(요청 과다), `422`(입력 초과) 응답

### Render(무료)에 배포하는 단계

1. https://render.com 가입 (GitHub 계정으로 로그인 가능)
2. 대시보드에서 **New +** → **Blueprint** 선택
3. `hee99999-create/portfolio` 저장소 연결 → 저장소 루트의 `render.yaml`을 자동 인식함
4. `OPENAI_API_KEY` 환경변수만 직접 입력 (Render 대시보드 → Environment 탭)
   - 다른 값(`CDA_MODEL`, `CDA_ALLOWED_ORIGINS`, `CDA_RATE_LIMIT_PER_HOUR` 등)은 `render.yaml`에 이미 설정됨
5. **Deploy** 클릭 → 몇 분 후 `https://portri-ai-backend.onrender.com` 같은 주소가 생김
6. 브라우저에서 `https://그주소/health` 열어서 `{"status":"ok",...}` 확인
7. 배포된 프론트 사이트(github.io)에서 그 주소를 쓰도록 지정:
   - 사이트 접속 후 F12(개발자 도구) → Console 탭에 아래 입력:
     ```js
     localStorage.setItem('cda_api', 'https://portri-ai-backend.onrender.com')
     ```
   - 새로고침하면 우측 상단에 "🟢 AI 연결됨"이 떠야 함

> **무료 플랜 주의**: Render 무료 웹서비스는 15분간 요청이 없으면 잠들고,
> 다음 요청 시 깨어나는 데 30초~1분 정도 걸립니다(첫 분석이 느릴 수 있음 — 정상 동작).
