"""넷플릭스의 한국 이용자 대상 위탁·제3자 제공·국외이전 표를 파싱해
data/services/netflix.json으로 저장한다. (data/schema.json 참고)

원문(https://help.netflix.com/ko/legal/kr-entrustment-and-overseas-transfers)은
로그인/JS 렌더링 없이 정적 <table> 2개로 구성되어 있다.
  표 1 - 개인정보의 제3자 제공 및 해외 이전 (Netflix, Inc. 1건)
  표 2 - 개인정보의 위탁 및 이전 (32건, 이 중 '국내' 3건은 국외이전이 아닌 국내 위탁)

쿠팡과 달리 병합 셀은 없지만 두 가지 처리가 필요하다.
  1. 한 셀 안에 블록 요소가 여러 개 들어있다 (기업명 + '연락처' 링크,
     이전일시 + 이전방법). 블록 경계를 살려 쪼갠 뒤 첫 조각을 본문으로 쓴다.
  2. '정보가 이전되는 국가'가 쉼표로 나열된 복수 국가다. 괄호 안 쉼표
     (예: '아이슬란드(대체 작동 사이트, 기본 저장 사이트에 ...)')는
     구분자가 아니므로 괄호 밖 쉼표에서만 나눈다.
"""
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

SOURCE_URL = "https://help.netflix.com/ko/legal/kr-entrustment-and-overseas-transfers"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "services" / "netflix.json"
PUBLIC_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "netflix.json"

# 셀 안에서 줄바꿈처럼 취급할 블록 요소
BLOCK_TAGS = {"p", "div", "li", "br"}
SEP = "\x00"


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


def cell_text(cell):
    """셀의 모든 블록을 한 문자열로 합친다."""
    return " ".join(cell)


def split_company(cell):
    """'기업명 및 연락처' 셀을 (기업명, 연락처)로 나눈다.

    원문은 기업명 뒤에 '연락처' 링크가 붙어 있고, 일부는 '연락처: 이메일' 형태다.
    링크 URL은 표에 노출되지 않으므로 이메일이 적힌 경우에만 연락처를 남긴다.
    """
    name = cell[0] if cell else ""
    rest = " ".join(cell[1:])
    email = re.search(r"[\w.+-]+@[\w.-]+", rest)
    return name.strip(), (email.group(0) if email else None)


def split_countries(text):
    """괄호 밖 쉼표에서만 나눠 국가 목록을 만든다."""
    out, buf, depth = [], [], 0
    for ch in text:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            out.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    if buf:
        out.append("".join(buf).strip())
    return [c for c in out if c]


def clean(value):
    """원문에서 '-'로 비워둔 칸은 null로 둔다."""
    value = value.strip()
    return None if value in ("", "-") else value


def parse_rows(table):
    """헤더를 뺀 각 행을 컬럼 순서대로 정리한다.

    두 표 모두 컬럼 순서가 같다:
      기업명 및 연락처 / (제공 목적 | 위탁 업무) / 이전 국가 / 이전 항목 /
      보유 및 이용 기간 / 이전 일시 및 방법
    """
    parsed = []
    for row in table[1:]:
        if len(row) < 6:
            raise RuntimeError(f"6개 컬럼을 기대했으나 {len(row)}개인 행 발견: {row}")
        name, contact = split_company(row[0])
        country_text = cell_text(row[2])
        parsed.append(
            {
                "recipient": name,
                "contact": contact,
                "purpose": cell_text(row[1]),
                "countryText": country_text,
                "countries": split_countries(country_text),
                "items": cell_text(row[3]),
                "retentionPeriod": clean(cell_text(row[4])),
                "transferredAt": clean(cell_text(row[5])),
            }
        )
    return parsed


def main():
    # 사용법: python extract_netflix.py [저장해둔 원문 html 경로]
    # 경로를 주면 네트워크 없이 스냅샷 파일로 파싱한다 (수집 시점 고정·재현 용도).
    if len(sys.argv) > 1:
        html = Path(sys.argv[1]).read_text(encoding="utf-8")
    else:
        req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp:
            html = resp.read().decode("utf-8")

    parser = TableParser()
    parser.feed(html)
    if len(parser.tables) != 2:
        raise RuntimeError(
            f"예상한 2개 표 대신 {len(parser.tables)}개가 발견됨 - 페이지 구조가 바뀌었는지 확인 필요"
        )

    provision_rows = parse_rows(parser.tables[0])
    entrustment_rows = parse_rows(parser.tables[1])

    third_party = []
    consignment = []
    overseas = []

    # 표 1 - 제3자 제공이자 국외이전 (Netflix, Inc.). 양쪽에 모두 기록한다.
    for r in provision_rows:
        third_party.append(
            {
                "recipient": r["recipient"],
                "purpose": r["purpose"],
                "items": r["items"],
                "retentionPeriod": r["retentionPeriod"],
            }
        )
        overseas.append(
            {
                "country": r["countryText"],
                "countries": r["countries"],
                "transferredAt": r["transferredAt"],
                "recipient": r["recipient"],
                "contact": r["contact"],
                "purposeAndItems": f"{r['purpose']} / {r['items']}",
                "retentionPeriod": r["retentionPeriod"],
                "transferType": "제3자 제공",
            }
        )

    # 표 2 - 위탁. 이전 국가가 '국내'뿐이면 국외이전이 아니라 국내 위탁이다.
    for r in entrustment_rows:
        if r["countries"] == ["국내"]:
            consignment.append(
                {
                    "task": r["purpose"],
                    "consignee": r["recipient"],
                    "retentionPeriod": r["retentionPeriod"],
                }
            )
            continue
        overseas.append(
            {
                "country": r["countryText"],
                "countries": r["countries"],
                "transferredAt": r["transferredAt"],
                "recipient": r["recipient"],
                "contact": r["contact"],
                "purposeAndItems": f"{r['purpose']} / {r['items']}",
                "retentionPeriod": r["retentionPeriod"],
                "transferType": "처리위탁",
            }
        )

    data = {
        "service": {
            "id": "netflix",
            "name": "넷플릭스",
            "policyUrl": "https://help.netflix.com/ko/legal/privacy",
            "consignmentSourceUrl": SOURCE_URL,
            "retrievedAt": "2026-09-06",
            "retrievalMethod": "정적 HTML 자동 파싱 (pipeline/extract_netflix.py). 한국 이용자 대상 위탁·국외이전 전용 페이지를 사용.",
            "notes": (
                "한 수탁사가 여러 국가로 이전하는 경우가 많아 country는 원문 문자열 그대로 두고 "
                "countries에 괄호 밖 쉼표 기준으로 나눈 목록을 함께 담았다(파생 필드). "
                "국내 위탁 3건(INICIS·KCP·UBASE)은 원문이 항목·보유기간을 '-'로 비워두어 null이다. "
                "transferType은 schema.json 밖의 보조 필드."
            ),
        },
        "consignment": consignment,
        "thirdPartyProvision": third_party,
        "overseasTransfer": overseas,
    }

    for path in (OUTPUT_PATH, PUBLIC_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    countries = sorted({c for t in overseas for c in t["countries"]})
    print(
        f"saved {OUTPUT_PATH} (+ public copy)\n"
        f"  consignment={len(consignment)}  "
        f"thirdPartyProvision={len(third_party)}  "
        f"overseasTransfer={len(overseas)}\n"
        f"  국가 {len(countries)}개: {', '.join(countries)}"
    )


if __name__ == "__main__":
    main()
