// @ts-check
/**
 * PORTRI AI — Evidence 검증 단위 테스트 (프론트엔드, app.js)
 *
 * 대상 함수:
 *   - verifyEvidenceAgainstSource(evidence, originalText)  — 전체 문자열 검증(공백/개행/NFC만 허용)
 *   - experienceFromBackend(data, meta)                     — 백엔드 verified 신뢰 + 필드 부재시 재대조
 *
 * portri-core-flow.spec.js(핵심 파이프라인 전체 E2E)와 별도로, "증거 검증" 로직 자체를
 * 격리해 단위 테스트한다. 이 파일은 실제 브라우저에서 실행되는 순수 함수 호출 테스트로,
 * DOM 조작·페이지 이동·localStorage 누적 흐름은 다루지 않는다(그건 portri-core-flow가 담당).
 *
 * 백엔드(파이썬) 쪽 동일 로직의 단위 테스트는 backend/test_evidence_verification.py 참조
 * (evidence[:40] in content 방식의 결함을 재현하는 테스트 2가 핵심 증거).
 *
 * 실행 전제: 프론트 서버 실행 중이어야 함 (cd app && python serve.py 8125)
 * 실행: npx playwright test tests/evidence-verification.spec.js
 */
const { test, expect } = require('@playwright/test');

const BASE = process.env.PORTRI_BASE || 'http://localhost:8125';
const NARRATIVE =
  '캡스톤 디자인 프로젝트에서 사용자 요구사항을 파악하기 위해 15명의 사용자를 인터뷰했습니다. ' +
  '인터뷰 결과를 분석하여 5개의 핵심 요구사항으로 정리하고 팀원 4명에게 공유했습니다. ' +
  '이후 팀원들과 우선순위를 논의하여 핵심 기능 3개를 선정했습니다. ' +
  '저는 회의 진행과 의견 조정을 담당했고, 최종적으로 프로젝트 결과물을 계획된 기한 내에 완성했습니다.';

test.beforeEach(async ({ page }) => {
  // app.js가 로드되는 아무 공개 페이지 — 로그인/데이터 상태와 무관한 순수 함수 테스트
  await page.goto(BASE + '/home.html');
});

test.describe('verifyEvidenceAgainstSource — 전체 문자열 검증 (프론트)', () => {
  test('1. 원문에 정확히 존재하는 Evidence -> verified true', async ({ page }) => {
    const r = await page.evaluate(
      (src) => verifyEvidenceAgainstSource('저는 회의 진행과 의견 조정을 담당했고', src),
      NARRATIVE
    );
    expect(r).toBe(true);
  });

  test('2. 앞 40자는 원문과 같지만 뒤에 AI가 생성한 문장이 붙은 경우 -> 검증 실패', async ({ page }) => {
    const r = await page.evaluate((src) => {
      const prefix40 = src.slice(0, 40);
      const fabricated = prefix40 + ' 그리고 전 세계 100개국에서 이 프로젝트로 수상했습니다.';
      return verifyEvidenceAgainstSource(fabricated, src);
    }, NARRATIVE);
    expect(r).toBe(false);
  });

  test('3. 원문의 서로 떨어진 두 문장을 하나로 합친 경우 -> 검증 실패', async ({ page }) => {
    const r = await page.evaluate(
      (src) => verifyEvidenceAgainstSource('15명의 사용자를 인터뷰했습니다 핵심 기능 3개를 선정했습니다.', src),
      NARRATIVE
    );
    expect(r).toBe(false);
  });

  test('4. 공백과 개행 차이만 존재하는 경우 -> 정상 검증(true)', async ({ page }) => {
    const r = await page.evaluate(
      (src) => verifyEvidenceAgainstSource('  저는   회의 진행과\n의견   조정을 담당했고  ', src),
      NARRATIVE
    );
    expect(r).toBe(true);
  });

  test('6. 원문에 존재하지 않는 Evidence -> 검증 실패', async ({ page }) => {
    const r = await page.evaluate(
      (src) => verifyEvidenceAgainstSource('30명의 사용자를 인터뷰하여 큰 성과를 냈습니다.', src),
      NARRATIVE
    );
    expect(r).toBe(false);
  });

  test('Unicode NFC/NFD 정규화 차이만 있는 경우 -> 정상 검증(true)', async ({ page }) => {
    const r = await page.evaluate((src) => {
      const target = '저는 회의 진행과 의견 조정을 담당했고';
      const nfd = target.normalize('NFD');
      return verifyEvidenceAgainstSource(nfd, src);
    }, NARRATIVE);
    expect(r).toBe(true);
  });
});

