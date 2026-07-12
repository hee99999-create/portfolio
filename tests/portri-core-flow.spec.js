// @ts-check
/**
 * PORTRI AI — 핵심 데이터 파이프라인 E2E 통합 테스트
 *
 * 경험 → Evidence → 역량 → 설명(competencyReason) → 강도(strengthLevel/Reason)
 * → 누적(Evidence Index) → 성장(현재 vs 과거) → 문서(verified evidence)
 *
 * 실행 전제:
 *   1) 프론트 서버가 켜져 있어야 함:  cd app && python serve.py 8125
 *   2) Playwright 브라우저:            npx playwright install chromium
 *   실행:                             npx playwright test tests/portri-core-flow.spec.js
 *
 * 구조:
 *   - deterministic integration test : 외부 AI 없이 항상 실행 (엔진/데이터/UI)
 *   - live AI test                    : 백엔드(:8000)가 살아있을 때만 실행, 없으면 SKIP(BLOCKED)
 *
 * 주의: 기존 사용자 데이터를 건드리지 않도록 각 테스트는 E2E_TEST_ prefix 데이터만
 *       주입/삭제하며, 페이지 localStorage 스냅샷을 복원한다.
 */
const { test, expect } = require('@playwright/test');

const BASE = process.env.PORTRI_BASE || 'http://localhost:8125';
const NARRATIVE =
  '캡스톤 디자인 프로젝트에서 사용자 요구사항을 파악하기 위해 15명의 사용자를 인터뷰했습니다. ' +
  '인터뷰 결과를 분석하여 5개의 핵심 요구사항으로 정리하고 팀원 4명에게 공유했습니다. ' +
  '이후 팀원들과 우선순위를 논의하여 핵심 기능 3개를 선정했습니다. ' +
  '저는 회의 진행과 의견 조정을 담당했고, 최종적으로 프로젝트 결과물을 계획된 기한 내에 완성했습니다.';

// 페이지 진입 + 로그인 + 시드 + 스냅샷
// requireAuth() 리다이렉트를 막기 위해 세션을 페이지 스크립트보다 먼저 주입한다.
async function boot(page, url = '/dashboard.html') {
  await page.addInitScript(() => {
    if (!localStorage.getItem('cda_user')) {
      localStorage.setItem('cda_user', JSON.stringify({ email: 'e2e@university.ac.kr', name: 'e2e' }));
    }
  });
  await page.goto(BASE + url);
  await page.evaluate(() => {
    window.__snap = localStorage.getItem('cda_exp');
    Store.seedIfEmpty();
  });
}
// 스냅샷 복원 (기존 데이터 보호)
async function restore(page) {
  await page.evaluate(() => {
    if (window.__snap != null) localStorage.setItem('cda_exp', window.__snap);
  });
}
// E2E_TEST 경험 주입 (원문에서 그대로 추출한 evidence)
async function injectE2E(page) {
  return page.evaluate((src) => {
    const raw = [
      { name: '의사소통', evidence: '인터뷰 결과를 분석하여 5개의 핵심 요구사항으로 정리하고 팀원 4명에게 공유했습니다.', strengthLevel: 3, competencyReason: '핵심 내용을 구조화해 팀원에게 전달한 의사소통 행동이 확인됩니다.', strengthReason: '구체적 정리·공유 행동이 원문에서 확인됩니다.' },
      { name: '대인관계', evidence: '저는 회의 진행과 의견 조정을 담당했고', strengthLevel: 3, competencyReason: '회의 진행·의견 조정 등 협업 행동이 확인됩니다.', strengthReason: '주도적 의견 조정이 원문에서 확인됩니다.' },
      { name: '종합적사고력', evidence: '이후 팀원들과 우선순위를 논의하여 핵심 기능 3개를 선정했습니다.', strengthLevel: 3, competencyReason: '우선순위를 논의해 핵심을 선별한 판단이 확인됩니다.', strengthReason: '복수 제약 고려 판단이 원문에서 확인됩니다.' },
      { name: '자기관리', evidence: '최종적으로 프로젝트 결과물을 계획된 기한 내에 완성했습니다.', strengthLevel: 4, competencyReason: '기한 내 완성한 목표관리·실행 성과가 확인됩니다.', strengthReason: '측정 가능한 결과(기한 내 완성)가 원문에서 확인됩니다.' },
    ];
    const comps = raw.map(c => ({ ...c, evidenceStrength: c.strengthLevel, verified: verifyEvidenceAgainstSource(c.evidence, src), src: 'E2E_capstone_report.pdf' }));
    const exp = {
      id: 'E2E_TEST_1', source: 'file', category: 'project',
      title: '[E2E] 캡스톤 디자인 사용자 분석 프로젝트', org: '컴퓨터공학과 · 팀장',
      date: '2026-06-13', experienceDate: '2026-06-13', createdAt: new Date().toISOString(),
      originalText: src, description: '사용자 인터뷰·요구사항 정리·우선순위·기한 내 완성',
      url: '', files: ['E2E_capstone_report.pdf'],
      star: { s: '', t: '', a: src, r: '' }, competencies: comps, engine: 'test',
    };
    Store.items = [exp, ...Store.items.filter(x => x.id !== 'E2E_TEST_1')];
    return comps.map(c => c.verified);
  }, NARRATIVE);
}

