"""메타(Facebook·Instagram·Messenger)의 '대한민국 개인정보 보호 고지사항'에서
국외 이전처 명단과 AI 파트너 목록을 파싱해 data/services/meta.json으로 저장한다.
(data/schema.json 참고)

원문: https://www.facebook.com/about/privacy/korea

다른 서비스와 결정적으로 다른 점이 두 가지다.

1. 자동 수집이 불가능하다. 페이지가 JS로 렌더링되고 DOM 클래스명이 난독화되어
   있어(x1lliihq 같은 자동 생성 클래스) HTML 구조를 신뢰할 수 없다. 그래서
   실제 브라우저로 열어 렌더링된 텍스트를 data/snapshots/에 저장해 두고,
   이 스크립트는 그 스냅샷을 파싱한다. 수집 시점이 파일명에 박혀 재현 가능하다.

2. 이전받는 자의 '이름만' 공시되어 있다. 국가·목적·항목·보유기간·이전방법이
   표에 아예 없다. 지금까지 파싱한 서비스 중 공시 수준이 가장 낮다.
   따라서 country는 전부 null이며, 회사명에 국가명이 들어 있는 경우에 한해
   inferredCountry로 따로 표시한다. 이것은 공시가 아니라 우리 쪽 추정이므로
   country와 분리하고 inferenceBasis에 근거를 남긴다.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SNAPSHOT = ROOT / "data" / "snapshots" / "meta-korea-2026-09-06.txt"
OUTPUT_PATH = ROOT / "data" / "services" / "meta.json"
PUBLIC_PATH = ROOT / "public" / "data" / "meta.json"

SOURCE_URL = "https://www.facebook.com/about/privacy/korea"

AI_SECTION = "AI 관련 개인정보 제공"
TRANSFER_SECTION = "개인정보의 처리 위탁 및 개인정보의 국외 이전"
LIST_LEAD = "이 표는 정기적으로 업데이트됩니다."  # 안내 문단 끝에 붙어 있어 부분 일치로 찾는다

# 회사명에 '국가·도시 이름'이 그대로 들어간 경우만 추정에 쓴다.
# 법인격 약어(BV=네덜란드, AG=스위스, GmbH=독일 등)는 국가를 특정하는 근거로
# 쓰기에 모호해서 일부러 제외했다.
COUNTRY_TOKENS = {
    "FRANCE": "프랑스",
    "MALAYSIA": "말레이시아",
    "PORTUGAL": "포르투갈",
    "COLOMBIA": "콜롬비아",
    "CHILE": "칠레",
    "ARGENTINA": "아르헨티나",
    "PERU": "페루",
    "BRASIL": "브라질",
    "BRAZIL": "브라질",
    "INDIA": "인도",
    "INDONESIA": "인도네시아",
    "PHILIPPINES": "필리핀",
    "SWEDEN": "스웨덴",
    "ALGERIE": "알제리",
    "HONGKONG": "홍콩",
    "DUBAI": "아랍에미리트",
    "MUNICH": "독일",
    "LONDON": "영국",
    "USA": "미국",
    "UK": "영국",
    "CHINA": "중국",
    "AUSTRALIAN": "호주",
}


def infer_country(name):
    """회사명에서 국가를 추정한다. 후보가 정확히 하나일 때만 인정한다.

    'TELEKOMUNIKASI INDONESIA INTERNATIONAL HONGKONG LIMITED'처럼 두 나라가
    함께 나오면 어느 쪽이 소재지인지 알 수 없으므로 추정하지 않는다.
    """
    words = set(re.findall(r"[A-Z]+", name.upper()))
    hits = sorted({COUNTRY_TOKENS[w] for w in words if w in COUNTRY_TOKENS})
    return hits[0] if len(hits) == 1 else None


def section_lines(lines, start_marker, end_marker=None):
    """start_marker를 담은 줄 다음부터 end_marker 전까지를 돌려준다.

    구간 시작 표시가 제목 한 줄인 경우도 있고 안내 문단 끝 문장인 경우도 있어
    완전 일치가 아니라 부분 일치로 찾는다.
    """
    try:
        start = next(i for i, l in enumerate(lines) if start_marker in l)
    except StopIteration:
        raise RuntimeError(f"'{start_marker}' 구간을 찾지 못함 - 스냅샷 형식 확인 필요")
    end = len(lines)
    if end_marker:
        end = next((i for i in range(start + 1, len(lines)) if end_marker in lines[i]), len(lines))
    return lines[start + 1 : end]


def main():
    snapshot = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SNAPSHOT
    lines = [l.strip() for l in snapshot.read_text(encoding="utf-8").split("\n")]
    lines = [l for l in lines if l]

    # 1) AI 파트너 - 안내 문단 뒤에 회사명만 한 줄씩 나열된다.
    ai_block = section_lines(lines, AI_SECTION, TRANSFER_SECTION)
    ai_partners = [l for l in ai_block if len(l) < 40 and not l.endswith(("다.", "요.", "니다"))]
    if not ai_partners:
        raise RuntimeError("AI 파트너 목록이 비었음 - 스냅샷 형식 확인 필요")

    # 2) 국외 이전처 명단 - 안내 문단 마지막 줄 다음부터 끝까지
    recipients = section_lines(lines, LIST_LEAD)
    if len(recipients) < 50:
        raise RuntimeError(f"이전처 명단이 {len(recipients)}건뿐 - 스냅샷이 잘렸는지 확인 필요")

    overseas = []
    for name in ai_partners:
        overseas.append(
            {
                "country": None,
                "countries": [],
                "transferredAt": "필요할 때마다 수시로 통신망을 통해 이전",
                "recipient": name,
                "contact": None,
                "purposeAndItems": "Meta AI 기능 제공을 위한 검색 엔진 등 파트너 제공 / 항목 미공시",
                "retentionPeriod": None,
                "transferType": "AI 파트너 제공",
                "countryDisclosed": False,
                "inferredCountry": infer_country(name),
                "inferenceBasis": None,
            }
        )

    for name in recipients:
        inferred = infer_country(name)
        overseas.append(
            {
                "country": None,
                "countries": [],
                "transferredAt": None,
                "recipient": name,
                "contact": None,
                "purposeAndItems": "목적·항목 미공시",
                "retentionPeriod": None,
                "transferType": "국외 이전처",
                "countryDisclosed": False,
                "inferredCountry": inferred,
                "inferenceBasis": "회사명에 포함된 국가·도시명 (공시가 아닌 추정)" if inferred else None,
            }
        )

    inferred_count = sum(1 for t in overseas if t["inferredCountry"])
    data = {
        "service": {
            "id": "meta",
            "name": "메타 (인스타그램·페이스북·메신저)",
            "policyUrl": "https://www.facebook.com/privacy/policy",
            "consignmentSourceUrl": SOURCE_URL,
            "retrievedAt": "2026-09-06",
            "policyEffectiveDate": "2026-05-08",
            "retrievalMethod": (
                "자동 스크래핑 불가. 페이지가 JS 렌더링이고 DOM 클래스명이 난독화되어 있어, "
                "실제 브라우저로 열어 렌더링된 텍스트를 data/snapshots/meta-korea-2026-09-06.txt 로 "
                "저장한 뒤 pipeline/extract_meta.py 로 파싱했다."
            ),
            "notes": (
                "인스타그램은 독립된 처리방침이 없고 Meta 통합 처리방침을 따른다. "
                "country는 전부 null이다(원문 미공시). inferredCountry는 회사명에 국가·도시명이 "
                "들어 있을 때만 채운 우리 쪽 추정값이며 공시 내용이 아니다. "
                "transferType·countryDisclosed·inferredCountry·inferenceBasis는 schema.json 밖의 보조 필드."
            ),
            "disclosureGaps": [
                f"이전받는 자 {len(recipients)}곳의 이름만 나열하고 이전 국가를 한 건도 공시하지 않음.",
                "이전 목적·이전되는 개인정보 항목·보유기간이 이전처별로 공시되지 않음.",
                "AI 파트너 4곳도 '대한민국 국외에 소재할 수 있습니다'라고만 하고 국가를 특정하지 않음.",
                "국내 위탁사와 국외 수탁사를 구분하지 않고 한 목록에 섞어 제시함 (KT·JTBC·율촌 등 국내 법인 포함).",
                f"회사명에 국가·도시명이 들어 있어 소재지를 추정할 수 있는 곳은 {inferred_count}곳뿐.",
            ],
        },
        # 원문이 위탁과 국외이전을 구분하지 않으므로 consignment/thirdPartyProvision은 비운다.
        # (비어 있는 것은 '해당 없음'이 아니라 '구분 공시 없음'을 뜻한다 - disclosureGaps 참고)
        "consignment": [],
        "thirdPartyProvision": [],
        "overseasTransfer": overseas,
    }

    for path in (OUTPUT_PATH, PUBLIC_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    by_country = {}
    for t in overseas:
        if t["inferredCountry"]:
            by_country[t["inferredCountry"]] = by_country.get(t["inferredCountry"], 0) + 1
    print(
        f"saved {OUTPUT_PATH} (+ public copy)\n"
        f"  AI 파트너={len(ai_partners)}  이전처={len(recipients)}  합계 overseasTransfer={len(overseas)}\n"
        f"  국가 공시=0건 / 회사명으로 추정 가능={inferred_count}건\n"
        f"  추정 국가: {', '.join(f'{k}({v})' for k, v in sorted(by_country.items(), key=lambda x: -x[1]))}"
    )


if __name__ == "__main__":
    main()