test.describe('experienceFromBackend — 백엔드 verified 신뢰 + 필드 부재시 재대조 (수정된 핵심 버그)', () => {
  // 수정 전에는 `c.verified === true || (재검증)` 형태의 OR 단락 때문에, 백엔드가 verified:true를
  // 보내는 순간 프론트의 전체-문자열 재검증이 항상 생략되었다. 지금은 필드가 명시돼 있으면
  // 그 값을 신뢰하고, 필드가 없을 때만 프론트가 직접 재검증한다.

  test('백엔드가 verified:true를 명시하면 프론트는 그대로 신뢰한다', async ({ page }) => {
    const r = await page.evaluate((src) => {
      const data = {
        title: '테스트', source_text: src,
        competencies: [{ name: '의사소통', evidence: '아무 문장', verified: true, strengthLevel: 3, strength_reason: 'x' }],
      };
      const exp = experienceFromBackend(data, { source: 'link' });
      return exp.competencies[0].verified;
    }, NARRATIVE);
    expect(r).toBe(true);
  });

  test('백엔드가 verified:false를 명시하면 프론트는 그대로 존중한다(재검증으로 뒤집지 않음)', async ({ page }) => {
    const r = await page.evaluate((src) => {
      const data = {
        title: '테스트', source_text: src,
        // evidence 자체는 원문에 실제로 존재하지만, 백엔드가 false로 판정했다면 그 결정을 따른다
        competencies: [{ name: '의사소통', evidence: '저는 회의 진행과 의견 조정을 담당했고', verified: false, strengthLevel: 3 }],
      };
      const exp = experienceFromBackend(data, { source: 'link' });
      return exp.competencies[0].verified;
    }, NARRATIVE);
    expect(r).toBe(false);
  });

  test('verified 필드가 없는 레거시 응답은 프론트가 원문과 재대조한다 — 검증 통과 케이스', async ({ page }) => {
    const r = await page.evaluate((src) => {
      const data = {
        title: '테스트', source_text: src,
        competencies: [{ name: '의사소통', evidence: '저는 회의 진행과 의견 조정을 담당했고', strengthLevel: 3 }], // verified 필드 없음
      };
      const exp = experienceFromBackend(data, { source: 'link' });
      return exp.competencies[0].verified;
    }, NARRATIVE);
    expect(r).toBe(true);
  });

  test('verified 필드가 없고 원문 앞부분만 같은 조작된 Evidence는 재대조에서 거부된다', async ({ page }) => {
    const r = await page.evaluate((src) => {
      const prefix40 = src.slice(0, 40);
      const data = {
        title: '테스트', source_text: src,
        competencies: [{ name: '의사소통', evidence: prefix40 + ' 완전히 지어낸 성과입니다.', strengthLevel: 3 }], // verified 필드 없음
      };
      const exp = experienceFromBackend(data, { source: 'link' });
      return exp.competencies[0].verified;
    }, NARRATIVE);
    expect(r).toBe(false);
  });

  test('verified 필드도 원문(sourceText)도 없으면 검증되지 않은 것으로 처리한다 (추측으로 통과시키지 않음)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const data = { title: '테스트', competencies: [{ name: '의사소통', evidence: '아무 문장', strengthLevel: 3 }] }; // source_text 없음
      const exp = experienceFromBackend(data, { source: 'link' }); // meta.originalText/description도 없음
      return exp.competencies[0].verified;
    });
    expect(r).toBe(false);
  });

  test('verified=false인 Evidence는 isVerified()가 계산 대상에서 제외한다', async ({ page }) => {
    const r = await page.evaluate((src) => {
      const data = {
        title: '테스트', source_text: src,
        competencies: [
          { name: '의사소통', evidence: '저는 회의 진행과 의견 조정을 담당했고', verified: true, strengthLevel: 3 },
          { name: '의사소통', evidence: '조작된 문장', verified: false, strengthLevel: 3 },
        ],
      };
      const exp = experienceFromBackend(data, { source: 'link' });
      return exp.competencies.filter(isVerified).length;
    }, NARRATIVE);
    expect(r).toBe(1);
  });
});
