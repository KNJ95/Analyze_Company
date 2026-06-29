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

## 毎回の運用フロー

```
① マイナビで検索 → ブラウザのコンソールでIDを一括コピー
         ↓
② ids.txt に貼り付けて scraper.py を実行（ローカルPC）
         ↓
③ git push → Vercel が自動デプロイ
         ↓
④ アプリで「AI分析する」をクリック → 結果を閲覧
```

---

## Step 1: 企業IDをコピーする（ブラウザのコンソール）

マイナビ2027にログインし、企業一覧ページを開く。
ブラウザの開発者ツール（F12）→「コンソール」に以下を貼り付けて実行：

```javascript
const ids = [...document.querySelectorAll('a[href*="/pc/search/corp"]')]
  .map(a => a.href.match(/corp(\d+)/)?.[1])
  .filter(Boolean);
const unique = [...new Set(ids)];
console.log(unique.join('\n'));
copy(unique.join('\n'));  // クリップボードにコピー
```

コピーされたIDを `ids.txt` に貼り付けて保存。

---

## Step 2: スクレイピング（ローカルPC）

```bash
# 初回のみ：依存ライブラリをインストール
pip install requests beautifulsoup4

# 実行（ids.txt に企業IDが1行1件で入っている状態）
python scraper.py ids.txt
```

→ `public/jobs_raw.json` に追記されます（取得済みのIDはスキップ）。

---

## Step 3: GitHubにコミット

```bash
git add public/jobs_raw.json
git commit -m "求人データ追加: ○件"
git push
```

→ Vercelが自動で再デプロイします（1〜2分）。

---

## Step 4: アプリでAI分析

デプロイされたURLにアクセス →「未分析○件をAI分析する」をクリック。
Claude APIが1件ずつBe-Ready 9軸のスコアを算出し、ブラウザに保存します。

---

## Vercel 初回セットアップ

1. https://vercel.com にアクセス → GitHubでログイン
2. 「Add New Project」→ `Analyze_Company` リポジトリを選択
3. Framework Preset: **Create React App**
4. 「Deploy」をクリック

---

## スクレイピングのマナー

- リクエスト間隔: 2〜4秒（ランダム）
- 一度取得したIDは再取得しない（`jobs_raw.json` に追記方式）
- `robots.txt` の Disallow 対象ページ（一覧・検索）は取得しない

---

## Vercel 環境変数の設定（必須）

Vercel ダッシュボード → プロジェクト → **Settings → Environment Variables** に追加：

| 変数名 | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-xxxxx`（Anthropicのコンソールで取得） |

追加後は **Redeploy** を実行してください。

> APIキーは https://console.anthropic.com/settings/keys で取得できます。
