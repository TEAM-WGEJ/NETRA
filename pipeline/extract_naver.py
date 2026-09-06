"""네이버 개인정보처리방침의 위탁(popup06) · 제3자 제공(popup03) 현황을 파싱해
data/services/naver.json으로 저장한다. (data/schema.json 참고)

두 팝업 페이지(policy.naver.com/popup/03_policy_popup.html, 06_policy_popup.html)는
화면을 JS로 채우기 때문에 HTML을 직접 파싱하지 않고, 그 JS(uns-contents_v2.js)가
호출하는 공개 JSON API(notice.naver.com)를 그대로 사용한다. 로그인/인증이 필요 없는
공개 API이며, 표준 라이브러리만으로 요청한다.
"""
import html
import json
import re
import urllib.request
from pathlib import Path

API_BASE = "https://notice.naver.com/api/v1/services/privacypolicy/contents/key"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "services" / "naver.json"


def fetch(popup_key: str) -> dict:
    req = urllib.request.Request(f"{API_BASE}/{popup_key}", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def strip_html(text: str) -> str:
    if not text:
        return text
    text = re.sub(r"<br\s*/?>", " ", text)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text).strip()


def module_rows(data: dict, index: int) -> list[dict]:
    return data["modules"][index]["componentData"]


def main():
    popup06 = fetch("popup06")  # 개인정보 처리위탁 현황
    popup03 = fetch("popup03")  # 긴급상황 외 개인정보 제공이 발생하는 경우 (제3자 제공)

    consignment = []
    for scope, module_index in (("기본", 3), ("서비스별", 5)):
        for row in module_rows(popup06, module_index):
            consignment.append({
                "task": strip_html(row["purpose"]),
                "consignee": strip_html(row["companies"]),
                "retentionPeriod": None,
                "scope": scope,
            })

    third_party_provision = []
    for row in module_rows(popup03, 3):
        third_party_provision.append({
            "recipient": strip_html(row["companyProvided"]),
            "purpose": strip_html(row["purpose"]),
            "items": strip_html(row["sharedAndProvided"]),
            "retentionPeriod": strip_html(row.get("periodOfUse")),
            "serviceName": strip_html(row.get("serviceName")),
            "legalBasis": strip_html(row.get("legalBasis")),
        })

    overseas_transfer = []
    for row in module_rows(popup06, 8):
        overseas_transfer.append({
            "country": strip_html(row["location"]),
            "transferredAt": strip_html(row["dateAndMethod"]),
            "recipient": strip_html(row["company"]),
            "contact": strip_html(row["contact"]),
            "purposeAndItems": f"{strip_html(row['purpose'])} / {strip_html(row['privacyInfo'])}",
            "retentionPeriod": strip_html(row["periodOfUse"]),
            "serviceName": None,
            "source": "위탁",
        })
    for row in module_rows(popup03, 4):
        overseas_transfer.append({
            "country": strip_html(row["location"]),
            "transferredAt": strip_html(row["dateAndMethod"]),
            "recipient": strip_html(row["company"]),
            "contact": strip_html(row["contact"]),
            "purposeAndItems": f"{strip_html(row['purpose'])} / {strip_html(row['privacyInfo'])}",
            "retentionPeriod": strip_html(row["periodOfUse"]),
            "serviceName": strip_html(row.get("serviceName")),
            "source": "제공",
        })

    data = {
        "service": {
            "id": "naver",
            "name": "네이버 (NAVER)",
            "policyUrl": "https://policy.naver.com/rules/privacy.html",
            "consignmentSourceUrl": f"{API_BASE}/popup06",
            "thirdPartyProvisionSourceUrl": f"{API_BASE}/popup03",
            "retrievalMethod": "공개 JSON API를 직접 호출 (자동화, 봇 탐지/인증 없음)",
            "note": (
                "국외이전 항목 중 '네이버 로그인'/'네이버 인증서'는 특정 업체가 아니라 "
                "연동하는 제휴사마다 국가·연락처가 달라지는 카테고리라서, country/contact 값이 "
                "실제 국가명이 아니라 원문 그대로 '제휴사별로 상이함'으로 들어있음 (지어낸 값 아님)."
            ),
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
