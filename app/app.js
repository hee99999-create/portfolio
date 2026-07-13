/* ============================================================
   PORTRI AI v2 — shared app logic (mock frontend)
   통합 "경험" 모델 · 경력관리 누적 · K-CESA 역량 · 문서 생성
   ============================================================ */

/* ---- K-CESA 6대 핵심역량 ---- */
const KCESA = ['자기관리', '대인관계', '자원·정보·기술활용', '글로벌', '의사소통', '종합적사고력'];

/* ---- 경력관리 카테고리 (스크린샷 기반) ---- */
const CATEGORIES = [
  { key: 'language',  label: '어학',            icon: '🌐' },
  { key: 'cert',      label: '자격증',          icon: '📜' },
  { key: 'volunteer', label: '봉사활동',        icon: '🤝' },
  { key: 'award',     label: '수상실적',        icon: '🏅' },
  { key: 'education', label: '교육·연수',       icon: '📚' },
  { key: 'club',      label: '동아리·학생활동', icon: '🎭' },
  { key: 'research',  label: '연구·논문',       icon: '🔬' },
  { key: 'project',   label: '프로젝트',        icon: '💡' },
  { key: 'etc',       label: '기타',            icon: '📌' },
];
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

/* 카테고리 → 기여 K-CESA 역량 (mock 매핑) */
const CATEGORY_COMPETENCY = {
  language:  ['글로벌', '의사소통'],
  cert:      ['자원·정보·기술활용', '자기관리'],
  volunteer: ['대인관계', '자기관리'],
  award:     ['종합적사고력', '자기관리'],
  education: ['자기관리', '자원·정보·기술활용'],
  club:      ['대인관계', '의사소통'],
  research:  ['종합적사고력', '자원·정보·기술활용'],
  project:   ['종합적사고력', '대인관계'],
  etc:       ['자기관리'],
};

/* 증거 문장 템플릿 (mock — 실제로는 링크/파일 분석 결과) */
const EVIDENCE_BY_COMP = {
  '자기관리':            '계획을 세워 기한 내 목표를 완수하고 스스로 점검했다',
  '대인관계':            '구성원과 협업하며 의견 충돌을 조율해 합의를 이끌었다',
  '자원·정보·기술활용':  '필요한 도구·자료를 찾아 조합해 문제를 해결했다',
  '글로벌':              '외국어·다문화 맥락에서 소통하고 성과를 냈다',
  '의사소통':            '핵심을 정리해 전달하고 피드백을 반영했다',
  '종합적사고력':        '여러 제약을 함께 고려해 근거로 판단하고 결론을 냈다',
};
/* 역량 연결 이유 템플릿 (mock — 왜 이 evidence가 이 역량인지) */
const COMPETENCY_REASON_BY_COMP = {
  '자기관리':            '스스로 목표를 세우고 기한 내 완수·점검한 자기관리 행동이 확인됩니다.',
  '대인관계':            '구성원과 협업하며 의견 충돌을 조율한 대인관계 행동이 확인됩니다.',
  '자원·정보·기술활용':  '필요한 도구·자료를 찾아 조합해 문제를 해결한 활용 행동이 확인됩니다.',
  '글로벌':              '외국어·다문화 맥락에서 소통하고 성과를 낸 글로벌 행동이 확인됩니다.',
  '의사소통':            '핵심 내용을 정리해 전달하고 피드백을 반영한 의사소통 행동이 확인됩니다.',
  '종합적사고력':        '여러 제약을 함께 고려해 근거로 판단·결론지은 종합적 사고가 확인됩니다.',
};

/* ============================================================
   증거 원문 검증 — 인용이 원문에 실제 존재하는지 (과도한 fuzzy 금지)
   공백·개행만 정규화하고, 정규화된 원문에 정규화된 인용이 substring으로
   존재할 때만 true. 서로 다른 문장을 이어붙이거나 변형하면 false.
   ============================================================ */
function _normForVerify(s) {
  return String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim();
}
function verifyEvidenceAgainstSource(evidence, originalText) {
  const ev = _normForVerify(evidence);
  const src = _normForVerify(originalText);
  if (!ev || !src) return false;
  return src.includes(ev);
}

/* ============================================================
   ★ 증거 강도(Evidence Strength) 4단계
   AI/규칙이 판정하며, 반드시 원문 evidence에 근거해야 한다.
   ============================================================ */
