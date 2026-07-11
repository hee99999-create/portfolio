# CLAUDE.md — Career Data Account (AI 포트폴리오 코치)

> 이 파일은 Claude Code의 **진입점**입니다. 이 프로젝트에서 작업을 시작할 때 가장 먼저 읽고,
> 여기 적힌 북극성·표준·안티패턴을 모든 코드/디자인 결정의 기준으로 삼습니다.
>
> ⚠️ 이 문서는 원본 콘텍스트 키트(`ai-portfolio-coach.zip`)를 분실하여,
> `career_data_account_landing.html`·`webapp_demo.html`·`claude-code-playbook.md`
> 3개 산출물에서 원칙을 **역추출**해 재작성한 것입니다. (재작성일: 2026-07-02)

---

## 0. 한 줄 정체성 (North Star / SMP)

> **활동 목록이 아니라, 증거 있는 역량 자산.**

학생의 경험(프로젝트·활동 링크)에서 AI가 역량을 발견하되, **모든 역량 부여는 반드시
원본 텍스트의 정확한 인용(evidence)에 근거**한다. 증거가 없으면 그 역량은 부여하지 않는다.

핵심 신념: **"AI가 답을 주지 않는다. 증거로 검증된 것만 자산이 된다."**

---

## 1. 제품 개념 (What it is)

학생이 자신의 경험 **링크를 붙여넣으면** →
1. 콘텐츠를 fetch (GitHub README/커밋, 블로그 본문 등)
2. Claude가 **STAR**(Situation·Task·Action·Result)로 분해
3. 같은 원본에서 **K-CESA / NCS 역량을 추출**
4. 각 역량에 **증거 인용(evidence_span)을 필수로 부착** — 증거 없으면 제외
5. "역량 자산 카드"로 대시보드에 축적

입학에서 졸업까지 학생의 성장을 **증거와 함께** 자산화하는 것이 목표.

### 사용자 3역할 (RBAC)
- **student(학생)** — 경험 등록, 자기 데이터 열람/통제 (기본 사용자)
- **professor(교수)** — 학생 동의 기반 성장 맥락 열람 (MVP 이후)
- **admin(관리자)** — 코호트 집계 통계만, 개별 추론 접근 불가 (MVP 이후)

---

## 2. 시장 차별화 (Why we're different)

기존 비교과/마일리지 시스템의 한계를 정면으로 반박한다:

| 기존의 한계 | 우리의 대응 |
|---|---|
| 마일리지 누적 PDF (활동의 양만 쌓임) | 증거 기반 **역량**으로 자산화 |
| 자율 입력 의존 (학생이 다 써야 함) | 링크만 주면 AI가 추출 |
| 역량 진단이 활동과 분리됨 | 활동 원본에서 역량을 **직접** 추출 |
| 교수 상담의 빈약한 근거 | 증거 인용이 붙은 성장 맥락 제공 |

**신뢰의 토대 3원칙**: ① 증거 기반 추출(할루시네이션 차단) ② 한국 표준(K-CESA·NCS) 매핑
③ 학생 데이터 통제권.

---

## 3. 핵심 IP: `evidence_spans` (절대 훼손 금지)

이 프로젝트의 지식재산은 **역량↔증거 연결**이다.

- 모든 competency에는 **최소 1개 이상의 evidence_span**이 있어야 한다.
- evidence_span의 `text`는 **원본 콘텐츠에 실제로 존재해야 한다** (Ctrl+F로 찾을 수 있어야 함).
- 찾을 수 없으면 = 할루시네이션 = 그 역량 제외 + 프롬프트 재설계.
- `confidence`(1–5)는 임의 숫자가 아니라 evidence 개수/질과 명확한 관계를 가진다.

이 규칙이 무너지면 제품의 존재 이유가 무너진다. → 상세: `product/standards.md`

---

## 4. 확정 기술 스택

**백엔드** — `backend/`
- Python 3.10+ · FastAPI · Pydantic v2
- DB: Supabase (PostgreSQL + **pgvector**), SQLAlchemy 또는 Supabase Python client
- AI: Anthropic **claude-sonnet-4-6** (역량 추출 코어)
- HTTP: httpx(async) · 파싱: BeautifulSoup4 + trafilatura · 재시도: tenacity
- 인증: JWT(python-jose/pyjwt) · 비밀번호 해싱 passlib bcrypt
- 패키지: uv/poetry 선호, 안 되면 requirements.txt

