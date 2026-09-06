"""카카오(주)의 개인정보 처리방침 부속 페이지 4개를 파싱해
data/services/kakao.json으로 저장한다. (data/schema.json 참고)

주의: 기존 data/services/kakaomobility.json 은 자회사인 (주)카카오모빌리티의
별도 처리방침(policy.kakaomobility.com)이다. 본 파일이 다루는 카카오(주)와는
법인·도메인·공시 내용이 모두 다르며 겹치는 데이터가 없다.

원문은 본문(kakao.com/policy/privacy)이 개요만 싣고 실제 표는 부속 페이지
4개로 흩어져 있어, 페이지마다 표 1개씩을 가져온다.
  위탁      policyPrivacyBusiness    [업체명 | 위탁업무 목적]
  국외이전  privacyBusinessTransfer  [수탁업체 | 연락처 | 이전목적 | 항목 | 국가 | 이전일시·방법 | 이용기간]
  제3자제공 informationThirdParty    [서비스명 | 제공받는 자 | 목적 | 항목 | 보유기간]
  제공받음  providedInfo             [제공하는 업체명 | 제공받는 항목 | 제공받는 목적]

두 가지 처리가 필요하다.
  1. 제3자제공·제공받음 표는 쿠팡처럼 병합 셀(rowspan)을 쓴다. 그리드로 전개한다.
  2. 한 칸에 업체가 여러 개 들어가는 경우가 많고 블록 요소로 구분되어 있다.
     원문 문자열을 살리면서 파싱한 목록을 별도 파생 필드로 함께 담는다.

'제공받음' 표는 카카오페이·카카오엔터테인먼트 등에서 카카오로 정보가 흘러
들어오는 역방향 흐름이라 schema.json의 세 배열 어디에도 해당하지 않는다.
버리지 않고 thirdPartyReceipt 보조 필드로 남긴다.
"""
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "data" / "services" / "kakao.json"
PUBLIC_PATH = ROOT / "public" / "data" / "kakao.json"

BASE = "https://www.kakao.com/policy/privacyPolicy/{}?lang=ko"
PAGES = {
    "consignment": "policyPrivacyBusiness",
    "overseas": "privacyBusinessTransfer",
    "thirdParty": "informationThirdParty",
    "receipt": "providedInfo",
}
POLICY_URL = "https://www.kakao.com/policy/privacy"

BLOCK_TAGS = {"p", "div", "li", "br"}
SEP = "\x00"


class TableParser(HTMLParser):
    """표의 각 셀을 (블록 조각 목록, rowspan, colspan)으로 수집한다."""

    def __init__(self):
        super().__init__()
        self.tables = []
        self._in_table = False
        self._in_cell = False
        self._cell = []
        self._attrs = {}
        self._row = []
        self._rows = []

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._in_table = True
            self._rows = []
        elif self._in_table and tag == "tr":
            self._row = []
        elif self._in_table and tag in ("th", "td"):
            self._in_cell = True
            self._cell = []
            self._attrs = dict(attrs)
        elif self._in_cell and tag in BLOCK_TAGS:
            self._cell.append(SEP)

    def handle_endtag(self, tag):
        if self._in_table and tag in ("th", "td") and self._in_cell:
            parts = [re.sub(r"\s+", " ", p).strip() for p in "".join(self._cell).split(SEP)]
            self._row.append(
                (
                    [p for p in parts if p],
                    int(self._attrs.get("rowspan") or 1),
                    int(self._attrs.get("colspan") or 1),
                )
            )
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


def expand_grid(rows):
    """rowspan/colspan을 전개해 모든 행의 열 수를 맞춘다. 셀 값은 블록 조각 목록."""
    grid = []
    pending = {}  # (row, col) -> (value, 남은 행 수)
    for r, row in enumerate(rows):
        out, col = [], 0
        cells = iter(row)
        while True:
            while (r, col) in pending:
                value, remain = pending.pop((r, col))
                out.append(value)
                if remain > 1:
                    pending[(r + 1, col)] = (value, remain - 1)
                col += 1
            cell = next(cells, None)
            if cell is None:
                while (r, col) in pending:
                    value, remain = pending.pop((r, col))
                    out.append(value)
                    if remain > 1:
                        pending[(r + 1, col)] = (value, remain - 1)
                    col += 1
                break
            value, rowspan, colspan = cell
            for _ in range(colspan):
                out.append(value)
                if rowspan > 1:
                    pending[(r + 1, col)] = (value, rowspan - 1)
                col += 1
        grid.append(out)
    return grid


def fetch(key, snapshot_dir):
    if snapshot_dir:
        return (Path(snapshot_dir) / f"kakao_{key}.html").read_text(encoding="utf-8")
    url = BASE.format(PAGES[key])
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        return resp.read().decode("utf-8")


