---
type: playbook
project: Career Data Account — Claude Code 실행 프롬프트 시리즈
version: v1
date: 2026-06-27
scope: >
  ai-portfolio-coach 프로젝트 폴더에서 Claude Code를 실행한 상태에서,
  MVP를 Phase별로 붙여넣을 프롬프트 모음.
principle: >
  한 프롬프트 = 한 산출물 + 한 게이트. 커밋 단위이자 검증 단위.
  키트의 페이즈 원칙("한 번에 못 함")을 개발 프롬프트에도 그대로 적용.
---

# Claude Code 실행 프롬프트 — Career Data Account MVP

## 0. 사용법

### 사전 준비 (Phase 0 시작 전 1회)

**로컬 환경**:
```bash
# 1. 폴더 준비
mkdir -p ~/dev/career-data-account
cd ~/dev/career-data-account

# 2. ai-portfolio-coach.zip 압축 풀기 (콘텍스트 키트)
unzip ~/Downloads/ai-portfolio-coach.zip -d .

# 3. Git 초기화 (커밋 단위 관리)
cd ai-portfolio-coach
git init && git add . && git commit -m "chore: initial context kit"

# 4. Claude Code 실행
claude
```

**필요한 것**:
- Node.js 18+
- Python 3.10+
- Git
- Anthropic API 키 (`export ANTHROPIC_API_KEY=...`)
- (Phase 1 이후) Supabase 무료 계정

**Claude Code가 자동으로 하는 것**: `CLAUDE.md`를 진입점으로 읽어 프로젝트 전체 맥락(방법론·콘셉트·표준·안티패턴)을 로드합니다. 각 Phase 프롬프트에서 "CLAUDE.md 읽어" 같은 지시는 불필요합니다.

### 프롬프트 사용 방식

- 각 Phase의 **"▶ 붙여넣기"** 블록을 복사해 Claude Code에 붙여넣습니다.
- Claude Code가 여러 턴에 걸쳐 진행합니다 (파일 생성·명령 실행·수정 반복).
- Phase 완료 시 반드시 **"✔ 검증"** 항목을 통과시킨 뒤 다음 Phase로.
- 문제 발생 시 Phase 안에서 자유 대화 → 해결되면 커밋 → 다음.

### 원칙

1. **한 Phase = 한 커밋 단위.** Phase 완료 시 반드시 커밋.
2. **컨텍스트 리셋 대비.** 각 Phase 프롬프트는 자체 완결. 이전 결과가 있어도 최소한의 지시로 재개 가능.
3. **자동 생성 맹신 금지** (키트 메타 원칙). Claude Code가 만든 코드도 검증 대상.
4. **Lean 우선.** MVP는 P2 증거 grounding · P4 역량 추출 · POST /experiences · 대시보드 + 모달까지. 나머지는 나중.

---

## Phase 0 — 컨텍스트 확인 & 작업 계획 (5분)

### 목표
Claude Code가 프로젝트 맥락을 올바로 잡았는지 검증하고, 앞으로의 작업 계획을 명문화한다.

### ▶ 붙여넣기

```
프로젝트 맥락 확인 세션이야.

1. CLAUDE.md를 읽고 이 프로젝트의 북극성·시장 차별화·안티패턴을 3~4문장으로 요약해줘.
2. methodologies/ai-coaching-pipeline/00_ai-coaching-pipeline.md에서 페이즈 P0~P10 중
   MVP 구현 우선순위 3개를 골라 이유와 함께 알려줘.
3. product/standards.md에서 우리 시스템이 반드시 준수해야 할 표준·원칙을 5개 이내로 압축해줘.
4. 마지막으로, 앞으로 Phase 1~6에서 만들 것을 한 표로 요약해줘 (Phase / 산출물 / 검증 기준).

답변 후 아무 파일도 만들지 마. 계획만 정리하는 세션이야.
```

### ✔ 검증
- Claude Code가 "활동 목록이 아니라, 증거 있는 역량 자산"이라는 SMP를 정확히 인용하는가
- P2(증거 grounding)·P4(역량 추출)·P5(성찰 유도)를 우선순위로 꼽는가
- "증거 없는 주장 = 분석 거부"·"학생 주도성"·"K-CESA·NCS 매핑"을 원칙에 포함하는가

