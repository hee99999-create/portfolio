# -*- coding: utf-8 -*-
"""
evidence_verification.py 단위 테스트 (표준 unittest만 사용 — 외부 의존성 없음).

이 모듈은 main.py(FastAPI/OpenAI)와 무관하게 실행 가능하다. 즉 OPENAI_API_KEY나
backend 패키지(openai, fastapi 등) 설치 없이도 항상 실행할 수 있다.

실행:
  cd backend
  python -m unittest test_evidence_verification.py -v
"""
import unittest

from evidence_verification import (
    verify_evidence_against_source,
    dedupe_competencies_by_evidence,
    normalize_for_verify,
)

NARRATIVE = (
    "캡스톤 디자인 프로젝트에서 사용자 요구사항을 파악하기 위해 15명의 사용자를 인터뷰했습니다. "
    "인터뷰 결과를 분석하여 5개의 핵심 요구사항으로 정리하고 팀원 4명에게 공유했습니다. "
    "이후 팀원들과 우선순위를 논의하여 핵심 기능 3개를 선정했습니다. "
    "저는 회의 진행과 의견 조정을 담당했고, 최종적으로 프로젝트 결과물을 계획된 기한 내에 완성했습니다."
)


class VerifyEvidenceAgainstSourceTest(unittest.TestCase):
    # 테스트 1: 원문에 정확히 존재하는 Evidence -> verified=true
    def test_1_verbatim_evidence_is_verified(self):
        r = verify_evidence_against_source("저는 회의 진행과 의견 조정을 담당했고", NARRATIVE)
        self.assertTrue(r["verified"])
        # 위치를 찾을 수 있으면 원본에서 실제로 그 구간을 복원할 수 있어야 한다(추측 금지 확인)
        self.assertIsNotNone(r["sourceStart"])
        self.assertIsNotNone(r["sourceEnd"])
        self.assertEqual(
            normalize_for_verify(NARRATIVE[r["sourceStart"]:r["sourceEnd"]]),
            normalize_for_verify("저는 회의 진행과 의견 조정을 담당했고"),
        )

    # 테스트 2: 앞 40자는 원문과 같지만 뒤에 AI가 생성한 문장이 붙은 경우 -> 검증 실패
    # (구버전 evidence[:40] in content 방식이 통과시키던 결함 케이스)
    def test_2_prefix_match_with_fabricated_tail_is_rejected(self):
        prefix40 = NARRATIVE[:40]
        self.assertIn(prefix40, NARRATIVE)  # 전제 확인: 앞 40자는 실제로 원문과 일치
        fabricated = prefix40 + " 그리고 전 세계 100개국에서 이 프로젝트로 수상했습니다."
        r = verify_evidence_against_source(fabricated, NARRATIVE)
        self.assertFalse(r["verified"])
        self.assertIsNone(r["sourceStart"])
        self.assertIsNone(r["sourceEnd"])

    # 테스트 3: 원문의 서로 떨어진 두 문장을 하나로 합친 경우 -> 검증 실패
    def test_3_merged_disjoint_sentences_is_rejected(self):
        merged = "15명의 사용자를 인터뷰했습니다 핵심 기능 3개를 선정했습니다."
        r = verify_evidence_against_source(merged, NARRATIVE)
        self.assertFalse(r["verified"])

    # 테스트 4: 공백과 개행 차이만 존재하는 경우 -> 정상 검증
    def test_4_whitespace_and_newline_only_difference_is_verified(self):
        with_noise = "  저는   회의 진행과\n의견   조정을 담당했고  "
        r = verify_evidence_against_source(with_noise, NARRATIVE)
        self.assertTrue(r["verified"])

    # 테스트 6: 원문에 전혀 존재하지 않는 Evidence -> 검증 실패
    def test_6_evidence_not_in_source_is_rejected(self):
        r = verify_evidence_against_source("30명의 사용자를 인터뷰하여 큰 성과를 냈습니다.", NARRATIVE)
        self.assertFalse(r["verified"])

    # 경계값: 빈 evidence / 빈 원문
    def test_empty_inputs_are_rejected_without_crashing(self):
        self.assertFalse(verify_evidence_against_source("", NARRATIVE)["verified"])
        self.assertFalse(verify_evidence_against_source("무엇", "")["verified"])
        self.assertFalse(verify_evidence_against_source(None, NARRATIVE)["verified"])
        self.assertFalse(verify_evidence_against_source("무엇", None)["verified"])

    # Unicode 정규화(NFC/NFD) 차이만 있는 경우도 허용되어야 한다
    def test_unicode_nfc_nfd_difference_is_verified(self):
        import unicodedata
        target = "저는 회의 진행과 의견 조정을 담당했고"
        nfd_evidence = unicodedata.normalize("NFD", target)
        r = verify_evidence_against_source(nfd_evidence, NARRATIVE)
        self.assertTrue(r["verified"])


