# product/standards.md — 시스템 준수 표준

> Career Data Account가 **반드시 준수해야 할** 기술·제품 표준.
> `CLAUDE.md`의 세부 규범이며, 코드 리뷰·검증의 기준선이다.
> (역추출 재작성: 2026-07-02 — 원천: 플레이북 · 랜딩 · 데모)

---

## 1. 5대 핵심 원칙 (요약 — 이것부터 외운다)

1. **증거 없는 주장 = 분석 거부.** 모든 역량은 원본 인용(evidence_span)에 근거한다. 없으면 제외.
2. **학생 주도성(Student Agency).** 학생이 자기 데이터의 주인. AI는 발견을 돕되 대신 결정하지 않는다.
3. **한국 표준 매핑.** 역량은 K-CESA 6대 · NCS 10대 직업기초능력 체계로 매핑한다.
4. **자동 생성물 맹신 금지.** AI(및 이 시스템)가 만든 결과도 검증 대상. 전제부터 의심한다.
5. **확정 디자인 보존.** 랜딩에서 확정된 토큰·톤을 지킨다. 새 색·폰트·게이미피케이션 금지.

---

## 2. 증거 grounding 표준 (제품의 심장)

### 필수 규칙
- 모든 `competency`에는 **evidence_span ≥ 1**. 0개면 응답에서 제외한다.
- `evidence_span.text`(=text_span)는 **원본 raw_content의 실제 문자열**이어야 한다.
  - 검증법: 응답의 인용 텍스트를 원본 URL에서 Ctrl+F로 찾을 수 있어야 한다.
  - 못 찾으면 = 할루시네이션 = 실패. 프롬프트를 재설계한다.
- `source_ref`는 인용 위치를 가리킨다 (예: `README.md L23-25`).
- `confidence`(1–5)는 **evidence의 개수·질과 명확한 함수**여야 한다. 임의 숫자 금지.

### 프롬프트 설계 표준 (`prompts.py`)
- system 프롬프트 핵심 문장:
  > "당신은 학생 경험에서 역량을 추출하는 코치입니다. 반드시 원본 텍스트의 정확한
  > 인용(text_span)을 근거로만 역량을 부여합니다. 증거가 없으면 그 역량은 제외합니다. 추측 금지."
- 출력: **JSON strict** (Anthropic tool_use 또는 JSON mode). 자유서술 파싱 금지.
- few-shot **2개** 포함: 하나는 증거 있어 부여됨, 하나는 증거 없어 **제외됨** (거부 사례 학습).
- 프롬프트가 시스템 정확도의 **90%**. 변경 시 최소 5개 실제 URL로 회귀 검증.

---

## 3. 역량 분류 체계 (Taxonomy)

`competencies.taxonomy` ∈ { `K-CESA`, `NCS`, `CUSTOM` }.

- **K-CESA (6대 핵심역량)**: 자기관리 · 대인관계 · 자원정보기술활용 · 글로벌 · 의사소통 · 종합적사고력
- **NCS (10대 직업기초능력)**: 의사소통 · 수리 · 문제해결 · 자기개발 · 자원관리 · 대인관계 · 정보 · 기술 · 조직이해 · 직업윤리
- **CUSTOM**: 위 체계에 없으나 증거로 뚜렷이 드러나는 역량 (신중히, 남발 금지)

역량명은 표준 명칭을 따른다 (예: "문제해결능력"). 매핑 불가한 모호한 명명 금지.

---

## 4. API / 백엔드 표준

- **얇은 컨트롤러**: router는 얇게, 로직은 service로. 오케스트레이션과 I/O 분리.
- **레이어 순서**: prompts → extractor → ai_analyzer → service → router (의존 방향 고정).
- **외부 호출**: 모든 fetch·AI 호출에 **timeout + retry(tenacity)**. httpx는 async.
- **스키마**: Pydantic v2로 요청/응답 검증. 응답 형태는 명세와 일치.
- **모든 테이블**: UUID PK, `created_at`/`updated_at` 자동 관리.
- **비밀 관리**: SUPABASE_URL/KEY, ANTHROPIC_API_KEY, JWT_SECRET은 **.env에서만** 로드. 하드코딩·커밋 금지.
- **에러**: 구체적 메시지. external 실패와 검증 실패를 구분해 반환.

### URL 추출(extractor) 표준
- GitHub: README + 최근 커밋 메시지. 일반 웹: og:description + article 본문(trafilatura).
- 본문 추출 실패/빈 콘텐츠는 명확한 에러로 처리 (조용히 빈 결과로 넘어가지 않음).

---

## 5. 인증 / 보안 표준

- **JWT는 httpOnly 쿠키**에 저장. localStorage 순수 JWT 금지.
- 비밀번호: passlib **bcrypt** 해싱. 평문 저장 금지. 최소 요구사항(길이 등) 강제.
- **Supabase RLS(Row Level Security)** 활성화 — 학생은 자기 데이터만 접근. (P1 스키마 단계부터 설계 권장)
- CORS: 프로덕션은 지정 도메인만 허용.
- RBAC: `user.role`(student/professor/admin) 기준 권한 분리. 교수/관리자 접근은 학생 동의·집계 원칙 준수.
- 관리자 통계는 **집계만**, 개별 학생 추론 접근 불가.

---

## 6. 프론트엔드 / 디자인 표준

- 랜딩(`career_data_account_landing.html`)의 **CSS 변수(OKLCH 토큰)를 globals.css로 이식**,
  Tailwind config에서 참조 (colors: paper/ink/gold, fontFamily: serif=Newsreader, sans=Pretendard).
- 디자인 토큰 **추가·변경 금지**. 새 색·폰트 도입 금지. Tailwind 기본 slate/gray 남용 금지.
- **시그니처 모션은 인용 마커 하나뿐** — 그 외 모션은 절제.
- 대시보드 링크 입력 모달 UX:
  - 우하단 FAB(56px, gold accent, 대시보드에서 항상 표시), 모바일은 bottom sheet.
  - URL 입력 **자동 포커스**, URL만 필수(정규식 검증 금지 — 붙여넣기 방해).
  - 진행 상태를 단계별로 노출("콘텐츠 가져오는 중 → AI 분해 중 → 역량 추출 중"). 무한 스켈레톤 금지.
  - 완료 시 새 카드가 대시보드 상단에 페이드인.

---

## 7. 검증 게이트 (Definition of Done)

각 Phase/기능은 아래를 통과해야 "완료":

- [ ] 증거 검증: 응답 evidence 텍스트가 원본에서 Ctrl+F로 발견됨
- [ ] 증거 없는 역량이 응답에 포함되지 않음
- [ ] 비밀키가 코드/커밋에 없음 (.env만)
- [ ] 안티패턴(`CLAUDE.md §5`) 위반 없음
- [ ] 해당 Phase의 플레이북 "✔ 검증" 항목 통과
- [ ] Phase 완료 커밋 생성

---

## 8. AI 모델 사용 표준

- 역량 추출 코어: **claude-sonnet-4-6**.
- 구조적 출력이 필요한 곳은 tool_use(구조화 출력)를 우선.
- Anthropic API 비용 모니터링을 배포 전 설정.
- 모델/프롬프트 변경은 회귀 테스트(≥5 URL) 후 반영.