**통과하지 못하면**: `CLAUDE.md` 재확인. 안 되면 `claude --resume` 로 세션 다시 시작.

### 커밋
없음 (계획 확인만).

---

## Phase 1 — 백엔드 스켈레톤 (FastAPI + Supabase 연결) (30~60분)

### 목표
`backend/` 폴더에 최소 실행 가능한 FastAPI 앱 + Supabase 연결 + 기본 인증 스켈레톤.

### 산출물
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI 진입점
│   ├── config.py                  # 환경변수 로드
│   ├── db.py                      # Supabase 클라이언트
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── router.py              # /auth/login, /auth/signup
│   │   └── dependencies.py        # get_current_user
│   └── schemas/
│       └── user.py                # Pydantic 모델
├── migrations/
│   └── 001_initial.sql            # users, experiences, competencies 테이블
├── pyproject.toml                 # 또는 requirements.txt
├── .env.example
└── README.md
```

### ▶ 붙여넣기

```
Phase 1: 백엔드 스켈레톤을 만들어줘.

목표:
- backend/ 디렉토리에 FastAPI 앱 초기화
- Supabase 연결 (PostgreSQL + pgvector)
- 기본 인증 라우터 (이메일/비밀번호 + 카카오 소셜 로그인 자리)
- DB 마이그레이션 SQL (users, experiences, competencies, evidence_spans 4개 테이블)
- .env.example 및 README

제약:
- Python 3.10+, FastAPI, Pydantic v2, SQLAlchemy 또는 Supabase Python client
- pyproject.toml (uv 또는 poetry) 선호. 못하면 requirements.txt
- 실제 Supabase URL/KEY는 .env에서 로드 (하드코딩 금지)
- RBAC 준비: user.role 필드 (student / professor / admin)
- 모든 테이블 UUID PK, created_at/updated_at 자동 관리

DB 스키마 상세:
- users: id, email, name, university, major, grade, role, created_at
- experiences: id, user_id (FK), title, source_url, source_type, activity_type,
  period_start, period_end, raw_content (text), created_at
- competencies: id, name (예: "문제해결능력"), taxonomy (K-CESA/NCS/CUSTOM), created_at
- evidence_spans: id, experience_id (FK), competency_id (FK), text_span (text),
  confidence (1-5), source_ref (text), created_at

★ 중요: evidence_spans 테이블이 우리 IP의 핵심.
모든 역량 부여는 반드시 evidence_span과 연결되어야 함.

작업 순서:
1. pyproject.toml/requirements.txt 먼저 만들고 나에게 확인 받기
2. 확인 후 DB 마이그레이션 SQL 작성
3. main.py, config.py, db.py 순으로
4. 인증 라우터
5. README에 실행 방법

각 단계마다 파일 생성 후 잠깐 멈추고 나에게 확인 요청.
```

### ✔ 검증
```bash
cd backend
uv sync  # 또는 pip install -r requirements.txt
uvicorn app.main:app --reload
# → http://localhost:8000/docs 에서 Swagger UI 확인
# → /health 엔드포인트가 200 OK
# → /auth/signup, /auth/login 라우트 존재
```

Supabase 프로젝트 생성 후 `.env`에 URL/KEY 넣고 `migrations/001_initial.sql`을 Supabase SQL Editor에서 실행. 4개 테이블 생성 확인.

### 커밋
```bash
git add backend/
git commit -m "feat(backend): FastAPI skeleton with Supabase auth & schema"
```

---

## Phase 2 — POST /experiences (증거 grounding 코어) (1~2시간)

### 목표
우리 시스템의 **가장 중요한 엔드포인트**. 학생이 링크를 제출하면 → 콘텐츠 fetch → Claude API로 STAR 분해 + 증거 span 추출 → DB 저장.

### 산출물
```
backend/app/
├── experiences/
│   ├── __init__.py
│   ├── router.py                  # POST /experiences
│   ├── service.py                 # 비즈니스 로직
│   ├── extractor.py               # URL 콘텐츠 추출 (BeautifulSoup)
│   ├── ai_analyzer.py             # Claude API 호출
│   └── prompts.py                 # 프롬프트 템플릿
└── tests/
    └── test_experiences.py
