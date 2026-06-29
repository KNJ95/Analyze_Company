"""
scraper.py
マイナビ2027の企業ページをローカルPCから取得し、
public/jobs_raw.json に保存するスクリプト。

使い方:
  python scraper.py ids.txt          # ids.txt に1行1IDで記載
  python scraper.py 52494 50857 ...  # コマンドライン引数でも可

依存ライブラリ:
  pip install requests beautifulsoup4
"""

import sys, json, time, re, pathlib, random
import requests
from bs4 import BeautifulSoup

# ── 設定 ──────────────────────────────────────────────────────────────────────
BASE_URL   = "https://job.mynavi.jp/27/pc/search/corp{id}/{page}.html"
OUTPUT     = pathlib.Path(__file__).parent / "public" / "jobs_raw.json"
INTERVAL   = (2.0, 4.0)   # リクエスト間隔（秒）のランダム範囲
TIMEOUT    = 15
HEADERS    = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ja,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def fetch(url: str) -> str | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        if r.status_code == 200:
            return r.text
        print(f"  HTTP {r.status_code}: {url}")
    except Exception as e:
        print(f"  エラー: {e}")
    return None

def extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "iframe", "noscript"]):
        tag.decompose()
    main = soup.find("main") or soup.find(id="wrapper") or soup.body
    text = (main or soup).get_text(separator="\n")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:6000]

def extract_company_data(html: str) -> dict:
    """会社概要HTMLから売上高・従業員数を抽出する"""
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(separator="\n")

    data = {"sales": "", "employees": ""}

    # 売上高（例: 1兆6290億円、500億円、12,345百万円）
    m = re.search(
        r"売上(?:高|額)[^\n]*\n([^\n]{1,40}(?:億|兆|万|百万|千万)[^\n]{0,30})",
        text
    )
    if m:
        data["sales"] = m.group(1).strip()

    # 従業員数（例: 25,676名、1,200人）
    m = re.search(
        r"従業員[^\n]*\n([^\n]{1,40}(?:名|人)[^\n]{0,30})",
        text
    )
    if m:
        data["employees"] = m.group(1).strip()

    return data

def scrape_corp(corp_id: str) -> dict:
    result = {
        "corpId": corp_id,
        "outlineText": "",
        "employmentText": "",
        "sales": "",
        "employees": "",
        "error": None,
    }
    # ① 会社概要
    url_outline = BASE_URL.format(id=corp_id, page="outline")
    html = fetch(url_outline)
    if html:
        result["outlineText"] = extract_text(html)
        # 売上・従業員を抽出
        company_data = extract_company_data(html)
        result["sales"]     = company_data["sales"]
        result["employees"] = company_data["employees"]
    else:
        result["error"] = "outline取得失敗"
        return result

    # ② 採用データ（少し待つ）
    time.sleep(random.uniform(1.0, 2.0))
    url_emp = BASE_URL.format(id=corp_id, page="employment")
    html2 = fetch(url_emp)
    if html2:
        result["employmentText"] = extract_text(html2)

    return result

def parse_ids(args: list[str]) -> list[str]:
    ids = []
    for arg in args:
        p = pathlib.Path(arg)
        if p.exists():
            lines = p.read_text(encoding="utf-8").splitlines()
        else:
            lines = [arg]
        for line in lines:
            # URLからIDを抽出、または数字だけ
            m = re.search(r"corp(\d{4,6})", line)
            if m:
                ids.append(m.group(1))
            elif re.fullmatch(r"\d{4,6}", line.strip()):
                ids.append(line.strip())
    return list(dict.fromkeys(ids))  # 重複除去・順序保持

def main():
    if len(sys.argv) < 2:
        print("使い方: python scraper.py ids.txt  または  python scraper.py 52494 50857 ...")
        sys.exit(1)

    ids = parse_ids(sys.argv[1:])
    if not ids:
        print("有効なIDが見つかりませんでした")
        sys.exit(1)

    print(f"対象: {len(ids)}件")

    # 既存データを読み込み（追記モード）
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    existing = {}
    if OUTPUT.exists():
        try:
            existing = {j["corpId"]: j for j in json.loads(OUTPUT.read_text(encoding="utf-8"))}
            print(f"既存データ: {len(existing)}件")
        except Exception:
            pass

    results = dict(existing)
    errors = []

    for i, corp_id in enumerate(ids):
        if corp_id in results:
            print(f"[{i+1}/{len(ids)}] corp{corp_id} → スキップ（取得済み）")
            continue

        print(f"[{i+1}/{len(ids)}] corp{corp_id} 取得中...")
        data = scrape_corp(corp_id)

        if data["error"]:
            print(f"  ✗ {data['error']}")
            errors.append(corp_id)
        else:
            text_len = len(data["outlineText"]) + len(data["employmentText"])
            print(f"  ✓ {text_len}文字取得")
            results[corp_id] = data

        # 保存（途中でも保存しておく）
        OUTPUT.write_text(
            json.dumps(list(results.values()), ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

        # 待機（最後の1件は不要）
        if i < len(ids) - 1:
            wait = random.uniform(*INTERVAL)
            time.sleep(wait)

    print(f"\n完了: 成功 {len(results) - len(existing)}件 / エラー {len(errors)}件")
    print(f"出力: {OUTPUT}")
    if errors:
        print(f"エラーID: {', '.join(errors)}")

if __name__ == "__main__":
    main()
