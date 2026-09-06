"""카카오모빌리티 개인정보 처리방침의 위탁·제3자 제공·국외이전 현황 표를 파싱해
data/services/kakaomobility.json으로 저장한다. (data/schema.json 참고)

원문 페이지가 로그인/JS 렌더링 없이 정적 <table class="tbl_agree"> 3개로
구성되어 있음을 확인했으므로, 외부 라이브러리 없이 표준 라이브러리만으로 파싱한다.
"""
import json
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

SOURCE_URL = "https://policy.kakaomobility.com/ko/privacy_200702/3rd_party.html"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "services" / "kakaomobility.json"


class TableParser(HTMLParser):
    """<table class="tbl_agree"> 안의 행(tr)들을 (태그, 텍스트) 목록으로 수집한다."""

    def __init__(self):
        super().__init__()
        self.tables: list[list[list[tuple[str, str]]]] = []
        self._in_table = False
        self._in_cell = False
        self._cell_tag = None
        self._row: list[tuple[str, str]] = []
        self._cell_text: list[str] = []
        self._table_rows: list[list[tuple[str, str]]] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "table" and attrs.get("class") == "tbl_agree":
            self._in_table = True
            self._table_rows = []
        elif self._in_table and tag == "tr":
            self._row = []
        elif self._in_table and tag in ("th", "td"):
            self._in_cell = True
            self._cell_tag = tag
            self._cell_text = []

    def handle_endtag(self, tag):
        if self._in_table and tag in ("th", "td") and self._in_cell:
            text = re.sub(r"\s+", " ", "".join(self._cell_text)).strip()
            self._row.append((self._cell_tag, text))
            self._in_cell = False
        elif self._in_table and tag == "tr":
            if self._row:
                self._table_rows.append(self._row)
        elif tag == "table" and self._in_table:
            self.tables.append(self._table_rows)
            self._in_table = False

    def handle_data(self, data):
        if self._in_cell:
            self._cell_text.append(data)


def rows_to_dicts(table_rows, keys):
    header, *body = table_rows
    return [dict(zip(keys, [text for _, text in row])) for row in body]


def main():
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode("utf-8")

    parser = TableParser()
    parser.feed(html)
    if len(parser.tables) != 3:
        raise RuntimeError(
            f"예상한 3개 표 대신 {len(parser.tables)}개가 발견됨 - 페이지 구조가 바뀌었는지 확인 필요"
        )

    consignment = rows_to_dicts(parser.tables[0], ["task", "consignee", "retentionPeriod"])
    third_party_provision = rows_to_dicts(
        parser.tables[1], ["recipient", "purpose", "items", "retentionPeriod"]
    )
    overseas_transfer = rows_to_dicts(
        parser.tables[2],
        ["country", "transferredAt", "recipient", "contact", "purposeAndItems", "retentionPeriod"],
    )

    data = {
        "service": {
            "id": "kakaomobility",
            "name": "카카오모빌리티",
            "policyUrl": SOURCE_URL,
        },
        "consignment": consignment,
        "thirdPartyProvision": third_party_provision,
        "overseasTransfer": overseas_transfer,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"saved {OUTPUT_PATH}\n"
        f"  consignment={len(consignment)}  "
        f"thirdPartyProvision={len(third_party_provision)}  "
        f"overseasTransfer={len(overseas_transfer)}"
    )


if __name__ == "__main__":
    main()