```

### ▶ 붙여넣기

```
Phase 2: POST /experiences 엔드포인트를 만들어줘. 이게 시스템의 핵심 IP야.

요청 스펙:
POST /experiences
Authorization: Bearer <JWT>
Body: {
  "source_url": "https://github.com/user/capstone-project",  // 필수
  "title": "캡스톤 디자인 프로젝트",  // 선택 (없으면 AI가 생성)
  "activity_type": "capstone",  // 선택
  "period_start": "2025-03",  // 선택
  "period_end": "2025-06"  // 선택
}

응답:
{
  "experience_id": "uuid",
  "title": "...",
  "star": { "situation": "...", "task": "...", "action": "...", "result": "..." },
  "competencies": [
    {
      "name": "문제해결능력",
      "taxonomy": "NCS",
      "confidence": 4,
      "evidence_spans": [
        { "text": "실제 사용자 15명 인터뷰...", "source_ref": "README.md L23-25" }
      ]
    },
    ...
  ]
}

작동 순서:
1. URL 콘텐츠 fetch (extractor.py): GitHub은 README + 최근 커밋 메시지, 일반 웹은 og:description + article
2. Claude API로 STAR 분해 (ai_analyzer.py): raw_content → structured STAR
3. 동일 raw_content에서 역량 추출: K-CESA 6대 + NCS 10대 중 매칭
4. ★ 핵심 원칙: 모든 역량에는 반드시 evidence_span이 최소 1개 이상 있어야 함.
   증거 없으면 그 역량은 응답에 포함하지 않음 (할루시네이션 차단).
5. DB에 저장 후 응답

프롬프트 설계 (prompts.py):
- system 프롬프트: "당신은 학생 경험에서 역량을 추출하는 코치입니다.
  반드시 원본 텍스트의 정확한 인용(text_span)을 근거로만 역량을 부여합니다.
  증거가 없으면 그 역량은 제외합니다. 추측 금지."
- output_format: JSON strict (Anthropic tool_use 또는 JSON mode)
- few-shot: 2개 예시 포함 (하나는 증거 있음, 하나는 증거 없어서 역량 제외됨)

기술 결정:
- Claude API: claude-sonnet-4-6 (product/standards.md 참조)
- HTTP 클라이언트: httpx (async)
- HTML 파싱: BeautifulSoup4 + trafilatura (본문 추출 정확도 ↑)
- 각 external call에 timeout, retry (tenacity)

★ 안티패턴 (product/standards.md · CLAUDE.md 참조):
- 증거 없이 역량 점수 부여 (할루시네이션)
- 학생이 입력하지 않은 정보 추측
- confidence를 임의 숫자로 채움 (evidence 개수와 명확한 관계 필요)

작업 순서:
1. prompts.py 먼저 (프롬프트가 시스템 정확도의 90%). 나에게 프롬프트 리뷰 요청
2. extractor.py (GitHub 케이스 + 일반 URL 케이스)
3. ai_analyzer.py (Claude API 호출 + JSON 파싱)
4. service.py (오케스트레이션)
5. router.py (얇은 컨트롤러)
6. 마지막: test_experiences.py에 통합 테스트 1개 (실제 URL 하나로)

각 단계마다 파일 만들고 잠깐 멈춰.
프롬프트 설계 단계는 반드시 나에게 확인.
```

### ✔ 검증
```bash
# 1. 로컬 실행
uvicorn app.main:app --reload

# 2. 실제 URL로 요청
curl -X POST http://localhost:8000/experiences \
  -H "Authorization: Bearer <test_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"source_url": "https://github.com/facebook/react/blob/main/README.md"}'

# 3. 응답 검증
# - competencies가 반환되는가
# - 각 competency에 evidence_spans[0].text가 실제로 원본에 존재하는가 (증거 grounding)
# - 증거 없는 역량이 응답에 포함되지 않는가