class DedupeCompetenciesByEvidenceTest(unittest.TestCase):
    # 테스트 5: 동일 Evidence가 두 번 반환된 경우 -> 하나만 저장
    def test_5_exact_duplicate_evidence_kept_once(self):
        comps = [
            {"name": "의사소통", "evidence": "핵심 요구사항으로 정리하고 팀원 4명에게 공유했습니다."},
            {"name": "종합적사고력", "evidence": "핵심 요구사항으로 정리하고 팀원 4명에게 공유했습니다."},
        ]
        out = dedupe_competencies_by_evidence(comps)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["name"], "의사소통")  # 먼저 등장한 것을 유지

    def test_5b_whitespace_only_duplicate_kept_once(self):
        comps = [
            {"name": "의사소통", "evidence": "핵심 요구사항으로 정리하고 팀원 4명에게 공유했습니다."},
            {"name": "대인관계", "evidence": "핵심 요구사항으로   정리하고\n팀원 4명에게 공유했습니다."},
        ]
        out = dedupe_competencies_by_evidence(comps)
        self.assertEqual(len(out), 1)

    def test_distinct_evidence_both_kept(self):
        comps = [
            {"name": "의사소통", "evidence": "문장 A"},
            {"name": "대인관계", "evidence": "문장 B"},
        ]
        out = dedupe_competencies_by_evidence(comps)
        self.assertEqual(len(out), 2)

    def test_empty_list_returns_empty_list(self):
        self.assertEqual(dedupe_competencies_by_evidence([]), [])


class AnalyzePipelineSimulationTest(unittest.TestCase):
    """
    main.py의 /analyze가 실제로 수행하는 '검증 -> 중복 제거' 조합을
    main.py를 import하지 않고(= OpenAI API 키 불필요) 동일한 순서로 재현해 검증한다.
    """

    def _run_pipeline(self, raw_competencies, content):
        checked = []
        for c in raw_competencies:
            verdict = verify_evidence_against_source(c.get("evidence") or "", content)
            if not verdict["verified"]:
                continue
            c = dict(c)
            c["verified"] = True
            c["sourceStart"] = verdict["sourceStart"]
            c["sourceEnd"] = verdict["sourceEnd"]
            checked.append(c)
        return dedupe_competencies_by_evidence(checked)

    def test_mixed_batch_keeps_only_verified_and_deduped(self):
        raw = [
            {"name": "의사소통", "evidence": "인터뷰 결과를 분석하여 5개의 핵심 요구사항으로 정리하고 팀원 4명에게 공유했습니다."},
            {"name": "대인관계", "evidence": "저는 회의 진행과 의견 조정을 담당했고"},
            # 앞부분만 진짜, 뒤에 조작된 문장 (구버전 결함 케이스) -> 제외되어야 함
            {"name": "종합적사고력", "evidence": NARRATIVE[:40] + " 완전히 지어낸 성과입니다."},
            # 원문에 전혀 없음 -> 제외되어야 함
            {"name": "자기관리", "evidence": "존재하지 않는 문장입니다."},
            # 위 의사소통과 완전히 동일한 evidence 중복 -> 제거되어야 함
            {"name": "자기관리", "evidence": "인터뷰 결과를 분석하여 5개의 핵심 요구사항으로 정리하고 팀원 4명에게 공유했습니다."},
        ]
        out = self._run_pipeline(raw, NARRATIVE)
        names = [c["name"] for c in out]
        self.assertEqual(names, ["의사소통", "대인관계"])  # 검증 통과 + 중복 제거 후 남는 2건만
        self.assertTrue(all(c["verified"] for c in out))


if __name__ == "__main__":
    unittest.main(verbosity=2)