test.describe('PORTRI core pipeline (deterministic)', () => {
  test.afterEach(async ({ page }) => { await restore(page); });

  test('1. experience registration — real UI saves experienceDate & createdAt & originalText', async ({ page }) => {
    await boot(page, '/dashboard.html');
    await page.evaluate(() => { openModal(); setMode('file'); document.getElementById('catSelect').value = 'project'; onCatChange(); });
    await page.fill('#fTitle', '[E2E-UI] 캡스톤');
    await page.fill('#fOrg', '컴퓨터공학과 · 팀장');
    await page.fill('#fStart', '2026-06-01');
    await page.fill('#fEnd', '2026-06-13');
    await page.fill('#fContent', NARRATIVE);
    await page.evaluate(() => { picked = ['E2E_capstone.pdf']; checkReady(); }); // 파일첨부 시뮬레이션(파일 대화상자 자동화 불가)
    await page.click('#analyzeBtn');
    // mock 분석 진행 애니메이션(최대 ~4.2s) 후 저장 완료까지 폴링
    await page.waitForFunction(() => !!Store.items.find(e => e.title === '[E2E-UI] 캡스톤'), null, { timeout: 10000 });
    const saved = await page.evaluate(() => {
      const x = Store.items.find(e => e.title === '[E2E-UI] 캡스톤');
      return x && { hasId: !!x.id, hasExpDate: !!x.experienceDate, createdSeparate: x.createdAt && x.createdAt !== x.experienceDate, hasOriginal: !!x.originalText, engine: x.engine };
    });
    expect(saved).toBeTruthy();
    expect(saved.hasId && saved.hasExpDate && saved.createdSeparate && saved.hasOriginal).toBeTruthy();
    // 새로고침 후 유지
    await page.reload();
    const persists = await page.evaluate(() => !!Store.items.find(e => e.title === '[E2E-UI] 캡스톤'));
    expect(persists).toBeTruthy();
    await page.evaluate(() => { Store.items = Store.items.filter(x => x.title !== '[E2E-UI] 캡스톤'); });
  });

  test('3. evidence verification rejects fabricated/merged, accepts verbatim', async ({ page }) => {
    await boot(page, '/competency.html');
    const r = await page.evaluate((src) => ({
      verbatim: verifyEvidenceAgainstSource('저는 회의 진행과 의견 조정을 담당했고', src),
      whitespace: verifyEvidenceAgainstSource('  저는 회의 진행과   의견 조정을 담당했고 ', src),
      fabricated: verifyEvidenceAgainstSource('30명의 사용자를 인터뷰했습니다', src),
      merged: verifyEvidenceAgainstSource('15명의 사용자를 인터뷰했습니다 핵심 기능 3개를 선정했습니다.', src),
    }), NARRATIVE);
    expect(r.verbatim).toBe(true);
    expect(r.whitespace).toBe(true);
    expect(r.fabricated).toBe(false);
    expect(r.merged).toBe(false);
  });

  test('4+5. competencyReason & strengthLevel/Reason present and shown on card-detail', async ({ page }) => {
    await boot(page, '/dashboard.html');
    const verified = await injectE2E(page);
    expect(verified.every(Boolean)).toBeTruthy();
    await page.goto(BASE + '/card-detail.html?id=E2E_TEST_1');
    await expect(page.locator('#compList')).toContainText('왜 이 역량인가요?');
    await expect(page.locator('#compList')).toContainText('증거 강도 근거');
    await expect(page.locator('#compList')).toContainText('검증됨');
    await page.evaluate(() => { Store.items = Store.items.filter(x => x.id !== 'E2E_TEST_1'); });
  });

  test('6. evidence index accumulation matches manual calculation', async ({ page }) => {
    await boot(page, '/competency.html');
    await injectE2E(page);
    const r = await page.evaluate(() => {
      const now = new Date();
      const idx = evidenceIndexFor('의사소통', Store.items, null, now);
      const W = EVIDENCE_INDEX_WEIGHTS, p = idx.parts;
      const manual = Math.round(p.quantity * W.quantity + p.strength * W.strength + p.diversity * W.diversity + p.continuity * W.continuity + p.recency * W.recency);
      return { index: idx.index, manual, ev: idx.evidenceCount };
    });
    expect(r.manual).toBe(r.index);
    await page.evaluate(() => { Store.items = Store.items.filter(x => x.id !== 'E2E_TEST_1'); });
  });

  test('7. growth uses experienceDate; recent test exp excluded from 6-months-ago snapshot; no peer averages', async ({ page }) => {
    await boot(page, '/competency.html');
    await injectE2E(page);
    await page.reload();
    const r = await page.evaluate(() => {
      const now = new Date(), asOf = monthsAgo(6, now);
      const cur = evidenceIndexFor('의사소통', Store.items, null, now);
      const past = evidenceIndexFor('의사소통', Store.items, asOf, now);
      return { curEv: cur.evidenceCount, pastEv: past.evidenceCount, note: document.getElementById('growthStrip').textContent.includes('활동 시점을 기준') };
    });
    expect(r.curEv).toBeGreaterThan(r.pastEv);       // 최근 경험이 현재에만 반영
    expect(r.note).toBeTruthy();                     // 활동 시점 기준 안내
    // 학생 비교 데이터 완전 제거
    const html = await page.content();
    expect(html).not.toContain('학과평균');
    expect(html).not.toContain('동일학년');
    await page.evaluate(() => { Store.items = Store.items.filter(x => x.id !== 'E2E_TEST_1'); });
  });

  test('8. document generation uses only selected verified evidence', async ({ page }) => {
    await boot(page, '/studio.html');
    await injectE2E(page);
    await page.reload();
    const r = await page.evaluate(() => {
      switchDoc('portfolio');
      localStorage.removeItem('cda_doc_portfolio');
      toggleSel('portfolio', 'E2E_TEST_1', true); renderPortfolio();
      const sel = { counts: document.getElementById('counts').textContent, hasE2E: document.querySelector('#docBody').textContent.includes('[E2E]') };
      toggleSel('portfolio', 'E2E_TEST_1', false); renderPortfolio();
      const des = { counts: document.getElementById('counts').textContent, hasE2E: document.querySelector('#docBody').textContent.includes('[E2E]') };
      return { sel, des };
    });
    expect(r.sel.hasE2E).toBe(true);
    expect(r.des.hasE2E).toBe(false);
    expect(r.sel.counts).toContain('검증 Evidence');
    await page.evaluate(() => { Store.items = Store.items.filter(x => x.id !== 'E2E_TEST_1'); localStorage.removeItem('cda_doc_portfolio'); });
  });

  test('14. no unexpected console/page errors on core pages', async ({ page }) => {
    // 백엔드(:8000) 미실행 시 발생하는 연결 실패는 try/catch로 처리되는 예상된 폴백이므로 제외
    const isExpected = (t) => /ERR_CONNECTION_REFUSED|localhost:8000|Failed to load resource/i.test(t);
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !isExpected(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => { if (!isExpected(String(e))) errors.push(String(e)); });
    for (const u of ['/dashboard.html', '/competency.html', '/coaching.html', '/studio.html', '/curricular.html']) {
      await boot(page, u); await page.waitForTimeout(600);
    }
    expect(errors).toEqual([]);   // JS 런타임 에러 / 미처리 예외 없음
  });
});

test.describe('live AI (requires backend on :8000 + OPENAI_API_KEY)', () => {
  test('2. real AI evidence extraction — SKIPPED when backend down (BLOCKED)', async ({ page }) => {
    await page.goto(BASE + '/dashboard.html');
    const up = await page.evaluate(async () => {
      try { const r = await fetch('http://localhost:8000/health'); return r.ok; } catch { return false; }
    });
    test.skip(!up, 'BLOCKED: backend :8000 unreachable or no OPENAI_API_KEY — live AI not tested');
    const data = await page.evaluate(() => analyzeBackend({ text: '사용자 15명을 인터뷰하여 요구사항을 정리했다.', category: 'project' }));
    expect(Array.isArray(data.competencies)).toBeTruthy();
    // 실제 AI 결과의 evidence는 원문에 존재해야 함
    for (const c of data.competencies) {
      expect(String(data.source_text || '').includes(c.evidence.slice(0, 20))).toBeTruthy();
    }
  });
});