**프론트엔드** — `frontend/`
- Next.js 14 (App Router) · TypeScript strict
- Tailwind CSS + shadcn/ui (Radix)
- 폰트: Newsreader(serif) + Pretendard(sans) — next/font
- 데이터: React Query(TanStack) · 진행 상태: SSE 권장

**배포**: 프론트 Vercel · 백엔드 Railway/Fly.io · DB Supabase 클라우드

### DB 스키마 (4개 테이블, 모두 UUID PK · created_at 자동)
- `users`: id, email, name, university, major, grade, **role**(student/professor/admin), created_at
- `experiences`: id, user_id(FK), title, source_url, source_type, activity_type, period_start, period_end, raw_content, created_at
- `competencies`: id, name, **taxonomy**(K-CESA/NCS/CUSTOM), created_at
- `evidence_spans`: id, experience_id(FK), competency_id(FK), text_span, **confidence**(1–5), source_ref, created_at ← 핵심 IP

### 6개 페이지 (프론트 라우트)
`/`(홈) · `/how-it-works` · `/features` · `/preview` · `/login` · `/dashboard`
가장 중요한 화면은 **`/dashboard` + 링크 입력 모달** (핵심 UX).

---

## 5. 안티패턴 (§5 — 절대 하지 말 것)

작업 중 이 목록에 걸리면 멈추고 재설계한다.

### AI / 데이터
- ❌ 증거 없이 역량 점수 부여 (할루시네이션)
- ❌ 학생이 입력하지 않은 정보 추측
- ❌ confidence를 임의 숫자로 채움 (evidence와 무관하게)

### UX / 디자인
- ❌ 게이미피케이션 — 뱃지·레벨·진행률 게이지 (기존 마일리지 시스템 연상)
- ❌ 챗봇 말풍선 UI
- ❌ 알림 배지 남발
- ❌ 모션 남발 — 시그니처(인용 마커 페이드인) 외에는 절제
- ❌ URL 입력 필드에 정규식 검증 (붙여넣기 방해)
- ❌ 확정된 랜딩 디자인 훼손 / 새 색·새 폰트 추가 / Tailwind 기본 slate·gray 남용

### 인증 / 보안
- ❌ localStorage에 순수 JWT 저장 (→ httpOnly 쿠키)
- ❌ vague 에러 메시지 ("로그인 실패" → 구체적으로)
- ❌ 비밀번호 요구사항 없이 진행
- ❌ API 키·시크릿 하드코딩 (→ .env)

### 메타 원칙
- ❌ **자동 생성물 맹신** — Claude Code가 만든 코드도 검증 대상. 전제부터 의심한다.

---

## 6. 디자인 언어 (랜딩페이지에서 확정)

원천: `career_data_account_landing.html`. 새 프론트는 이 토큰을 **그대로 이식**한다.

- **색**: OKLCH 기반 3개 램프 — `ink`(먹), `paper`(종이), `gold`(금박 accent). 종이 질감 오버레이.
- **폰트**: `--font-serif` = Newsreader (제목), `--font-sans` = Pretendard (본문).
- **시그니처 모션**: 인용 마커 `.cite` — 역량 칩 옆 `[N]` 위첨자, 호버 시 evidence 텍스트 툴팁.
- **톤**: 아카이브·자산·신뢰. 흔한 SaaS 화면 회피. 절제된 정제미.

CSS 변수 전체 정의는 랜딩 HTML의 `<style>` 상단 `:root` 참조.

---

## 7. 작업 방법론 (플레이북 원칙)

`claude-code-playbook.md`가 Phase 0~6 단계별 실행 프롬프트를 담고 있다.

1. **한 Phase = 한 커밋 = 한 검증 게이트.** Phase 완료 시 반드시 커밋.
2. **각 Phase는 자체 완결** — 컨텍스트 리셋에도 최소 지시로 재개 가능.
3. **Lean 우선** — MVP = P2 증거 grounding + P4 역량 추출 + POST /experiences + 대시보드+모달.
4. **자동 생성 맹신 금지** — 특히 Phase 2 증거 추출 결과는 실제 원본에서 검증.

우선순위 페이즈(AI 코칭 파이프라인): **P2(증거 grounding) · P4(역량 추출) · P5(성찰 유도)**.

---

## 8. 참조 문서 지도

- `product/standards.md` — 반드시 준수할 기술 표준·원칙 (이 문서의 세부)
- `claude-code-playbook.md` — Phase 0~6 구현 실행 프롬프트
- `career_data_account_landing.html` — 확정 디자인 토큰의 원천
- `webapp_demo.html` — 살아있는 UX 명세 (6페이지 + FAB + 모달 프로토타입)
