# Be-Ready 求人分析ツール

マイナビ2027の企業ページをスクレイピングし、Be-Ready 9評価軸でAI分析するツール。

---

## 構成

```
be-ready-job-analyzer/
├── scraper.py          # ① ローカルで実行するスクレイパー
├── public/
│   ├── index.html
│   └── jobs_raw.json   # ② scraperが生成する生データ（Gitにコミット）
├── src/
│   ├── index.js
│   └── App.jsx         # ③ Vercelにデプロイするアプリ
└── package.json
```

---

## 手順

### Step 1: スクレイピング（ローカルPC）

```bash
# 依存ライブラリをインストール
pip install requests beautifulsoup4

# IDリストを用意（1行1ID または マイナビURL）
# ids.txt の例:
# 52494
# 50857
# https://job.mynavi.jp/27/pc/search/corp66479/outline.html

# 実行
python scraper.py ids.txt

# または直接IDを指定
python scraper.py 52494 50857 66479
```

→ `public/jobs_raw.json` に結果が保存されます。

---

### Step 2: GitHub にコミット

```bash
git add public/jobs_raw.json
git commit -m "求人データ追加: ○件"
git push
```

---

### Step 3: Vercel でデプロイ（初回のみ）

1. https://vercel.com にアクセス → GitHubでログイン
2. 「Add New Project」→ このリポジトリを選択
3. Framework Preset: **Create React App**
4. 「Deploy」をクリック

以後は `git push` するたびに自動でVercelが再デプロイします。

---

### Step 4: アプリでAI分析

デプロイされたURLにアクセス →「未分析○件をAI分析する」をクリック

---

## スクレイピングのマナー

- リクエスト間隔: 2〜4秒（ランダム）
- 一度取得したIDは再取得しない（`public/jobs_raw.json` に追記）
- `robots.txt` の Disallow 対象ページは取得しない
