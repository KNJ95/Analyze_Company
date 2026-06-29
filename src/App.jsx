// version 2024-06-09
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

async function analyzeWithClaude(corpId, text) {
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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const avgScore = scores => {
  if (!scores) return "—";
  const v = Object.values(scores).filter(x => x > 0);
  return v.length ? (v.reduce((a,b) => a+b, 0) / v.length).toFixed(1) : "—";
};

export default function App() {
  const [jobs,       setJobs]       = useState([]);
  const [raw,        setRaw]        = useState([]);
  const [loadErr,    setLoadErr]    = useState(null);
  const [queue,      setQueue]      = useState([]);
  const [processing, setProcessing] = useState(false);
  const [logs,       setLogs]       = useState([]);
  const [tab,        setTab]        = useState("analyze");
  const [filterInd,  setFilterInd]  = useState("all");
  const [filterLv,   setFilterLv]   = useState("all");

  const addLog = (msg, type="info") =>
    setLogs(p => [{msg, type, time:new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}, ...p].slice(0,150));

  useEffect(() => {
    store.all().then(saved => {
      if (saved.length) { setJobs(saved); addLog(`💾 保存済み分析 ${saved.length}件`); }
    });
    fetch("/jobs_raw.json")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { setRaw(data); addLog(`📄 jobs_raw.json から ${data.length}件 読み込みました`); })
      .catch(e => { setLoadErr(e.message); addLog(`jobs_raw.json が見つかりません — scraper.py を実行してください`, "error"); });
  }, []);

  useEffect(() => {
    if (processing || queue.length === 0) return;
    (async () => {
      const [item, ...rest] = queue;
      setQueue(rest);
      setProcessing(true);
      const id = `${item.corpId}_${Date.now()}`;
      setJobs(p => [{id, corpId:item.corpId, company:"", industry:"", status:"analyzing", result:null, savedAt:Date.now()}, ...p]);
      addLog(`🤖 分析中: corp${item.corpId}（残り ${rest.length}件）`);
      try {
        const text = (item.outlineText||"") + "\n\n" + (item.employmentText||"");
        const result = await analyzeWithClaude(item.corpId, text);
        const done = {id, corpId:item.corpId, company:result.company||"", industry:result.industry||"", status:"done", result, savedAt:Date.now()};
        setJobs(p => p.map(j => j.id===id ? done : j));
        await store.save(done);
        addLog(`✅ ${result.company} ／ ${result.industry} ／ ${result.level}`, "success");
      } catch(e) {
        setJobs(p => p.map(j => j.id===id ? {...j, status:"error", error:e.message} : j));
        addLog(`✗ corp${item.corpId}: ${e.message}`, "error");
      }
      if (rest.length > 0) await sleep(300);
      setProcessing(false);
    })();
  }, [queue, processing]);

  const doneJobs   = jobs.filter(j => j.status==="done" && j.result);
  const errorJobs  = jobs.filter(j => j.status==="error");
  const doneIds    = new Set(jobs.map(j => j.corpId));
  const pendingRaw = raw.filter(r => !doneIds.has(r.corpId) && !r.error);
  const industries = [...new Set(doneJobs.map(j => j.industry).filter(Boolean))];
  const filtered   = doneJobs.filter(j => {
    if (filterInd !== "all" && j.industry !== filterInd) return false;
    if (filterLv  !== "all" && j.result?.level !== filterLv) return false;
    return true;
  });

  const enqueueAll = () => {
    if (!pendingRaw.length) return;
    setQueue(p => [...p, ...pendingRaw]);
    addLog(`📋 ${pendingRaw.length}件 をAI分析キューに追加`);
  };
  const retryErrors = () => {
    const errIds = new Set(errorJobs.map(j => j.corpId));
    const toRetry = raw.filter(r => errIds.has(r.corpId));
    if (!toRetry.length) return;
    setJobs(p => p.map(j => j.status==="error" ? {...j, status:"analyzing"} : j));
    setQueue(p => [...p, ...toRetry]);
    addLog(`🔄 エラー ${toRetry.length}件 を再キュー`);
  };
  const removeJob = async id => { setJobs(p => p.filter(j => j.id!==id)); await store.del(id); };

  const summary = {};
  doneJobs.forEach(j => {
    const k = j.industry||"不明";
    if (!summary[k]) summary[k] = {count:0, sums:{}, cnts:{}};
    summary[k].count++;
    AXES.forEach(a => {
      const s = j.result?.scores?.[String(a.id)]||0;
      if (s>0) { summary[k].sums[a.id]=(summary[k].sums[a.id]||0)+s; summary[k].cnts[a.id]=(summary[k].cnts[a.id]||0)+1; }
    });
  });
  const axisAvg = (ind,aid) => { const s=summary[ind]?.sums[aid],c=summary[ind]?.cnts[aid]; return s&&c?(s/c).toFixed(1):"—"; };

  const sty = {
    header: {background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20},
    tabBtn: a => ({cursor:"pointer",padding:"6px 16px",borderRadius:8,border:`1px solid ${a?C.primary:C.border}`,background:a?`${C.primary}22`:"transparent",color:a?C.primary:C.sub,fontSize:13,fontWeight:a?600:400}),
    card:   {background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px",marginBottom:10},
    input:  {width:"100%",padding:"9px 13px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface2,color:C.text,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
    btn:    {cursor:"pointer",padding:"9px 20px",borderRadius:9,border:"none",background:`linear-gradient(135deg,${C.primary},${C.primaryDark})`,color:"#fff",fontSize:13,fontWeight:600},
    btnSm:  {cursor:"pointer",padding:"5px 12px",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.sub,fontSize:12},
    th:     {background:C.primaryDark,color:"#fff",padding:"8px 10px",textAlign:"left",fontSize:12,fontWeight:600,whiteSpace:"nowrap",borderBottom:`1px solid ${C.border}`},
    td:     i => ({padding:"7px 10px",fontSize:12,borderBottom:`1px solid ${C.border}`,background:i%2===0?C.surface:C.surface2}),
    badge:  lv => ({background:LEVEL_C[lv]||"#444",color:"#fff",padding:"2px 9px",borderRadius:99,fontSize:11,fontWeight:700}),
  };

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:C.bg,minHeight:"100vh",color:C.text}}>
      <div style={sty.header}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:15,fontWeight:700,color:C.primary}}>⚡ Be-Ready 求人分析</span>
          {queue.length>0 && <span style={{background:`${C.warn}22`,color:C.warn,border:`1px solid ${C.warn}44`,padding:"2px 10px",borderRadius:99,fontSize:11}}>分析中 {queue.length}件残</span>}
          {processing    && <span style={{background:`${C.primary}22`,color:C.primary,border:`1px solid ${C.primary}44`,padding:"2px 10px",borderRadius:99,fontSize:11}}>⏳ AI分析中</span>}
        </div>
        <div style={{display:"flex",gap:6}}>
          {[["analyze","分析"],["list",`一覧(${doneJobs.length})`],["summary","業種別集計"]].map(([v,l]) => (
            <button key={v} style={sty.tabBtn(tab===v)} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"20px",maxWidth:1100,margin:"0 auto"}}>

        {tab==="analyze" && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:16}}>
            <div>
              {loadErr ? (
                <div style={{...sty.card,borderColor:`${C.error}55`}}>
                  <p style={{fontWeight:700,color:C.error,marginBottom:8}}>⚠ jobs_raw.json が見つかりません</p>
                  <p style={{fontSize:13,color:C.sub,lineHeight:1.8}}>
                    <code style={{background:C.surface2,padding:"1px 6px",borderRadius:4,color:C.primary}}>scraper.py</code> をローカルで実行後、
                    <code style={{background:C.surface2,padding:"1px 6px",borderRadius:4,color:C.primary}}>public/jobs_raw.json</code> をgit pushしてください。
                  </p>
                </div>
              ) : (
                <div style={{...sty.card,borderColor:`${C.success}44`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div>
                      <span style={{fontWeight:700,color:C.text}}>📄 jobs_raw.json </span>
                      <span style={{fontSize:13,color:C.sub}}>— {raw.length}件読み込み済み</span>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      {errorJobs.length>0 && <button style={sty.btnSm} onClick={retryErrors}>エラー{errorJobs.length}件を再試行</button>}
                      <button style={sty.btn} onClick={enqueueAll} disabled={!pendingRaw.length}>
                        {pendingRaw.length>0 ? `未分析 ${pendingRaw.length}件 をAI分析する` : "すべて分析済み ✓"}
                      </button>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:16,fontSize:12,color:C.sub}}>
                    <span>取得済み: <strong style={{color:C.text}}>{raw.length}</strong>件</span>
                    <span>分析済み: <strong style={{color:C.success}}>{doneJobs.length}</strong>件</span>
                    <span>未分析: <strong style={{color:C.warn}}>{pendingRaw.length}</strong>件</span>
                    {errorJobs.length>0 && <span>エラー: <strong style={{color:C.error}}>{errorJobs.length}</strong>件</span>}
                  </div>
                </div>
              )}

              {jobs.filter(j=>j.status==="analyzing").map(j => (
                <div key={j.id} style={{...sty.card,borderColor:`${C.primary}44`,padding:"10px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:18}}>🤖</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>corp{j.corpId}{j.company?` — ${j.company}`:""}</div>
                      <div style={{fontSize:11,color:C.sub}}>Claude で分析中…</div>
                    </div>
                  </div>
                </div>
              ))}

              {errorJobs.length>0 && (
                <div style={{...sty.card,borderColor:`${C.error}44`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:600,color:C.error}}>✗ エラー {errorJobs.length}件</span>
                    <button style={sty.btnSm} onClick={retryErrors}>全て再試行</button>
                  </div>
                  {errorJobs.map(j => (
                    <div key={j.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.sub,padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span>corp{j.corpId} — {j.error}</span>
                      <button style={sty.btnSm} onClick={()=>removeJob(j.id)}>削除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{...sty.card,position:"sticky",top:60}}>
                <span style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",display:"block",marginBottom:10}}>ログ</span>
                <div style={{maxHeight:500,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                  {logs.length===0 && <p style={{fontSize:12,color:C.muted}}>「AI分析する」をクリックして開始</p>}
                  {logs.map((l,i) => (
                    <div key={i} style={{fontSize:11,lineHeight:1.6,color:l.type==="error"?C.error:l.type==="success"?C.success:C.sub}}>
                      <span style={{color:C.muted,marginRight:6,fontFamily:"monospace"}}>{l.time}</span>{l.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==="list" && (
          <div>
            <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:C.sub}}>絞り込み：</span>
              <select style={{...sty.input,width:"auto",padding:"6px 12px"}} value={filterInd} onChange={e=>setFilterInd(e.target.value)}>
                <option value="all">全業種</option>
                {industries.map(i => <option key={i}>{i}</option>)}
              </select>
              <select style={{...sty.input,width:"auto",padding:"6px 12px"}} value={filterLv} onChange={e=>setFilterLv(e.target.value)}>
                <option value="all">全レベル</option>
                {["Lv4","Lv3","Lv2","Lv1"].map(l => <option key={l}>{l}</option>)}
              </select>
              <span style={{fontSize:12,color:C.muted}}>{filtered.length}件</span>
            </div>
            {doneJobs.length===0 ? (
              <div style={{...sty.card,textAlign:"center",padding:"48px",color:C.muted}}>
                <div style={{fontSize:32,marginBottom:12}}>📊</div>
                <p>「分析」タブでAI分析を実行してください</p>
              </div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr>
                      {["業種","規模","会社名","職種","人物像","Lv","平均",...AXES.map(a=>`軸${a.id}`),""].map((h,i) => (
                        <th key={i} style={{...sty.th,minWidth:i>6?36:undefined}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((j,ri) => (
                      <tr key={j.id}>
                        <td style={sty.td(ri)}>{j.industry||"—"}</td>
                        <td style={sty.td(ri)}>{j.result?.size_label||"—"}</td>
                        <td style={{...sty.td(ri),maxWidth:150,fontWeight:600}}>
                          <a href={`https://job.mynavi.jp/27/pc/search/corp${j.corpId}/outline.html`}
                             target="_blank" rel="noreferrer"
                             style={{color:C.primary,textDecoration:"none",display:"block",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                            {j.company||`corp${j.corpId}`}
                          </a>
                        </td>
                        <td style={{...sty.td(ri),maxWidth:120}}>
                          <div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                            {(j.result?.job_types||[]).join(" / ")||"—"}
                          </div>
                        </td>
                        <td style={{...sty.td(ri),maxWidth:220,color:C.sub}}>
                          <div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{j.result?.persona||"—"}</div>
                        </td>
                        <td style={{...sty.td(ri),textAlign:"center"}}><span style={sty.badge(j.result?.level)}>{j.result?.level||"—"}</span></td>
                        <td style={{...sty.td(ri),textAlign:"center",fontWeight:700,color:C.primary}}>{avgScore(j.result?.scores)}</td>
                        {AXES.map(a => {
                          const sc = j.result?.scores?.[String(a.id)]||0;
                          return (
                            <td key={a.id} title={`${a.name}: ${sc}`}
                                style={{...sty.td(ri),textAlign:"center",padding:"6px 3px",background:SCORE_BG[sc]||SCORE_BG[0],color:SCORE_FG[sc]||SCORE_FG[0],fontWeight:sc>=4?700:400,fontSize:13}}>
                              {sc||"—"}
                            </td>
                          );
                        })}
                        <td style={{...sty.td(ri),textAlign:"center"}}><button style={sty.btnSm} onClick={()=>removeJob(j.id)}>削除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab==="summary" && (
          <div>
            <p style={{fontSize:12,color:C.sub,marginBottom:14}}>分析済み {doneJobs.length}件 の業種別集計。</p>
            {Object.keys(summary).length===0 ? (
              <div style={{...sty.card,textAlign:"center",padding:40,color:C.muted}}>データがありません</div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr>
                      <th style={{...sty.th,minWidth:120}}>業種</th>
                      <th style={{...sty.th,textAlign:"center"}}>件数</th>
                      {AXES.map(a => (
                        <th key={a.id} title={a.name} style={{...sty.th,textAlign:"center",minWidth:44,fontSize:10,whiteSpace:"pre-line"}}>
                          {`軸${a.id}\n${a.short}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summary).sort((a,b)=>b[1].count-a[1].count).map(([ind,d],i) => (
                      <tr key={ind} style={{background:i%2===0?C.surface:C.surface2}}>
                        <td style={{padding:"10px 12px",fontWeight:600,borderBottom:`1px solid ${C.border}`}}>{ind}</td>
                        <td style={{padding:"10px 8px",textAlign:"center",color:C.primary,fontWeight:700,borderBottom:`1px solid ${C.border}`}}>{d.count}</td>
                        {AXES.map(a => {
                          const v=axisAvg(ind,a.id); const sc=v==="—"?0:Math.round(parseFloat(v));
                          return (
                            <td key={a.id} title={`${a.name}: ${v}`}
                                style={{textAlign:"center",padding:"8px 4px",background:SCORE_BG[sc]||SCORE_BG[0],color:SCORE_FG[sc]||SCORE_FG[0],fontWeight:sc>=4?700:400,fontSize:13,borderBottom:`1px solid ${C.border}`}}>
                              {v}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{...sty.card,marginTop:16,borderColor:`${C.primary}33`}}>
              <p style={{fontSize:12,fontWeight:700,color:C.primary,marginBottom:8}}>スコアの見方</p>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:12,lineHeight:2.2}}>
                {[5,4,3,2,1].map(sc => (
                  <span key={sc} style={{color:C.sub}}>
                    <span style={{background:SCORE_BG[sc],color:SCORE_FG[sc],padding:"1px 8px",borderRadius:4,fontWeight:700}}>{sc}</span>
                    {" "}{["","求められていない","あると良い","重要","非常に重要","最重要"][sc]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
