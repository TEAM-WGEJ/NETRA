"""쿠팡 개인정보 처리방침의 제3자 제공·위탁·국외이전 현황 표를 파싱해
data/services/coupang.json으로 저장한다. (data/schema.json 참고)

원문(https://privacy.coupang.com/ko/center/coupang)이 로그인/JS 렌더링 없이
정적 HTML 한 문서에 모든 표를 담고 있음을 확인했으므로 표준 라이브러리만으로 파싱한다.

카카오모빌리티와 달리 쿠팡 표는 셀 병합(rowspan/colspan)이 많아
표를 그리드로 전개(병합 셀 값을 아래 행으로 복사)한 뒤 dict로 변환한다.

표 선택은 인덱스가 아니라 섹션 제목 기준이다:
  - 개인정보 제3자제공 현황(국내)  -> 표 2개 (가: 동의 없이 / 나: 동의 받아)
  - 개인정보 제3자 제공 현황(국외) -> 표 1개
  - 개인정보 처리업무 위탁 현황(국내) -> 표 1개
  - 개인정보 처리업무 위탁 현황(국외) -> 표 1개 (국외이전에 해당)
"""
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

SOURCE_URL = "https://privacy.coupang.com/ko/center/coupang"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "services" / "coupang.json"
PUBLIC_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "coupang.json"


class DocParser(HTMLParser):
    """문서 내 등장 순서대로 제목(h1~h6)과 표를 수집한다.

    표의 각 셀은 (텍스트, rowspan, colspan)으로 저장한다.
    """

    def __init__(self):
        super().__init__()
        self.items: list[tuple[str, object]] = []  # ("heading", text) | ("table", rows)
        self._in_heading = False
        self._heading_text: list[str] = []
        self._in_table = False
        self._in_cell = False
        self._cell_text: list[str] = []
        self._cell_span = (1, 1)
        self._row: list[tuple[str, int, int]] = []
        self._rows: list[list[tuple[str, int, int]]] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if re.fullmatch(r"h[1-6]", tag):
            self._in_heading = True
            self._heading_text = []
        elif tag == "table":
            self._in_table = True
            self._rows = []
        elif self._in_table and tag == "tr":
            self._row = []
        elif self._in_table and tag in ("th", "td"):
            self._in_cell = True
            self._cell_text = []
            self._cell_span = (
                int(attrs.get("rowspan") or 1),
                int(attrs.get("colspan") or 1),
            )
        elif self._in_cell and tag == "br":
            self._cell_text.append(" ")

    def handle_endtag(self, tag):
        if re.fullmatch(r"h[1-6]", tag) and self._in_heading:
            text = re.sub(r"\s+", " ", "".join(self._heading_text)).strip()
            if text:
                self.items.append(("heading", text))
            self._in_heading = False
        elif self._in_table and tag in ("th", "td") and self._in_cell:
            text = re.sub(r"\s+", " ", "".join(self._cell_text)).strip()
            self._row.append((text, *self._cell_span))
            self._in_cell = False
        elif self._in_table and tag == "tr":
            if self._row:
                self._rows.append(self._row)
        elif tag == "table" and self._in_table:
            self.items.append(("table", self._rows))
            self._in_table = False

    def handle_data(self, data):
        if self._in_cell:
            self._cell_text.append(data)
        elif self._in_heading:
            self._heading_text.append(data)


def expand_grid(rows):
    """rowspan/colspan을 전개해 모든 행이 같은 열 수를 갖는 2차원 텍스트 그리드로 만든다."""
    grid: list[list[str | None]] = []
    pending: dict[tuple[int, int], tuple[str, int]] = {}  # (row, col) -> (text, 남은 행 수)

    for r, row in enumerate(rows):
        out: list[str | None] = []
        col = 0
        cells = iter(row)
        while True:
            # 위 행에서 rowspan으로 내려온 셀 먼저 채움
            while (r, col) in pending:
                text, remain = pending.pop((r, col))
                out.append(text)
                if remain > 1:
                    pending[(r + 1, col)] = (text, remain - 1)
                col += 1
            cell = next(cells, None)
            if cell is None:
                # 남은 pending 이 이 행 뒤쪽에 있을 수 있음
                while (r, col) in pending:
                    text, remain = pending.pop((r, col))
                    out.append(text)
                    if remain > 1:
                        pending[(r + 1, col)] = (text, remain - 1)
                    col += 1
                break
            text, rowspan, colspan = cell
            for _ in range(colspan):
                out.append(text)
                if rowspan > 1:
                    pending[(r + 1, col)] = (text, rowspan - 1)
                col += 1
        grid.append(out)
    return grid


def rows_to_dicts(grid, keys):
    body = grid[1:]  # 첫 행은 헤더
    out = []
    for row in body:
        row = list(row) + [""] * (len(keys) - len(row))
        out.append(dict(zip(keys, row)))
    return out


