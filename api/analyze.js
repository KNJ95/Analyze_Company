// api/analyze.js
// 改善B のみ適用：テキストから重要部分を優先抽出してトークン削減
// バッチ化は廃止（レスポンス不安定のため）→ 1社ずつ処理

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY が設定されていません" });

  try {
    const { corpId, text } = req.body;
    if (!corpId || !text) return res.status(400).json({ error: "corpId と text が必要です" });

    // 改善B: 重要部分を優先抽出（送信トークンを削減）
    const extractKey = (t) => {
      const patterns = [
        /求める人物像[\s\S]{0,600}/,
        /募集要項[\s\S]{0,400}/,
        /仕事内容[\s\S]{0,300}/,
        /求める人材[\s\S]{0,300}/,
        /こんな方を求めています[\s\S]{0,300}/,
      ];
      const parts = [];
      for (const p of patterns) {
        const m = t.match(p);
        if (m) parts.push(m[0].trim());
      }
      return parts.length > 0 ? parts.join("\n\n").slice(0, 1200) : t.slice(0, 1200);
    };

    const keyText = extractKey(text);

    const AXES = "1.課題設定力/2.情報活用力/3.不確実性への耐性/4.提案・発信力/5.実行・改善力/6.オーナーシップ/7.協働・調整力/8.自律・内発的動機/9.行動変容力";

    const prompt = `マイナビ2027 corp${corpId} の求人情報です。

${keyText}

Be-Ready評価軸: ${AXES}

以下のJSONのみ返してください（コードブロック不要）:
{"company":"会社名","industry":"業種(IT/コンサル/製造業/医療/金融/商社/小売/建設/その他)","size":"large/medium/small","size_label":"大企業/中堅企業/中小・スタートアップ","job_types":["職種"],"persona":"求める人物像60字以内","traits":["特性1","特性2","特性3"],"scores":{"1":1-5,"2":1-5,"3":1-5,"4":1-5,"5":1-5,"6":1-5,"7":1-5,"8":1-5,"9":1-5},"level":"Lv1/Lv2/Lv3/Lv4","level_reason":"40字以内"}
スコア: 1=求められていない 2=あると良い 3=重要 4=非常に重要 5=最重要`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: "新卒採用の人材要件分析の専門家。JSONのみ返す。コードブロック不要。",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const raw = data.content?.map(c => c.text || "").join("").replace(/```json|```/g, "").trim();
    const result = JSON.parse(raw);
    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
