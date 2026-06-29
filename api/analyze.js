// api/analyze.js  ── バッチ対応版（A+B改善）
// 改善A: 1回のAPIで最大5社をまとめて分析
// 改善B: 求人テキストから「求める人物像」部分を優先抽出して送信量を削減

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY が設定されていません" });

  try {
    // jobs: [{ corpId, text }, ...]  ← 複数社を受け取る
    const { jobs } = req.body;
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: "jobs 配列が必要です" });
    }

    const AXES = "1.課題設定力/2.情報活用力/3.不確実性への耐性/4.提案・発信力/5.実行・改善力/6.オーナーシップ/7.協働・調整力/8.自律・内発的動機/9.行動変容力";
    const SCHEMA = `{"company":"会社名","industry":"業種(IT/コンサル/製造業/医療/金融/商社/小売/建設/その他)","size":"large/medium/small","size_label":"大企業/中堅企業/中小・スタートアップ","job_types":["職種"],"persona":"求める人物像60字以内","traits":["特性1","特性2","特性3"],"scores":{"1":1-5,"2":1-5,"3":1-5,"4":1-5,"5":1-5,"6":1-5,"7":1-5,"8":1-5,"9":1-5},"level":"Lv1/Lv2/Lv3/Lv4","level_reason":"40字以内"}`;

    // 改善B: テキストから重要部分を優先抽出（送信トークンを削減）
    const extractKey = (text) => {
      if (!text) return "";
      const patterns = [
        /求める人物像[\s\S]{0,800}/,
        /募集要項[\s\S]{0,600}/,
        /仕事内容[\s\S]{0,400}/,
        /求める人材[\s\S]{0,400}/,
        /こんな方を求めています[\s\S]{0,400}/,
      ];
      const parts = [];
      for (const p of patterns) {
        const m = text.match(p);
        if (m) parts.push(m[0].trim());
      }
      // 抽出できた場合はそれを使用、なければ先頭1000文字
      return parts.length > 0 ? parts.join("\n\n").slice(0, 1500) : text.slice(0, 1000);
    };

    // 改善A: 複数社を1プロンプトにまとめる
    const companiesBlock = jobs.map(j => (
      `### corp${j.corpId}\n${extractKey(j.text)}`
    )).join("\n\n---\n\n");

    const prompt = `以下の${jobs.length}社の求人情報を分析してください。

${companiesBlock}

Be-Ready評価軸: ${AXES}
スコア: 1=求められていない 2=あると良い 3=重要 4=非常に重要 5=最重要

各社について上記スキーマのJSONを生成し、以下の形式で返してください（コードブロック不要）:
{"results":[
  {"corpId":"ID1", ${SCHEMA.slice(1)},
  {"corpId":"ID2", ${SCHEMA.slice(1)}
]}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",  // 高速・低コストモデルに変更
        max_tokens: 400 * jobs.length,        // 社数に応じてトークン調整
        system: "新卒採用の人材要件分析の専門家。指定されたJSON形式のみ返す。コードブロック不要。",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const raw = data.content?.map(c => c.text || "").join("").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);

    // results配列をcorpIdをキーにしたオブジェクトに変換して返す
    const resultMap = {};
    for (const r of (parsed.results || [])) {
      const { corpId, ...rest } = r;
      resultMap[corpId] = rest;
    }
    return res.status(200).json({ results: resultMap });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