# 4. DB 확인
# Supabase Table Editor에서 experiences, evidence_spans 테이블에 데이터 저장 확인
```

**핵심 검증**: 응답의 evidence_spans[].text를 원본 URL의 콘텐츠에서 Ctrl+F로 찾을 수 있어야 함. 못 찾으면 할루시네이션 = 프롬프트 재설계.

### 커밋
```bash
git commit -m "feat(backend): POST /experiences with evidence-grounded extraction"
```

---

## Phase 3 — 프론트엔드 스켈레톤 + 6 페이지 라우팅 (1시간)

### 목표
`frontend/` 폴더에 Next.js 14 프로젝트 + 6개 페이지 + 디자인 토큰 이식.

### 산출물
```
frontend/
├── app/
│   ├── layout.tsx                 # 전역 레이아웃 (폰트·토큰)
│   ├── page.tsx                   # / 홈
│   ├── how-it-works/page.tsx      # 작동방식
│   ├── features/page.tsx          # 주요기능
│   ├── preview/page.tsx           # 미리보기
│   ├── login/page.tsx             # 로그인
│   ├── dashboard/page.tsx         # 대시보드
│   └── globals.css                # 디자인 토큰 (OKLCH)
├── components/
│   ├── ui/                        # 재사용 컴포넌트
│   └── layout/
│       └── Nav.tsx
├── lib/
│   ├── api.ts                     # 백엔드 클라이언트
│   └── auth.ts                    # 인증 헬퍼
├── package.json
└── tailwind.config.ts
```

### ▶ 붙여넣기

```
Phase 3: Next.js 14 프론트엔드 스켈레톤을 만들어줘.

목표:
- frontend/ 폴더에 Next.js 14 App Router 초기화
- 6개 페이지 라우팅 (/, /how-it-works, /features, /preview, /login, /dashboard)
- 디자인 토큰 이식: outputs/landing-v1/career_data_account_landing.html의 CSS 변수를
  globals.css로 옮기고 Tailwind 확장에 매핑
- Newsreader + Pretendard 폰트 설정
- Nav 컴포넌트 (모든 페이지 공통)

기술 스택 (CLAUDE.md 확정):
- Next.js 14 App Router
- TypeScript strict mode
- Tailwind CSS + shadcn/ui (초기 설치만)
- 폰트: next/font로 Newsreader (Google Fonts) + Pretendard (로컬 또는 CDN)