const STRENGTH_LEVELS = {
  1: { label: '단순 참여',       score: 25, desc: '경험에 참여했거나 언급된 수준' },
  2: { label: '구체적 행동',     score: 50, desc: '구체적인 행동이 확인됨' },
  3: { label: '주도·문제해결',   score: 75, desc: '주도적 행동·문제해결·협업·의사결정이 확인됨' },
  4: { label: '성과 입증',       score: 100, desc: '구체적 행동과 측정 가능한 결과·성과가 함께 확인됨' },
};
const STRENGTH_LEVEL_SCORE = { 1: 25, 2: 50, 3: 75, 4: 100 };
/* mock: 카테고리별 기본 강도 가설 (실제 서비스는 AI가 원문 근거로 판정) */
const MOCK_STRENGTH_BY_CATEGORY = {
  award: 4, research: 4, project: 3, club: 3, volunteer: 2,
  education: 2, cert: 2, language: 2, etc: 1,
};

/* ============================================================
   세션 & 저장소 (localStorage mock)
   ============================================================ */
const Session = {
  get loggedIn() { return localStorage.getItem('cda_user') !== null; },
  get user() { try { return JSON.parse(localStorage.getItem('cda_user')); } catch { return null; } },
  login(email) { localStorage.setItem('cda_user', JSON.stringify({ email, name: email.split('@')[0] })); },
  logout() { localStorage.removeItem('cda_user'); },
};

const Store = {
  get items() { try { return JSON.parse(localStorage.getItem('cda_exp')) || []; } catch { return []; } },
  set items(v) { localStorage.setItem('cda_exp', JSON.stringify(v)); },
  add(x) { const a = this.items; a.unshift(x); this.items = a; },
  find(id) { return this.items.find(x => x.id === id); },
  byCategory(key) { return this.items.filter(x => x.category === key); },
  seedIfEmpty() {
    if (this.items.length === 0 && !localStorage.getItem('cda_seeded_v3')) {
      localStorage.setItem('cda_seeded_v3', '1');
      this.items = SEED.slice();
    }
  },
  reset() { localStorage.removeItem('cda_exp'); localStorage.removeItem('cda_seeded_v3'); localStorage.removeItem('cda_seeded_v2'); },
};

/* ============================================================
   경험 생성 (링크 / 파일+카테고리 / 성적)
   ============================================================ */
function nowISO() { try { return new Date().toISOString(); } catch { return ''; } }
function makeExperience({ source, category, title, org, date, description, url, files }) {
  const lvl = MOCK_STRENGTH_BY_CATEGORY[category] || 2;
  const comps = (CATEGORY_COMPETENCY[category] || ['자기관리']).map((name, i) => ({
    name,
    confidence: 3 + Math.floor(Math.random() * 3), // 3~5 (레거시 호환)
    pct: 60 + Math.floor(Math.random() * 40),      // 60~99 (레거시 호환)
    evidence: EVIDENCE_BY_COMP[name],
    competencyReason: COMPETENCY_REASON_BY_COMP[name] || `${name} 역량과 연결되는 행동이 확인됩니다.`,
    strengthLevel: lvl,                             // 1~4 (증거 강도)
    evidenceStrength: lvl,                          // 레거시 별칭 (구버전 화면 호환)
    strengthReason: `${CAT[category]?.label || '경험'}의 "${(description || EVIDENCE_BY_COMP[name]).slice(0, 40)}"에서 ${STRENGTH_LEVELS[lvl].desc}`,
    verified: true,                                 // 계산에 반영되는 검증된 증거
    src: source === 'link' ? (url || '원본 링크')
       : source === 'grade' ? '성적증명서'
       : (files && files[0] ? files[0] : '증빙자료'),
  }));
  const label = CAT[category]?.label || '경험';
  return {
    id: '2025-' + String(Math.floor(Math.random() * 9000) + 1000),
    source, category,
    title: title || (autoTitle(source, url, label)),
    org: org || '',
    date: date || '2025',            // 레거시 별칭 (= 활동 시점)
    experienceDate: date || '2025',  // 실제 경험이 발생한 시점
    createdAt: nowISO(),             // PORTRI AI에 등록한 시점
    originalText: description || '', // 분석 근거가 된 원문(자유서술)
    description: description || '',
    url: url || '', files: files || [],
    star: {
      s: '해결하거나 달성할 상황이 있었다.',
      t: '기한 안에 구체적 목표를 세웠다.',
      a: description || '핵심 활동을 수행하고 증빙으로 남겼다.',
      r: '측정 가능한 결과와 배운 점을 정리했다.',
    },
    competencies: comps,
    engine: 'mock',
  };
}
function autoTitle(source, url, label) {
  if (source === 'link') { try { const h = new URL(url).hostname.replace('www.',''); return h + ' ' + label; } catch { return label; } }
  return label + ' 활동';
}

