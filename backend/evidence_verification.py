# -*- coding: utf-8 -*-
"""
Evidence 원문 검증 — "증거로 검증된 것만 자산이 된다"의 기술적 구현.

이 모듈은 FastAPI/OpenAI 등 외부 의존성이 전혀 없는 순수 함수만 담는다.
(API 키 없이도 단위 테스트가 항상 실행되도록 하기 위함 — test_evidence_verification.py 참조)

검증 파이프라인 (main.py의 /analyze 에서 사용):
  원문(content)
   -> Unicode 정규화(NFC)
   -> 공백/개행 정규화
   -> Evidence 전체 문자열이 정규화된 원문에 부분 문자열로 존재하는지 확인
   -> 존재하면 원본(비정규화) content에서 정확한 문자 위치(start/end)를 추가로 탐색
   -> verified / sourceStart / sourceEnd 반환

이전 방식(evidence[:40] in content)의 문제:
  - evidence의 앞 40자만 일치하면 통과 -> AI가 뒷부분에 원문에 없는 문장을 이어붙여도 검증을 통과함
  - 부분 일치이므로 서로 떨어진 문장을 하나로 합친 evidence도 앞 40자만 맞으면 통과함
  - 공백/개행 차이를 다루지 않아 정상 evidence가 오탐으로 거부될 수 있음
이 모듈은 evidence '전체' 문자열을 대조하여 위 문제를 차단한다.
"""
import re
import unicodedata


def normalize_for_verify(text):
    """Unicode NFC 정규화 + 공백/개행을 단일 공백으로 정규화."""
    if text is None:
        return ""
    text = unicodedata.normalize("NFC", str(text))
    text = re.sub(r"\s+", " ", text).strip()
    return text


def verify_evidence_against_source(evidence, source_text):
    """
    evidence 전체 문자열이 source_text 안에 실제로 존재하는지 검증한다.

    - 공백/개행 차이는 허용한다(정규화 후 비교).
    - Unicode 정규화(NFC) 차이도 허용한다.
    - evidence의 앞부분만이 아니라 '전체' 문자열을 대조한다(할루시네이션 차단 강화).
    - 검증에 성공하면 원본(source_text, 정규화 이전) 안에서 정확한 문자 위치를
      찾을 수 있는 경우에만 sourceStart/sourceEnd를 채운다. 정확히 찾을 수 없으면
      추측하지 않고 None으로 둔다.

    반환값: {"verified": bool, "sourceStart": int|None, "sourceEnd": int|None}
    """
    if not evidence or not source_text:
        return {"verified": False, "sourceStart": None, "sourceEnd": None}

    ev_norm = normalize_for_verify(evidence)
    src_norm = normalize_for_verify(source_text)
    if not ev_norm or ev_norm not in src_norm:
        return {"verified": False, "sourceStart": None, "sourceEnd": None}

    start, end = _locate_in_original(evidence, source_text)
    return {"verified": True, "sourceStart": start, "sourceEnd": end}


def _locate_in_original(evidence, source_text):
    """
    원본(정규화하지 않은) source_text 안에서 evidence의 정확한 문자 위치를 찾는다.

    정규화된 문자열의 위치는 원본과 어긋날 수 있으므로(NFC 정규화가 문자 길이를
    바꿀 수 있음) 반드시 원본 문자열에 대해 직접 검색한다. evidence 안의 공백/개행은
    "\\s+" 패턴으로 치환해 원본의 공백 차이를 허용하되, 그 외 문자는 정확히 일치해야
    한다. 찾지 못하면 (None, None)을 반환한다 — 위치를 추측해서 만들어내지 않는다.
    """
    tokens = [t for t in re.split(r"\s+", evidence.strip()) if t]
    if not tokens:
        return None, None
    pattern = r"\s+".join(re.escape(t) for t in tokens)
    try:
        m = re.search(pattern, source_text)
    except re.error:
        return None, None
    if not m:
        return None, None
    return m.start(), m.end()


def dedupe_competencies_by_evidence(competencies):
    """
    동일 경험 안에서 동일하거나 공백/개행만 다른 Evidence가 중복 등장하면
    처음 등장한 것만 남기고 제거한다(문자열 기준 명확한 중복만 제거).

    의미가 비슷하다는 이유만으로는 제거하지 않는다 — normalize_for_verify()로
    정규화한 문자열이 완전히 같을 때만 중복으로 판단한다.
    """
    seen = set()
    result = []
    for c in competencies or []:
        key = normalize_for_verify((c or {}).get("evidence", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(c)
    return result