def load_grid(key, snapshot_dir, expected_cols):
    parser = TableParser()
    parser.feed(fetch(key, snapshot_dir))
    if len(parser.tables) != 1:
        raise RuntimeError(f"{key}: 표 1개를 기대했으나 {len(parser.tables)}개 발견 - 페이지 구조 확인 필요")
    grid = expand_grid(parser.tables[0])
    header = [" ".join(c) for c in grid[0]]
    if len(header) != expected_cols:
        raise RuntimeError(f"{key}: 컬럼 {expected_cols}개를 기대했으나 {len(header)}개({header}) - 구조 확인 필요")
    return header, grid[1:]


def joined(cell):
    """블록으로 쪼개진 셀을 원문 순서대로 이어 붙인다."""
    return " / ".join(cell)


def main():
    # 사용법: python extract_kakao.py [스냅샷 디렉터리]
    # 디렉터리를 주면 kakao_<키>.html 파일들을 읽어 네트워크 없이 파싱한다.
    snapshot_dir = sys.argv[1] if len(sys.argv) > 1 else None

    # 1) 위탁 - 한 칸에 업체가 여러 개 들어간다
    _, rows = load_grid("consignment", snapshot_dir, 2)
    consignment = [
        {
            "task": joined(task),
            "consignee": joined(names),
            "consignees": list(names),  # 파생 필드: 블록 단위로 나눈 업체 목록
            "retentionPeriod": None,  # 원문 표에 보유기간 컬럼 없음
        }
        for names, task in rows
    ]

    # 2) 국외이전 - 법정 기재사항이 모두 컬럼으로 있다
    _, rows = load_grid("overseas", snapshot_dir, 7)
    overseas = [
        {
            "country": joined(country),
            "countries": [c.strip() for c in joined(country).split(",") if c.strip()],
            "transferredAt": joined(when),
            "recipient": joined(name),
            "contact": joined(contact) or None,
            "purposeAndItems": f"{joined(purpose)} / {joined(items)}",
            "retentionPeriod": joined(period),
            "transferType": "처리위탁",
        }
        for name, contact, purpose, items, country, when, period in rows
    ]

    # 3) 제3자 제공 - 어느 카카오 서비스에서 나가는지가 첫 컬럼(병합 셀)
    _, rows = load_grid("thirdParty", snapshot_dir, 5)
    third_party = [
        {
            "recipient": joined(recipient),
            "purpose": joined(purpose),
            "items": joined(items),
            "retentionPeriod": joined(period),
            "serviceName": joined(service),  # 파생 필드: 제공이 발생하는 카카오 서비스
        }
        for service, recipient, purpose, items, period in rows
    ]

    # 4) 제3자로부터 제공받는 정보 - 카카오로 들어오는 역방향 흐름 (schema 밖 보조 필드)
    _, rows = load_grid("receipt", snapshot_dir, 3)
    receipt = [
        {"provider": joined(provider), "items": joined(items), "purpose": joined(purpose)}
        for provider, items, purpose in rows
    ]

    countries = sorted({c for t in overseas for c in t["countries"]})
    data = {
        "service": {
            "id": "kakao",
            "name": "카카오",
            "policyUrl": POLICY_URL,
            "consignmentSourceUrl": BASE.format(PAGES["consignment"]),
            "overseasSourceUrl": BASE.format(PAGES["overseas"]),
            "thirdPartySourceUrl": BASE.format(PAGES["thirdParty"]),
            "receiptSourceUrl": BASE.format(PAGES["receipt"]),
            "retrievedAt": "2026-09-06",
            "retrievalMethod": "정적 HTML 자동 파싱 (pipeline/extract_kakao.py). 본문이 개요만 싣고 표는 부속 페이지 4개로 나뉘어 있어 페이지별로 표 1개씩 수집.",
            "notes": (
                "자회사 (주)카카오모빌리티의 처리방침(data/services/kakaomobility.json)과는 별개 문서다. "
                "위탁 표에는 보유기간 컬럼이 없어 retentionPeriod는 null이다. "
                "한 칸에 업체가 여러 개 들어가는 경우가 많아 consignees 파생 필드에 목록을 함께 담았다. "
                "thirdPartyReceipt는 카카오페이·카카오엔터테인먼트 등에서 카카오로 들어오는 역방향 "
                "제공 현황으로, schema.json의 세 배열에 해당하지 않아 보조 필드로 남긴 것이다. "
                "serviceName·consignees·countries·transferType도 schema.json 밖의 보조 필드."
            ),
        },
        "consignment": consignment,
        "thirdPartyProvision": third_party,
        "overseasTransfer": overseas,
        "thirdPartyReceipt": receipt,
    }

    for path in (OUTPUT_PATH, PUBLIC_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"saved {OUTPUT_PATH} (+ public copy)\n"
        f"  consignment={len(consignment)}  thirdPartyProvision={len(third_party)}  "
        f"overseasTransfer={len(overseas)}  thirdPartyReceipt(역방향)={len(receipt)}\n"
        f"  이전 국가: {', '.join(countries)}"
    )


if __name__ == "__main__":
    main()