/* ============================================================
   실제 백엔드 연동 (OpenAI). 꺼져 있으면 null → mock 폴백.
   백엔드 주소 변경: localStorage.setItem('cda_api','https://...')
   ============================================================ */
const API_BASE = (typeof localStorage !== 'undefined' && localStorage.getItem('cda_api')) || 'http://localhost:8000';
/* 백엔드(AI) 살아있는지 확인 → {status, model, provider} 또는 null */
async function checkBackend() {
  try {
    const r = await fetch(API_BASE + '/health', { method: 'GET' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
async function analyzeBackend(payload) {
  try {
    const r = await fetch(API_BASE + '/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
/* 백엔드 응답 → 통합 경험 모델 변환 */
function experienceFromBackend(data, meta) {
  const sourceText = data.source_text || meta.originalText || meta.description || '';
  const comps = (data.competencies || []).map(c => {
    const lvl = Math.min(4, Math.max(1, c.strengthLevel || c.strength_level || c.evidenceStrength || c.evidence_strength || 2));
    // 검증 책임은 백엔드(evidence_verification.verify_evidence_against_source, 전체
    // 문자열 대조)가 진다. 프론트는 백엔드가 보낸 verified 값을 신뢰한다.
    // 필드가 아예 없는 예외적인 경우(레거시 백엔드 응답 등)에만 프론트에서 원문과
    // 재대조하고, 그마저 불가능하면(원문 없음) 검증되지 않은 것으로 처리한다
    // — "c.verified === true || 항상통과" 처럼 추측으로 통과시키지 않는다.
    const verified = typeof c.verified === 'boolean'
      ? c.verified
      : (sourceText ? verifyEvidenceAgainstSource(c.evidence, sourceText) : false);
    return {
      name: c.name,
      confidence: c.confidence || 3,
      pct: Math.min(100, (c.confidence || 3) * 18 + 10),
      evidence: c.evidence,
      competencyReason: c.competency_reason || c.competencyReason || `${c.name} 역량과 연결되는 행동이 확인됩니다.`,
      strengthLevel: lvl,
      evidenceStrength: lvl,                          // 레거시 별칭
      strengthReason: c.strength_reason || c.strengthReason || STRENGTH_LEVELS[lvl].desc,
      verified,                                       // 백엔드 검증 신뢰 (+ 필드 부재시 프론트 재대조)
      sourceStart: (typeof c.sourceStart === 'number') ? c.sourceStart : null,
      sourceEnd: (typeof c.sourceEnd === 'number') ? c.sourceEnd : null,
      src: c.source_ref || (meta.files && meta.files[0]) || meta.url || '증빙',
    };
  });
  const s = data.star || {};
  return {
    id: '2025-' + String(Math.floor(Math.random() * 9000) + 1000),
    source: meta.source, category: meta.category || 'project',
    title: data.title || meta.title || '경험',
    org: meta.org || '', date: meta.date || '2025',
    experienceDate: meta.date || '2025', createdAt: nowISO(),
    originalText: sourceText,
    description: meta.description || meta.org || '', url: meta.url || '', files: meta.files || [],
    star: { s: s.situation || '', t: s.task || '', a: s.action || '', r: s.result || '' },
    competencies: comps,
    engine: 'ai',
  };
}

/* ============================================================
   AI 선배 — 전체 활동·역량 기반 진로/취업 조언
   ============================================================ */
async function adviseBackend(profile) {
  try {
    const r = await fetch(API_BASE + '/advise', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
const CAREER_MAP = {
  '종합적사고력': '전략기획 · 경영컨설팅',
  '자원·정보·기술활용': '소프트웨어 · IT/데이터 직무',
  '의사소통': '마케팅 · 브랜드 · 교육',
  '대인관계': '영업 · 사업개발 · HR',
  '글로벌': '해외영업 · 무역 · 글로벌기업',
  '자기관리': '프로젝트 매니저(PM) · 운영기획',
};
const GAP_ACTION = {
  '글로벌': '어학 점수 · 교환학생 · 해외봉사',
  '의사소통': '발표 · 공모전 · 동아리 리더 경험',
  '대인관계': '팀 프로젝트 · 봉사 · 학생회',
  '자원·정보·기술활용': '자격증 · 개발 프로젝트 · 데이터 실습',
  '종합적사고력': '연구 · 논문 · 복합 문제 해결 프로젝트',
  '자기관리': '장기 프로젝트 완주 · 목표관리 기록',
};
/* 백엔드 없을 때 규칙 기반 진로 조언 (증거지수 기반, '부족' 단정 금지) */
function careerAdviceMock(all, items) {
  const ranked = [...all].sort((a, b) => b.index - a.index);
  const top = ranked.filter(c => c.index > 0).slice(0, 2);
  const low = [...all].sort((a, b) => a.index - b.index).slice(0, 2);
  const careers = top.map(c => ({ role: CAREER_MAP[c.name] || '방향 탐색', why: `${c.name} 역량의 검증 증거가 ${c.evidenceCount}개로 상대적으로 두껍습니다 (${c.level.label}).` }));
  if (!careers.length) careers.push({ role: '경험을 더 쌓아 방향 탐색', why: '아직 검증된 증거가 적어 강점이 뚜렷하지 않습니다.' });
  return {
    strengths: top.length
      ? `${top.map(c => c.name).join(', ')} 역량에서 검증 가능한 증거가 두드러집니다. 누적 경험 ${items.length}건에서 나온 결과예요.`
      : '아직 강점을 판단할 증거가 부족합니다. 경험을 먼저 등록해 보세요.',
    careers,
    gaps: low.map(c => c.evidenceCount > 0
      ? `${c.name} — 현재 검증 증거 ${c.evidenceCount}개. 이 역량을 보여줄 경험을 더 기록하면 증거가 두꺼워져요.`
      : `${c.name} — 아직 이 역량을 뒷받침하는 검증 증거가 발견되지 않았어요. (능력이 부족하다는 뜻이 아니라 기록이 없을 뿐)`),
    next_actions: low.map(c => `${c.name} 증거 만들기: ${GAP_ACTION[c.name] || '관련 활동 추가'}`)
      .concat(['교과 성적도 등록해 통합 프로필을 완성하기']),
    encouragement: '활동은 이미 잘 쌓고 있어요. 이제 증거의 폭과 깊이만 더하면 됩니다. 화이팅!',
  };
}

/* ============================================================
   교과역량 (성적) 저장소 + 분석
   ============================================================ */
const Curricular = {
  get data() { try { return JSON.parse(localStorage.getItem('cda_curricular')); } catch { return null; } },
  set data(v) { localStorage.setItem('cda_curricular', JSON.stringify(v)); },
  clear() { localStorage.removeItem('cda_curricular'); },
};

const GRADE_POINT = { 'A+':4.5,'A0':4.0,'A':4.0,'B+':3.5,'B0':3.0,'B':3.0,'C+':2.5,'C0':2.0,'C':2.0,'D+':1.5,'D0':1.0,'D':1.0,'F':0 };
/* 이수구분 → 기여 K-CESA */
const DIV_COMPETENCY = {
  '전공필수': ['종합적사고력', '자원·정보·기술활용'],
  '전공선택': ['종합적사고력', '자원·정보·기술활용'],
  '교양':     ['의사소통', '글로벌'],
  '일반선택': ['자기관리', '대인관계'],
};
/* 과목 배열 → K-CESA raw 점수 */
function analyzeTranscript(courses) {
  const scores = Object.fromEntries(KCESA.map(k => [k, 0]));
  courses.forEach(c => {
    const gp = GRADE_POINT[c.grade] ?? 3.0;
    const cr = Number(c.credit) || 3;
    const comps = DIV_COMPETENCY[c.division] || ['자기관리'];
    comps.forEach(k => { scores[k] += gp * cr * 1.4; });
  });
  return scores;
}
const SAMPLE_COURSES = [
  { name: '자료구조', division: '전공필수', credit: 3, grade: 'A+' },
  { name: '데이터베이스', division: '전공선택', credit: 3, grade: 'A0' },
  { name: '글로벌 커뮤니케이션', division: '교양', credit: 2, grade: 'A+' },
  { name: '비판적 사고와 글쓰기', division: '교양', credit: 2, grade: 'B+' },
  { name: '창업과 팀워크', division: '일반선택', credit: 2, grade: 'A0' },
];

/* ============================================================
   역량 집계 (K-CESA — 교과 + 비교과 통합)
   ============================================================ */
function aggregateKCESA() {
  const rawEx = Object.fromEntries(KCESA.map(k => [k, 0]));
  const cnt = Object.fromEntries(KCESA.map(k => [k, 0]));
  Store.items.forEach(x => x.competencies.forEach(c => {
    if (rawEx[c.name] === undefined) return;
    rawEx[c.name] += (c.confidence || 3) * 6;
    cnt[c.name] += 1;
  }));
  const cur = Curricular.data;
  const rawCur = cur ? cur.scores : Object.fromEntries(KCESA.map(k => [k, 0]));
  const clamp = k => Math.min(100, Math.round(k));
  return {
    labels: KCESA,
    extracurricular: KCESA.map(k => clamp(rawEx[k])),
    curricular: KCESA.map(k => clamp(rawCur[k] || 0)),
    mine: KCESA.map(k => clamp((rawEx[k] || 0) + (rawCur[k] || 0))),
    counts: KCESA.map(k => cnt[k]),
    hasCurricular: !!cur,
  };
}
/* ============================================================
   ★★ 역량 증거지수 (Evidence Index) 엔진
   철학: AI가 학생의 역량을 평가하지 않는다. 등록된 경험에서
   검증 가능한 '증거'가 어떻게 축적·성장하는지 보여준다.
   ※ K-CESA 공식 진단점수가 아님. 다른 학생과 비교하지 않음.
   ============================================================ */

/* 가중치 — 교육학 공식이 아니라 MVP 제품 가설. 언제든 조정 가능하도록 분리. */
const EVIDENCE_INDEX_WEIGHTS = {
  quantity: 0.25,   // 증거량
  strength: 0.30,   // 증거 강도
  diversity: 0.20,  // 경험 다양성
  continuity: 0.15, // 지속성
  recency: 0.10,    // 최근성
};

/* 증거량: 단계형 (무한 선형 증가 방지) */
const EVIDENCE_QUANTITY_STEPS = [
  { min: 10, score: 100 }, { min: 8, score: 90 }, { min: 6, score: 80 },
  { min: 5, score: 70 }, { min: 4, score: 60 }, { min: 3, score: 50 },
  { min: 2, score: 35 }, { min: 1, score: 20 }, { min: 0, score: 0 },
];
/* 경험 다양성: 서로 다른 카테고리 수 */
const DIVERSITY_STEPS = [
  { min: 5, score: 100 }, { min: 4, score: 80 }, { min: 3, score: 60 },
  { min: 2, score: 40 }, { min: 1, score: 20 }, { min: 0, score: 0 },
];
/* 지속성: 서로 다른 학기(반기) 수 */
const CONTINUITY_STEPS = [
  { min: 4, score: 100 }, { min: 3, score: 75 }, { min: 2, score: 50 },
  { min: 1, score: 25 }, { min: 0, score: 0 },
];
/* 최근성: 가장 최근 증거까지 경과 개월 */
const RECENCY_BANDS = [
  { maxMonths: 6, score: 100 }, { maxMonths: 12, score: 80 },
  { maxMonths: 24, score: 60 }, { maxMonths: 36, score: 40 },
  { maxMonths: Infinity, score: 20 },
];
/* 역량 수준 구간 — '점수'가 아닌 '수준'으로 표현. '부족' 표현 금지. */
const EVIDENCE_LEVELS = [
  { min: 80, key: 'veryStrong', label: '매우 강함' },
  { min: 60, key: 'strong',     label: '강함' },
  { min: 40, key: 'growing',    label: '성장 중' },
  { min: 1,  key: 'needMore',   label: '증거 쌓는 중' },
  { min: 0,  key: 'none',       label: '아직 발견되지 않음' },
];
/* 최소 증거 기준: 증거가 이 개수 미만이면 지수 수준을 강조하지 않고 '초기 증거'로 표시 */
const MIN_EVIDENCE_FOR_LEVEL = 3;
/* 경험당 동일 역량 핵심 증거 최대 반영 수 (중복 부풀림 방지) */
const MAX_EVIDENCE_PER_EXPERIENCE = 2;
const EVIDENCE_INDEX_DISCLAIMER =
  '※ 역량 증거지수는 K-CESA 공식 진단점수가 아니며, 등록된 경험에서 확인된 증거의 축적과 성장 정도를 보여주는 PORTRI AI의 성장지표입니다.';
const GROWTH_BASIS_NOTE = '성장 변화는 등록한 경험의 활동 시점을 기준으로 분석합니다.';

function levelOf(index) {
  return EVIDENCE_LEVELS.find(l => index >= l.min) || EVIDENCE_LEVELS[EVIDENCE_LEVELS.length - 1];
}
/* 표시용 수준: 최소 증거 기준 반영 (0=미발견, 1~2=초기 증거, 3+=지수 기반) */
function displayLevelFor(evidenceCount, index) {
  if (!evidenceCount) return { key: 'none', label: '아직 발견되지 않음', early: false, provisional: true };
  if (evidenceCount < MIN_EVIDENCE_FOR_LEVEL) return { key: 'early', label: '초기 증거', early: true, provisional: true };
  return Object.assign({ early: false, provisional: false }, levelOf(index));
}
function _stepScore(steps, n) {
  return (steps.find(s => n >= s.min) || steps[steps.length - 1]).score;
}

/* ---- 날짜 파싱 (방어적): '2025.03–06','2025.05','2025','2024.09-12' 등 ---- */
function parseExperienceDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/[.\/]/g, '-').replace(/[–—~]/g, '-');
  const m = s.match(/(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!m) return null;
  let y = +m[1], mo = m[2] ? +m[2] : 6, d = m[3] ? +m[3] : 15;
  if (y < 1990 || y > 2100) return null;
  if (mo < 1 || mo > 12) mo = 6;
  if (d < 1 || d > 28) d = 15;
  const dt = new Date(y, mo - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}
/* 반기 단위 학기 키: 2025-H1 / 2025-H2 */
function termOf(date) {
  if (!(date instanceof Date)) return null;
  return `${date.getFullYear()}-H${date.getMonth() < 6 ? 1 : 2}`;
}
function _monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/* ---- 데이터 접근 헬퍼 (기존 데이터 안전 fallback) ---- */
/* 활동 시점: experienceDate 우선, 없으면 레거시 date */
function experienceDateOf(x) { return parseExperienceDate(x.experienceDate || x.date); }
function experienceDateStr(x) { return x.experienceDate || x.date || ''; }
/* 증거 강도: strengthLevel 우선, 레거시 evidenceStrength fallback */
function strengthLevelOf(c) { return Math.min(4, Math.max(1, c.strengthLevel || c.evidenceStrength || 2)); }
/* 검증 여부: 명시적으로 false일 때만 제외 (레거시 데이터는 포함) */
function isVerified(c) { return c.verified !== false; }

/* ---- 값 분리 (각각 독립 함수) ---- */
function calcEvidenceCount(evidences) { return evidences.length; }
function calcExperienceCount(evidences) { return new Set(evidences.map(e => e.expId)).size; }
function calcCategoryCount(evidences) { return new Set(evidences.map(e => e.category)).size; }
function calcPeriodCount(evidences) { return new Set(evidences.filter(e => e.when).map(e => termOf(e.when))).size; }
/* 증거량 반영 개수: 경험당 최대 MAX_EVIDENCE_PER_EXPERIENCE 개까지만 (중복 부풀림 방지) */
function cappedQuantityCount(evidences) {
  const perExp = new Map();
  evidences.forEach(e => perExp.set(e.expId, (perExp.get(e.expId) || 0) + 1));
  let total = 0;
  perExp.forEach(n => { total += Math.min(MAX_EVIDENCE_PER_EXPERIENCE, n); });
  return total;
}

/* ---- 하위 5개 지표 (각각 독립 함수) ---- */
function calculateEvidenceQuantity(count) { return _stepScore(EVIDENCE_QUANTITY_STEPS, count); }
function calculateEvidenceStrength(levels) {
  if (!levels.length) return 0;
  const sum = levels.reduce((a, lv) => a + (STRENGTH_LEVEL_SCORE[lv] || 0), 0);
  return Math.round(sum / levels.length);
}
function calculateExperienceDiversity(categorySet) { return _stepScore(DIVERSITY_STEPS, categorySet.size); }
function calculateContinuity(termSet) { return _stepScore(CONTINUITY_STEPS, termSet.size); }
function calculateRecency(mostRecent, now) {
  if (!mostRecent) return 0;
  const months = Math.max(0, _monthsBetween(mostRecent, now || new Date()));
  return (RECENCY_BANDS.find(b => months <= b.maxMonths) || RECENCY_BANDS[RECENCY_BANDS.length - 1]).score;
}
function calculateEvidenceIndex(parts) {
  const w = EVIDENCE_INDEX_WEIGHTS;
  return Math.round(
    parts.quantity * w.quantity + parts.strength * w.strength +
    parts.diversity * w.diversity + parts.continuity * w.continuity +
    parts.recency * w.recency
  );
}

/* ---- 한 역량의 증거 현황 계산 ----
   asOf: 지정 시 '그 시점(발생일 기준)까지 존재했던 경험'만 사용 (과거의 나 비교용) */
function evidenceIndexFor(compName, items, asOf, now) {
  const evidences = [];
  let mostRecent = null;

  (items || Store.items).forEach(x => {
    const when = experienceDateOf(x);
    if (asOf && (!when || when > asOf)) return;   // 과거 스냅샷: 그 시점 이후 경험 제외
    (x.competencies || []).forEach(c => {
      if (c.name !== compName) return;
      if (!isVerified(c)) return;                 // verified 증거만 계산
      const lvl = strengthLevelOf(c);
      evidences.push({
        expId: x.id, title: x.title, category: x.category,
        categoryLabel: CAT[x.category]?.label || '경험',
        evidence: c.evidence, src: c.src, level: lvl,
        competencyReason: c.competencyReason || `${compName} 역량과 연결되는 행동이 확인됩니다.`,
        strengthReason: c.strengthReason || STRENGTH_LEVELS[lvl].desc,
        verified: isVerified(c),
        date: experienceDateStr(x), when,
      });
      if (when && (!mostRecent || when > mostRecent)) mostRecent = when;
    });
  });

  // 값 분리 (독립 함수)
  const evidenceCount = calcEvidenceCount(evidences);
  const experienceCount = calcExperienceCount(evidences);
  const categoryCount = calcCategoryCount(evidences);
  const periodCount = calcPeriodCount(evidences);

  const parts = {
    quantity: calculateEvidenceQuantity(cappedQuantityCount(evidences)), // 경험당 최대 2개 캡
    strength: calculateEvidenceStrength(evidences.map(e => e.level)),
    diversity: calculateExperienceDiversity(new Set(evidences.map(e => e.category))),
    continuity: calculateContinuity(new Set(evidences.filter(e => e.when).map(e => termOf(e.when)))),
    recency: calculateRecency(mostRecent, now),
  };
  const index = calculateEvidenceIndex(parts);
  return {
    name: compName, index,
    level: levelOf(index),                                  // 지수 기반 원시 수준
    displayLevel: displayLevelFor(evidenceCount, index),    // 최소 증거 기준 반영 표시 수준
    parts,
    evidenceCount, experienceCount, categoryCount, periodCount,
    mostRecent, evidences,
  };
}

/* ---- 6대 역량 전체 ---- */
function evidenceIndexAll(items, asOf, now) {
  return KCESA.map(k => evidenceIndexFor(k, items, asOf, now));
}
/* 과거 스냅샷에 쓸 만한 경험이 있는지 (가짜 데이터 생성 금지 판단용) */
function pastExperienceCount(items, asOf) {
  return (items || Store.items).filter(x => {
    const w = experienceDateOf(x);
    return w && w <= asOf;
  }).length;
}
function monthsAgo(n, from) {
  const d = from ? new Date(from) : new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

/* ============================================================
   네비게이션 주입
   ============================================================ */
const NAV_LINKS = [
  { href: 'home.html', label: '홈', key: 'home' },
  { href: 'how-it-works.html', label: '작동 방식', key: 'how' },
  { href: 'dashboard.html', label: '경력관리', key: 'dashboard' },
  { href: 'curricular.html', label: '교과관리', key: 'curricular' },
  { href: 'competency.html', label: '역량', key: 'competency' },
  { href: 'studio.html', label: '문서', key: 'studio' },
];
function mountNav(active) {
  const el = document.querySelector('[data-nav]'); if (!el) return;
  const links = NAV_LINKS.map(l => `<a class="nav__link ${l.key === active ? 'active' : ''}" href="${l.href}">${l.label}</a>`).join('');
  const right = Session.loggedIn
    ? `<span class="nav__link">${Session.user.name}</span><a class="nav__link" href="#" onclick="Session.logout();location.href='home.html';return false">로그아웃</a>`
    : `<a class="btn btn--primary" style="padding:5px 16px;font-size:13px" href="login.html">시작하기</a>`;
  el.innerHTML = `<a class="nav__brand" href="home.html"><span class="mark">P</span>PORTRI&nbsp;<span class="ai">AI</span></a>
    <button class="nav__toggle" aria-label="메뉴 열기" onclick="this.closest('.nav').classList.toggle('open')">☰</button>
    <div class="nav__menu">
      <div class="nav__links">${links}</div>
      <div class="nav__right">${right}</div>
    </div>`;
}
function mountFooter() {
  const el = document.querySelector('[data-footer]'); if (!el) return;
  el.innerHTML = `<div class="container footer__cols">
    <div class="footer__col"><h4>제품</h4><a href="home.html">홈</a><a href="how-it-works.html">작동 방식</a><a href="features.html">기능</a><a href="preview.html">미리보기</a></div>
    <div class="footer__col"><h4>나의 기록</h4><a href="dashboard.html">경력관리(비교과)</a><a href="curricular.html">교과역량(성적)</a><a href="competency.html">역량 그래프</a><a href="studio.html">문서 만들기</a></div>
    <div class="footer__col"><h4>도구</h4><a href="coaching.html">AI 선배</a><a href="professor.html">교수</a><a href="admin.html">관리자</a></div>
    </div>
    <div class="container footer__legal"><p class="fine">활동 목록이 아니라, 증거 있는 역량 자산. · K-CESA 매핑 · 증거로 검증된 것만 자산이 됩니다.</p></div>`;
}
function requireAuth() {
  if (!Session.loggedIn) { location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop()); return false; }
  return true;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ============================================================
   시드 데이터
   ============================================================ */
/* 시드 = 현재 학생의 기능 테스트용. (다른 학생 평균/가짜 과거 데이터 아님.)
   날짜를 과거~최근으로 분산해 증거 축적·성장·지속성·최근성이 실제로 계산되게 함. */
const SEED = [
  // --- 과거(6개월 전 스냅샷에 포함) ---
  makeExperience({ source: 'link', category: 'project', title: '캡스톤 — 소상공인 예약 플랫폼', org: '컴퓨터공학과', date: '2025.03–06', url: 'https://github.com/example/capstone', description: '사용자 15명 인터뷰로 핵심 기능을 좁히고 팀을 이끌어 MVP를 완성했다.' }),
  makeExperience({ source: 'file', category: 'cert', title: 'TOEIC 960', org: 'ETS', date: '2025.05', files: ['toeic_960.pdf'], description: '영어 의사소통 능력을 공인 점수로 입증했다.' }),
  makeExperience({ source: 'file', category: 'volunteer', title: '지역아동센터 학습 멘토링', org: '○○구 자원봉사센터', date: '2024.09–12', files: ['봉사확인서.pdf'], description: '주 1회 아동 학습을 지도하며 눈높이 소통을 실천했다.' }),
  // --- 최근(6개월 내 — 성장으로 나타남) ---
  makeExperience({ source: 'file', category: 'award', title: '교내 데이터 분석 공모전 우수상', org: '산학협력단', date: '2026.05', files: ['수상확인서.pdf'], description: '공공데이터로 상권 이탈을 예측하는 모델을 설계해 우수상을 받았다.' }),
  makeExperience({ source: 'link', category: 'club', title: '학술동아리 — 프로덕트 스터디 기획부장', org: '경영학과', date: '2026.03', url: 'https://blog.example.com/club', description: '매주 세미나를 기획·진행하고 신입 부원 온보딩을 이끌었다.' }),
  makeExperience({ source: 'file', category: 'language', title: 'OPIc IH', org: 'ACTFL', date: '2026.06', files: ['opic_ih.pdf'], description: '영어 인터뷰 평가에서 IH 등급을 받아 실무 회화 역량을 입증했다.' }),
];

document.addEventListener('keydown', e => { if (e.key === 'Escape') { const o = document.getElementById('modalOverlay'); if (o) o.classList.remove('open'); } });
