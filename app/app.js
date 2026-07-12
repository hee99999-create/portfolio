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
    if (this.items.length === 0 && !localStorage.getItem('cda_seeded_v2')) {
      localStorage.setItem('cda_seeded_v2', '1');
      this.items = SEED.slice();
    }
  },
  reset() { localStorage.removeItem('cda_exp'); localStorage.removeItem('cda_seeded_v2'); },
};

/* ============================================================
   경험 생성 (링크 / 파일+카테고리 / 성적)
   ============================================================ */
function makeExperience({ source, category, title, org, date, description, url, files }) {
  const comps = (CATEGORY_COMPETENCY[category] || ['자기관리']).map((name, i) => ({
    name,
    confidence: 3 + Math.floor(Math.random() * 3), // 3~5
    pct: 60 + Math.floor(Math.random() * 40),      // 60~99 기여도
    evidence: EVIDENCE_BY_COMP[name],
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
    date: date || '2025',
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
  const comps = (data.competencies || []).map(c => ({
    name: c.name,
    confidence: c.confidence || 3,
    pct: Math.min(100, (c.confidence || 3) * 18 + 10),
    evidence: c.evidence,
    src: c.source_ref || (meta.files && meta.files[0]) || meta.url || '증빙',
  }));
  const s = data.star || {};
  return {
    id: '2025-' + String(Math.floor(Math.random() * 9000) + 1000),
    source: meta.source, category: meta.category || 'project',
    title: data.title || meta.title || '경험',
    org: meta.org || '', date: meta.date || '2025',
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
/* 백엔드 없을 때 규칙 기반 진로 조언 */
function careerAdviceMock(agg, items) {
  const ranked = agg.labels.map((l, i) => ({ name: l, score: agg.mine[i] })).sort((a, b) => b.score - a.score);
  const top = ranked.filter(r => r.score > 0).slice(0, 2);
  const bottom = ranked[ranked.length - 1];
  const careers = top.map(t => ({ role: CAREER_MAP[t.name] || '방향 탐색', why: `${t.name} 역량이 상대적으로 높습니다 (${t.score}점).` }));
  if (!careers.length) careers.push({ role: '경험을 더 쌓아 방향 탐색', why: '아직 데이터가 적어 강점이 뚜렷하지 않습니다.' });
  return {
    strengths: top.length
      ? `${top.map(t => t.name).join(', ')} 이(가) 두드러집니다. 누적 경험 ${items.length}건에서 나온 결과예요.`
      : '아직 강점을 판단할 데이터가 부족합니다. 경험을 먼저 등록해 보세요.',
    careers,
    gaps: (bottom && bottom.score < 40)
      ? [`${bottom.name} 역량이 약합니다 (${bottom.score}점).`]
      : ['특별히 약한 역량은 없어요. 대표 경험의 깊이를 더하면 좋습니다.'],
    next_actions: [
      bottom ? `${bottom.name} 보완: ${GAP_ACTION[bottom.name] || '관련 활동 추가'}` : '대표 경험 1~2개를 깊게 정리하기',
      '교과역량(성적)도 등록해 통합 프로필을 완성하기',
    ],
    encouragement: '활동은 이미 잘 쌓고 있어요. 이제 방향만 잡으면 됩니다. 화이팅!',
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
/* 비교용 mock 평균 (학과/동일학년) */
const KCESA_AVG = {
  '학과평균':          [52, 48, 55, 40, 58, 50],
  '동일학년 전체평균': [50, 46, 52, 38, 54, 47],
  '동일학년 학과평균': [54, 50, 56, 42, 60, 52],
};

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
const SEED = [
  makeExperience({ source: 'link', category: 'project', title: '캡스톤 — 소상공인 예약 플랫폼', org: '컴퓨터공학과', date: '2025.03–06', url: 'https://github.com/example/capstone', description: '사용자 15명 인터뷰로 핵심 기능을 좁히고 팀을 이끌어 MVP를 완성했다.' }),
  makeExperience({ source: 'file', category: 'cert', title: 'TOEIC 960', org: 'ETS', date: '2025.05', files: ['toeic_960.pdf'], description: '영어 의사소통 능력을 공인 점수로 입증했다.' }),
  makeExperience({ source: 'file', category: 'volunteer', title: '지역아동센터 학습 멘토링', org: '○○구 자원봉사센터', date: '2024.09–12', files: ['봉사확인서.pdf'], description: '주 1회 아동 학습을 지도하며 눈높이 소통을 실천했다.' }),
];

document.addEventListener('keydown', e => { if (e.key === 'Escape') { const o = document.getElementById('modalOverlay'); if (o) o.classList.remove('open'); } });