def tables_after_heading(items, heading_substr, count):
    """제목(공백 제거 후 부분 일치) 바로 다음에 나오는 표 count개를 반환한다."""
    want = heading_substr.replace(" ", "")
    found = []
    seen_heading = False
    for kind, payload in items:
        if kind == "heading":
            norm = payload.replace(" ", "")
            if want in norm:
                seen_heading = True
                continue
            # 다른 '현황' 급 섹션 제목을 만나면 수집 종료 (가./나. 소제목은 계속)
            if seen_heading and ("현황" in norm or re.match(r"\d+\.", norm)):
                break
        elif kind == "table" and seen_heading:
            found.append(payload)
            if len(found) == count:
                break
    if len(found) != count:
        raise RuntimeError(
            f"'{heading_substr}' 아래에서 표 {count}개를 기대했으나 {len(found)}개 발견 - 페이지 구조 변경 여부 확인 필요"
        )
    return found


def main():
    # 사용법: python extract_coupang.py [저장해둔 원문 html 경로]
    # 경로를 주면 네트워크 없이 스냅샷 파일로 파싱한다 (수집 시점 고정·재현 용도).
    if len(sys.argv) > 1:
        html = Path(sys.argv[1]).read_text(encoding="utf-8")
    else:
        req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp:
            html = resp.read().decode("utf-8")

    parser = DocParser()
    parser.feed(html)
    items = parser.items

    # 1) 제3자 제공(국내): 가(동의 없이 - 법령 근거) / 나(동의 받아) 표 2개
    domestic_no_consent, domestic_consent = tables_after_heading(items, "제3자제공 현황(국내)", 2)
    third_party = []
    for grid_rows, basis_note in (
        (domestic_no_consent, "동의 없이 처리(법령 근거)"),
        (domestic_consent, "정보주체 동의"),
    ):
        grid = expand_grid(grid_rows)
        for rec in rows_to_dicts(grid, ["legalBasis", "recipient", "purpose", "items", "retentionPeriod"]):
            rec["consentBasis"] = basis_note
            third_party.append(rec)

    # 2) 제3자 제공(국외): 표 1개 - 국외이전(제공)으로 분류
    (overseas_provision,) = tables_after_heading(items, "제3자 제공 현황(국외)", 1)
    overseas = []
    grid = expand_grid(overseas_provision)
    for rec in rows_to_dicts(
        grid, ["legalBasis", "recipient", "country", "transferredAt", "items", "purpose", "retentionPeriod"]
    ):
        overseas.append(
            {
                "country": rec["country"],
                "transferredAt": rec["transferredAt"],
                "recipient": rec["recipient"],
                "contact": None,
                "purposeAndItems": f"{rec['purpose']} / {rec['items']}",
                "retentionPeriod": rec["retentionPeriod"],
                "legalBasis": rec["legalBasis"],
                "transferType": "제3자 제공",
            }
        )

    # 3) 위탁(국내): 표 1개 - [수탁자, 업무 목적] 2열. 보유기간은 원문에 없으므로 null
    (domestic_consignment,) = tables_after_heading(items, "위탁 현황(국내)", 1)
    grid = expand_grid(domestic_consignment)
    consignment = [
        {"task": rec["task"], "consignee": rec["consignee"], "retentionPeriod": None}
        for rec in rows_to_dicts(grid, ["consignee", "task"])
    ]

    # 4) 위탁(국외): 표 1개 - 국외이전(처리위탁)으로 분류
    (overseas_consignment,) = tables_after_heading(items, "위탁 현황(국외)", 1)
    grid = expand_grid(overseas_consignment)
    for rec in rows_to_dicts(
        grid, ["legalBasis", "recipient", "country", "transferredAt", "items", "purpose", "retentionPeriod"]
    ):
        overseas.append(
            {
                "country": rec["country"],
                "transferredAt": rec["transferredAt"],
                "recipient": rec["recipient"],
                "contact": None,  # 원문은 '수탁자(정보관리책임자 연락처)' 각주(*)로 안내 - 개별 연락처 미기재
                "purposeAndItems": f"{rec['purpose']} / {rec['items']}",
                "retentionPeriod": rec["retentionPeriod"],
                "legalBasis": rec["legalBasis"],
                "transferType": "처리위탁",
            }
        )

    data = {
        "service": {
            "id": "coupang",
            "name": "쿠팡",
            "policyUrl": SOURCE_URL,
            "retrievedAt": "2026-09-06",
            "retrievalMethod": "정적 HTML 자동 파싱 (pipeline/extract_coupang.py). 표 선택은 섹션 제목 기준, 병합 셀(rowspan/colspan)은 그리드 전개로 복원.",
            "notes": "국내 제3자 제공 일부 행의 '제공받는 자'는 '업체리스트' 외부 링크로만 공개되어 개별 업체명이 본문에 없음. legalBasis/consentBasis/transferType은 schema.json 밖의 보조 필드.",
        },
        "consignment": consignment,
        "thirdPartyProvision": third_party,
        "overseasTransfer": overseas,
    }

    for path in (OUTPUT_PATH, PUBLIC_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"saved {OUTPUT_PATH} (+ public copy)\n"
        f"  consignment={len(consignment)}  "
        f"thirdPartyProvision={len(third_party)}  "
        f"overseasTransfer={len(overseas)}"
    )


if __name__ == "__main__":
    main()
