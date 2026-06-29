import { useState, useEffect } from "react";

const AXES = [
  { id:1, name:"課題設定力",       short:"課題"   },
  { id:2, name:"情報活用力",       short:"情報"   },
  { id:3, name:"不確実性への耐性", short:"不確実"  },
  { id:4, name:"提案・発信力",     short:"提案"   },
  { id:5, name:"実行・改善力",     short:"実行"   },
  { id:6, name:"オーナーシップ",   short:"所有"   },
  { id:7, name:"協働・調整力",     short:"協働"   },
  { id:8, name:"自律・内発的動機", short:"動機"   },
  { id:9, name:"行動変容力",       short:"変容"   },
];

const SCORE_BG = {5:"#460073",4:"#7500C0",3:"#A100FF",2:"#D4AAFF",1:"#E8E8E8",0:"#1a1825"};
const SCORE_FG = {5:"#fff",4:"#fff",3:"#fff",2:"#2d0060",1:"#666",0:"#3a3650"};
const LEVEL_C  = {Lv4:"#460073",Lv3:"#7500C0",Lv2:"#A100FF",Lv1:"#777"};
const C = {
  bg:"#0d0b18",surface:"#13111f",surface2:"#1c1a2e",border:"#2a2740",
  primary:"#A100FF",primaryDark:"#460073",text:"#f0ecff",sub:"#9b97bc",
  muted:"#4a4768",success:"#00d48a",error:"#ff5f5f",warn:"#ffb800",
};

// ── ストレージ ────────────────────────────────────────────────────────────────
const store = {
  async all() {
    try {
      const keys = await window.storage.list("mjob:");
      const out = [];
      for (const k of keys?.keys ?? []) {
        try { const r = await window.storage.get(k); if(r?.value) out.push(JSON.parse(r.value)); } catch {}
      }
      return out.sort((a,b) => b.savedAt - a.savedAt);
    } catch { return []; }
  },
  async save(j)  { try { await window.storage.set(`mjob:${j.id}`, JSON.stringify(j)); } catch {} },
  async del(id)  { try { await window.storage.delete(`mjob:${id}`); } catch {} },
};

// ── AI分析 ────────────────────────────────────────────────────────────────────
async function analyzeWithClaude(corpId, text) {
  // Vercel API Route 経由（CORS回避）
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ corpId, text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}