각 페이지의 초기 콘텐츠는 placeholder로 최소만.
- /: 랜딩페이지 축약본 (기존 outputs/landing-v1/*.html의 HERO 섹션만)
- /how-it-works, /features, /preview: h1만 두고 나머지 나중에
- /login: 이메일+비밀번호 폼 (실제 백엔드 연동은 Phase 4)
- /dashboard: 빈 상태 + placeholder FAB (실제 구현은 Phase 5)

디자인 토큰은 outputs/landing-v1/career_data_account_landing.html의
<style> 첫 부분에 있는 CSS 변수를 그대로 이식.
Tailwind config에서 이 토큰들을 참조하도록 확장:
- colors: paper, ink, gold 각 램프
- fontFamily: serif = Newsreader, sans = Pretendard

★ 안티패턴 (instances/landing-v1/decisions.md 참조):
- 랜딩페이지에서 확정된 디자인을 무너뜨리지 마
- 새 색·새 폰트 추가 금지
- Tailwind 기본 slate/gray 남용 (우리 커스텀 토큰 사용)

작업 순서:
1. create-next-app 실행 → 확인
2. 폰트 · Tailwind config
3. globals.css (토큰 이식)
4. Nav 컴포넌트
5. 6개 페이지 (한 번에)
6. npm run dev로 확인

각 단계 후 잠깐 멈춰.
```

### ✔ 검증
```bash
cd frontend
npm run dev
# → http://localhost:3000 접속
# → 6개 라우트 모두 200 OK 응답
# → 폰트가 Newsreader + Pretendard로 표시되는지 (DevTools > Computed > font-family 확인)
# → 색 토큰이 CSS 변수로 적용되는지
```

### 커밋
```bash
git commit -m "feat(frontend): Next.js scaffold with 6 routes and design tokens"
```

---

## Phase 4 — 인증 flow 통합 + 로그인 페이지 (1시간)

### 목표
프론트-백엔드 인증 연결. 로그인 성공 시 대시보드로 리다이렉트.

### ▶ 붙여넣기

```
Phase 4: 인증 flow를 프론트-백엔드에 연결해줘.

프론트 (frontend/):
- lib/auth.ts: signup, login, logout, getSession 함수
- lib/api.ts: fetch 래퍼 (JWT 자동 첨부)
- /login 페이지 완성: 이메일+비밀번호 폼, 회원가입 토글, 에러 표시
- middleware.ts: /dashboard는 인증 필요, 미인증 시 /login으로

백엔드 (backend/, Phase 1에서 스켈레톤만 있음):
- /auth/signup, /auth/login 실제 구현
- JWT 발급 (python-jose 또는 pyjwt)
- 비밀번호 해싱 (passlib bcrypt)
- Supabase Auth 사용해도 되고 직접 구현해도 됨 — 결정 후 알려줘

디자인 요구:
- 로그인 페이지는 outputs/design-brief-v1.md § 8.5 참조
- "당신의 아카이브에 입장" 같은 콘셉트 유지 메시지
- 흔한 SaaS 로그인 화면 회피

카카오/네이버/Google 소셜 로그인은 자리만 두고 실구현은 스킵.

★ 안티패턴:
- 로컬 스토리지에 순수 JWT 저장 (httpOnly 쿠키 권장)
- 에러 메시지 vague ("로그인 실패" 대신 구체적으로)
- 비밀번호 요구사항 없이 진행

작업 순서:
1. 백엔드 인증 실제 구현 → 확인
2. 프론트 lib/auth.ts, lib/api.ts
3. /login 페이지 UI + 폼 로직
4. middleware.ts
5. 실제로 회원가입 → 로그인 → /dashboard 리다이렉트 테스트

각 단계 후 잠깐 멈춰.
```

### ✔ 검증
- 프론트에서 회원가입 → Supabase users 테이블에 유저 생성 확인
- 로그인 → JWT 발급 → /dashboard 접근 가능
- 로그아웃 → /login으로 리다이렉트
- 미인증 상태에서 /dashboard 직접 접근 시 /login으로 리다이렉트

### 커밋
```bash
git commit -m "feat: end-to-end auth flow with JWT"
```

---

## Phase 5 — 대시보드 + 링크 입력 모달 (★ 핵심 UX) (2~3시간)

### 목표
학생이 링크를 붙여넣으면 실제로 카드가 생성되는 완성 흐름.

### 산출물
- `/dashboard` 페이지 완성
- `+ FAB` 컴포넌트
- 링크 입력 모달 (자동 포커스, URL만 필수, 진행 상태 표시)
- 카드 그리드 컴포넌트
- 빈 상태 UI
- 백엔드 GET /experiences (대시보드 로드용)

### ▶ 붙여넣기

```
Phase 5: 대시보드 + 링크 입력 모달을 완성해줘. 이게 사용자가 가장 자주 마주치는 화면이야.

디자인 사양은 outputs/design-brief-v1.md § 8.6 (대시보드) 및 § 8.7 (모달) 참조.

★ 핵심 UX 요구:
- 우하단 플로팅 + 버튼 (56px, 골드 accent, 항상 보임)
- 클릭 시 모달 오픈 (모바일은 bottom sheet)
- 모달의 URL 입력에 자동 포커스
- URL만 필수, 다른 필드는 전부 선택
- "분석 시작" 버튼은 URL이 있을 때만 활성화

카드 그리드:
- 카탈로그 카드 형식 (outputs/landing-v1/career_data_account_landing.html의 hero artifact 참고)
- 각 카드: 제목, 기간, 역할, 추출 역량 칩 3개, 증거 개수, 등록번호
- 빈 상태: "첫 경험을 등록해보세요" + 화살표가 + 버튼 가리킴
- 카드 호버: subtle lift (translateY(-2px))

시그니처 모션 (인용 마커 페이드인):
- 카드의 역량 칩 옆에 [N] 인용 마커
- 호버 시 툴팁으로 evidence_span.text 표시

진행 상태 (모달):
- "링크에서 콘텐츠 가져오는 중…"
- "AI가 경험 분해 중…"
- "역량 추출 중…"
- 각 단계 8~12초. 절대 스켈레톤만 무한 표시 X
- 완료 → 모달 닫히고 새 카드가 대시보드 상단에 페이드인

백엔드 추가:
- GET /experiences → 현재 유저의 모든 경험 카드 반환
- Phase 2의 POST /experiences는 이미 완료

★ 안티패턴:
- 게이미피케이션 뱃지·레벨·진행률 게이지 (마일리지 시스템과 닮아 보임)
- 챗봇 말풍선 UI
- 알림 배지 남발
- 모션 남발 (인용 마커 외 절제)
- URL 필드에 정규식 검증 (paste 방해)

기술 결정:
- 모달: shadcn/ui Dialog 또는 Radix Dialog
- 상태 관리: React Query (Tanstack Query) — 백엔드 fetch
- 진행 상태: Server-Sent Events 또는 폴링 (SSE 권장)

작업 순서:
1. GET /experiences 백엔드부터
2. 대시보드 페이지 기본 레이아웃 + 카드 그리드 컴포넌트
3. FAB + 모달 UI (분석 실행 없이 UI만)
4. POST 연동 + 진행 상태 표시
5. 통합 테스트: 실제로 GitHub URL 붙여넣고 카드 생성되는지

각 단계 후 잠깐 멈춰.
```

### ✔ 검증
1. 로그인 → /dashboard 진입 → 빈 상태 표시
2. + 버튼 → 모달 오픈 → URL 필드에 자동 포커스
3. `https://github.com/facebook/react` 같은 URL 붙여넣기 → "분석 시작" 활성화
4. 클릭 → 진행 상태 표시 → 완료 → 대시보드에 새 카드 생성
5. 카드의 역량 칩에 [N] 인용 마커 → 호버 시 증거 텍스트 표시
6. 페이지 새로고침 → 카드 유지 (DB 저장 확인)
7. 모바일 뷰포트 (390x844) → FAB 우하단, 모달이 bottom sheet로 전환

### 커밋
```bash
git commit -m "feat: dashboard with FAB modal — evidence-grounded card flow"
```

---

## Phase 6 — 배포 (Vercel + Railway or Fly.io) (1시간)

### 목표
로컬만이 아니라 실제 URL에서 작동.

### ▶ 붙여넣기

```
Phase 6: 배포를 준비해줘.

프론트: Vercel
- vercel.json 설정
- 환경변수 (NEXT_PUBLIC_API_URL 등)
- 프로덕션 빌드 최적화 확인

백엔드: Railway 또는 Fly.io
- Dockerfile
- railway.json 또는 fly.toml
- 환경변수 (SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_API_KEY, JWT_SECRET)
- 헬스체크 엔드포인트 설정

DB: 이미 Supabase 클라우드

작업 순서:
1. 백엔드 Dockerfile → 로컬 build/run 테스트
2. 프론트 Vercel 설정
3. 배포 문서 (deploy.md)
4. 배포 URL 받은 후 프론트 환경변수 업데이트
5. E2E 테스트: 프로덕션 URL에서 회원가입 → 카드 등록 → 확인

★ 배포 전 체크:
- .env를 커밋에 넣지 않았는지
- CORS 프로덕션 도메인만 허용
- Supabase RLS(Row Level Security) 정책 활성화 — 학생은 자기 데이터만
- Anthropic API 비용 모니터링 설정
- Sentry 또는 다른 에러 트래킹 (선택)

각 단계 후 잠깐 멈춰.
```

### ✔ 검증
- 프로덕션 URL에서 회원가입 → 로그인 → 카드 등록 전체 흐름
- 모바일 실기기(iOS/Android)에서 접근
- 브라우저 콘솔 에러 0
- Lighthouse 스코어: Performance 80+, Accessibility 90+

### 커밋
```bash
git commit -m "chore: production deployment configuration"
```

---

## Phase 7 이후 (MVP 이후) — 우선순위 큐

MVP 완료 후 추가할 것 (당장 Claude Code 프롬프트 만들지 않고, 우선순위만):

### 7. AI 코칭 대화 (P5 성찰 유도)
- 카드 상세 페이지에서 AI가 성찰 질문 던짐
- ICF 코칭 코어 컴피턴시 기반
- 학생 답변이 evidence_spans에 추가되어 역량 재계산

### 8. 자소서 생성
- 여러 카드 선택 → 자소서 문항별 초안 생성
- 모든 문장에 증거 인용 footnote
- 편집·재생성

### 9. 교수 대시보드
- 학생 성장 맥락 요약
- RBAC (role=professor 접근 권한)
- 학생 동의 기반 열람

### 10. 관리자 통계
- 학생 코호트 역량 분포
- 개별 학생 추론 접근 불가 (집계만)
- K-CESA·NCS 매핑 리포트

### 11. RAG 벤치마크 (P7 진로 매핑)
- pgvector 활용
- 익명화된 선배 사례와 유사도
- 직무·산업 매칭

### 12. AI 코칭 파이프라인 페이즈 모듈 완성
- methodologies/ai-coaching-pipeline/의 P0~P10 모듈 각각 작성
- 각 모듈이 이 제품 구현의 참조 문서가 됨

---

## Claude Code 효율 사용 팁

### 세션 관리
```bash
# 새 세션 시작
claude

# 이전 세션 재개
claude --resume

# 세션 히스토리 보기
claude --list-sessions
```

### 컨텍스트 절약
- 큰 파일 참조는 Grep/Glob으로 조각만 읽기 요청
- "전체 파일 다시 읽지 말고 X 부분만 확인해줘"
- Phase 완료 시 세션 새로 시작 (컨텍스트 초기화 → 토큰 절약)

### 모델 전략
```
/model opusplan
```
계획은 Opus, 실행은 Sonnet — 대형 프로젝트에서 비용 효율적.

### 자주 쓰는 명령
```bash
# 특정 파일 시스템 검증만 (에이전트 사용 안 함)
!ls backend/app/
!cat backend/.env.example

# 특정 파일 확인
@backend/app/main.py

# 계획 모드 (실행 없이)
"Plan mode: 다음 작업 계획만 세워줘, 파일은 만들지 마"
```

### 문제 해결
- **컨텍스트 초과**: 세션 재시작 (`claude` 새로 실행) → CLAUDE.md 자동 재로드
- **결과가 안티패턴에 걸림**: "CLAUDE.md § 5 안티패턴 다시 확인하고 이 코드 검토해줘"
- **엉뚱한 방향으로 감**: Ctrl+C로 중단 → "잠깐, 다시 계획부터 세워보자"
- **긴 답변 남발**: "이 답변 너무 길어. 다음부터 핵심만 3줄로."

### 커밋 습관
매 Phase 완료 시 반드시 커밋. 다음이 잘못돼도 롤백 가능:
```bash
git log --oneline
git reset --hard <commit-hash>
```

---

## 예상 소요 시간 (Phase별)

| Phase | 이름 | 예상 시간 | 난이도 |
|---|---|---|---|
| 0 | 컨텍스트 확인 | 5분 | ⭐ |
| 1 | 백엔드 스켈레톤 | 30~60분 | ⭐⭐ |
| 2 | POST /experiences (증거 grounding) | 1~2시간 | ⭐⭐⭐⭐⭐ |
| 3 | 프론트 스켈레톤 | 1시간 | ⭐⭐ |
| 4 | 인증 flow | 1시간 | ⭐⭐⭐ |
| 5 | 대시보드 + 모달 | 2~3시간 | ⭐⭐⭐⭐ |
| 6 | 배포 | 1시간 | ⭐⭐⭐ |
| **합계** | | **6~10시간** | |

핵심은 **Phase 2** — 증거 grounding 프롬프트 설계. 여기가 시스템 정확도의 90%를 결정합니다.

MVP 완료 후 실제 학생 5명에게 테스트 → 피드백 → v2 우선순위 결정.

---

## 마지막 원칙 (다시 강조)

키트 마스터에서 말한 것:
> **자동 생성물(자동 기획서 포함) 맹신 금지. 전제부터 의심한다.**

이 원칙은 개발에도 적용됩니다:
- Claude Code가 만든 코드도 *검증 대상*
- 특히 Phase 2의 증거 추출 결과 — 실제 원본에서 Ctrl+F로 찾을 수 있는지 확인
- 프롬프트가 예상대로 작동하는지 최소 5개 실제 URL로 테스트
- 이 원칙이 무너지면 우리 제품의 핵심 가치도 무너진다

**"AI가 답을 주지 않는다. 증거로 검증된 것만 자산이 된다."**
