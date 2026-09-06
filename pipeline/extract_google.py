"""구글의 '한국 거주자를 위한 개인정보 관련 추가 정보' 부록에서 위탁·제3자 제공·
국외이전 표를 파싱해 data/services/google.json으로 저장한다. (data/schema.json 참고)

원문(https://policies.google.com/privacy/additional?hl=ko&gl=kr)은 정적 HTML이고
관련 표가 3개 있다.
  표 1 - 개인정보 처리 업무의 위탁 [위탁업체 회사명 | 위탁업무 내용] (국내·국외 혼재)
  표 2 - 국외 수탁업체가 접근하는 정보 [위탁업체 회사명 | 이전되는 정보]
  표 3 - 개인정보 제공 [제공받은 자 | 제공하는 항목 | 제공하는 목적 | 보유 및 이용 기간]

쿠팡·넷플릭스와 다른 점이 세 가지다.
  1. 국가를 별도 컬럼으로 두지 않고 회사명 끝 괄호에 적는다
     (예: 'Accenture (말레이시아, 인도)'). 상호 자체가 '(주)...'로 시작하는
     국내 업체와 헷갈리지 않도록, 문자열 끝 괄호만 보고 그 내용이 알려진
     국가명일 때만 국가로 인정한다.
  2. 표 2에는 이전 일시·방법과 보유기간 컬럼이 없다. 지어내지 않고 null로 둔다.
  3. 이용자 정보 전체가 '국외에 소재하는 Google의 데이터 센터'로 전송된다고
     본문에 적혀 있으나 국가명이 공시되어 있지 않다. 이 건은 국가를 만들어내지
     않고 country=null인 국외이전 항목으로 기록하며,
     service.disclosureGaps에 공시 미비로 함께 남긴다.
"""
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

SOURCE_URL = "https://policies.google.com/privacy/additional?hl=ko&gl=kr"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "services" / "google.json"
PUBLIC_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "google.json"

BLOCK_TAGS = {"p", "div", "li", "br", "tr"}
SEP = "\x00"

# 회사명 끝 괄호를 국가로 인정할지 판단하는 기준.
# 원문에 실제로 등장하는 국가만 담고, 새 국가가 나오면 파서가 알려주도록 한다.
KNOWN_COUNTRIES = {"말레이시아", "인도", "싱가포르", "필리핀", "미국", "일본", "중국", "베트남", "대만", "홍콩", "호주", "영국", "아일랜드"}


class TableParser(HTMLParser):
    """표의 각 셀을 블록 단위로 쪼갠 문자열 리스트로 수집한다."""

    def __init__(self):
        super().__init__()
        self.tables: list[list[list[list[str]]]] = []
        self._in_table = False
        self._in_cell = False
        self._cell: list[str] = []
        self._row: list[list[str]] = []
        self._rows: list[list[list[str]]] = []

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._in_table = True
            self._rows = []
        elif self._in_table and tag == "tr":
            self._row = []
        elif self._in_table and tag in ("th", "td"):
            self._in_cell = True
            self._cell = []
        elif self._in_cell and tag in BLOCK_TAGS:
            self._cell.append(SEP)

    def handle_endtag(self, tag):
        if self._in_table and tag in ("th", "td") and self._in_cell:
            parts = [re.sub(r"\s+", " ", p).strip() for p in "".join(self._cell).split(SEP)]
            self._row.append([p for p in parts if p])
            self._in_cell = False
        elif self._in_table and tag == "tr":
            if self._row:
                self._rows.append(self._row)
        elif tag == "table" and self._in_table:
            self.tables.append(self._rows)
            self._in_table = False

    def handle_data(self, data):
        if self._in_cell:
            self._cell.append(data)


def split_countries(name):
    """회사명 끝 괄호에서 국가 목록을 뽑는다. 국가가 아니면 빈 목록.

    '(주)트랜스코스모스코리아'처럼 괄호가 앞에 오는 상호는 끝 괄호가 아니므로
    애초에 걸리지 않고, 끝 괄호라도 내용이 알려진 국가명이 아니면 무시한다.
    """
    m = re.search(r"[(（]([^)）]*)[)）]\s*$", name)
    if not m:
        return []
    parts = [p.strip() for p in m.group(1).split(",")]
    return parts if parts and all(p in KNOWN_COUNTRIES for p in parts) else []


def strip_country_suffix(name):
    """표시용으로 회사명 끝의 국가 괄호를 떼어낸다."""
    return re.sub(r"\s*[(（][^)）]*[)）]\s*$", "", name).strip() if split_countries(name) else name.strip()


def company_and_contact(cell):
    """'위탁업체 회사명' 셀을 (회사명, 연락처 이메일)로 나눈다.

    셀 안이 ['Tech Mahindra Limited', '(인도)', '연락처:', 'a@b.com'] 처럼
    블록으로 쪼개져 있으므로, '연락처' 앞까지를 이름으로 합친다.
    """
    name_parts = []
    for part in cell:
        if part.startswith("연락처"):
            break
        name_parts.append(part)
    name = " ".join(name_parts).strip()
    # 국가 괄호가 별도 블록으로 떨어져 나온 경우 '이름 (인도)'로 다시 붙는다
    name = re.sub(r"\s+([(（])", r" \1", name)
    # 원문이 일반 하이픈 대신 비단절 하이픈(U+2011)을 쓰는 주소가 있어 함께 허용한다
    # (예: Privacy‑OpenPlatform@alipay.com)
    email = re.search(r"[\w.+\-‑]+@[\w.\-‑]+", " ".join(cell))
    return name, (email.group(0) if email else None)


def main():
    # 사용법: python extract_google.py [저장해둔 원문 html 경로]
    # 경로를 주면 네트워크 없이 스냅샷 파일로 파싱한다 (수집 시점 고정·재현 용도).
    if len(sys.argv) > 1:
        html = Path(sys.argv[1]).read_text(encoding="utf-8")
    else:
        req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp:
            html = resp.read().decode("utf-8")

    parser = TableParser()
    parser.feed(html)
    # 마지막 표(수집 항목·처리 목적 설명)는 위탁/제공 현황이 아니므로 쓰지 않는다.
    if len(parser.tables) < 3:
        raise RuntimeError(
            f"위탁·국외이전·제공 표 3개를 기대했으나 {len(parser.tables)}개만 발견됨 - 페이지 구조 확인 필요"
        )
    consignment_table, overseas_table, provision_table = parser.tables[0], parser.tables[1], parser.tables[2]

    # 1) 위탁 현황 - 국내·국외가 한 표에 섞여 있다. 국가는 회사명 괄호에서 뽑는다.
    consignment = []
    countries_by_company = {}
    for row in consignment_table[1:]:
        raw_name = " ".join(row[0])
        countries = split_countries(raw_name)
        name = strip_country_suffix(raw_name)
        countries_by_company[name] = countries
        consignment.append(
            {
                "task": " ".join(row[1]),
                "consignee": name,
                "retentionPeriod": None,  # 원문 표에 보유기간 컬럼 없음
                "countries": countries,  # 파생 필드. 빈 목록이면 국내이거나 국가 미공시
            }
        )

    # 2) 국외 수탁업체가 접근하는 정보 - 위탁 표에서 업무 내용을 가져와 합친다.
    overseas = []
    for row in overseas_table[1:]:
        raw_name, contact = company_and_contact(row[0])
        countries = split_countries(raw_name)
        name = strip_country_suffix(raw_name)
        if not countries:
            countries = countries_by_company.get(name, [])
        task = next((c["task"] for c in consignment if c["consignee"] == name), None)
        items = " / ".join(row[1])
        overseas.append(
            {
                "country": ", ".join(countries) if countries else None,
                "countries": countries,
                "transferredAt": None,  # 원문 표에 이전 일시·방법 컬럼 없음
                "recipient": name,
                "contact": contact,
                "purposeAndItems": f"{task} / {items}" if task else items,
                "retentionPeriod": None,  # 원문 표에 보유기간 컬럼 없음
                "transferType": "처리위탁",
            }
        )

    # 3) 본문에만 적힌 자사 데이터센터 이전. 국가가 공시되어 있지 않아 country=null.
    overseas.append(
        {
            "country": None,
            "countries": [],
            "transferredAt": "수집과 동시에 정보통신망을 통하여 전송",
            "recipient": "국외에 소재하는 Google의 데이터 센터",
            "contact": "googlekrsupport@google.com",
            "purposeAndItems": "서비스 제공 및 정보보호 등 / 본 문서에 열거된 수집 항목 전체",
            "retentionPeriod": "사용자 삭제 시 또는 사용자가 설정한 자동삭제 기간까지 (법정 보관 의무 시 5년 이상)",
            "transferType": "자사 데이터센터 이전",
            "countryDisclosed": False,
        }
    )

    # 4) 제3자 제공
    third_party = [
        {
            "recipient": " ".join(row[0]),
            "purpose": " ".join(row[2]),
            "items": " ".join(row[1]),
            "retentionPeriod": " ".join(row[3]),
        }
        for row in provision_table[1:]
    ]

    undisclosed = [c["consignee"] for c in consignment if not c["countries"]]

    data = {
        "service": {
            "id": "google",
            "name": "구글",
            "policyUrl": "https://policies.google.com/privacy?hl=ko",
            "consignmentSourceUrl": SOURCE_URL,
            "retrievedAt": "2026-09-06",
            "retrievalMethod": "정적 HTML 자동 파싱 (pipeline/extract_google.py). 한국 거주자용 부록 문서의 위탁·국외이전·제공 표 3개를 사용.",
            "notes": (
                "국가가 별도 컬럼이 아니라 회사명 끝 괄호에 적혀 있어 파싱해 countries 파생 필드로 옮겼다. "
                "국외 수탁 표에는 이전 일시·방법과 보유기간 컬럼이 아예 없어 해당 값은 null이다. "
                "transferType·countryDisclosed는 schema.json 밖의 보조 필드."
            ),
            "disclosureGaps": [
                "이용자 정보 전체가 '국외에 소재하는 Google의 데이터 센터'로 전송된다고만 밝히고 이전 국가를 공시하지 않음 (overseasTransfer의 country=null 항목).",
                "국외 수탁 표에 이전 일시·방법 및 보유기간 항목이 없음.",
                f"위탁업체 {len(undisclosed)}곳은 소재 국가 표기가 없어 국내인지 국외인지 원문만으로 판별 불가: {', '.join(undisclosed)}",
            ],
        },
        "consignment": consignment,
        "thirdPartyProvision": third_party,
        "overseasTransfer": overseas,
    }

    for path in (OUTPUT_PATH, PUBLIC_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    named = sorted({c for t in overseas for c in t["countries"]})
    print(
        f"saved {OUTPUT_PATH} (+ public copy)\n"
        f"  consignment={len(consignment)}  "
        f"thirdPartyProvision={len(third_party)}  "
        f"overseasTransfer={len(overseas)}\n"
        f"  국가 공시된 이전: {', '.join(named)}\n"
        f"  국가 미공시 위탁업체 {len(undisclosed)}곳: {', '.join(undisclosed)}"
    )


if __name__ == "__main__":
    main()
