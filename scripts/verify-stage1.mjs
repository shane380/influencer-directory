import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCT = process.env.META_AD_ACCOUNT_ID;
const actId = ACCT?.startsWith("act_") ? ACCT : `act_${ACCT}`;
const V = "v19.0";

// Pin "now" to match the app's clock for deterministic windows.
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const winStartD = new Date(now); winStartD.setDate(winStartD.getDate() - 35);
const since = `${winStartD.getFullYear()}-${pad(winStartD.getMonth()+1)}-${pad(winStartD.getDate())}`;
const until = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
const windowStartMonth = `${winStartD.getFullYear()}-${pad(winStartD.getMonth()+1)}`;
console.log(`Window: ${since} → ${until}  (windowStartMonth=${windowStartMonth})\n`);

function sumAction(arr, type) { if (!Array.isArray(arr)) return 0; let t=0; for (const r of arr){ if(!r)continue; if(type&&r.action_type!==type)continue; t+=parseFloat(r.value||"0"); } return t; }

async function fetchDaily35(handle) {
  const filt = encodeURIComponent(JSON.stringify([{ field:"ad.name", operator:"CONTAIN", value:handle }]));
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  let url = `https://graph.facebook.com/${V}/${actId}/insights?fields=ad_id,spend,impressions&level=ad&time_increment=1&time_range=${tr}&filtering=${filt}&limit=500&access_token=${TOKEN}`;
  const rows = []; let err=null;
  while (url) { const j = await (await fetch(url)).json(); if (j.error){err=j.error.message;break;} for (const r of j.data||[]) rows.push(r); url = j.paging?.next||null; }
  return { rows, err };
}

async function accountTotals(handle) {
  const filt = encodeURIComponent(JSON.stringify([{ field:"ad.name", operator:"CONTAIN", value:handle }]));
  const url = `https://graph.facebook.com/${V}/${actId}/insights?fields=spend,impressions,action_values&level=account&date_preset=maximum&filtering=${filt}&access_token=${TOKEN}`;
  const j = await (await fetch(url)).json();
  if (j.error) return { err: j.error.message };
  const row = j.data?.[0];
  return { spend: parseFloat(row?.spend||"0"), impressions: parseInt(row?.impressions||"0"), purchase_value: Math.round(sumAction(row?.action_values,"purchase")*100)/100 };
}

async function readExistingDaily(handle) {
  const map = new Map(); let from=0; const PAGE=1000;
  for(;;){ const { data, error } = await db.from("creator_ad_performance_daily").select("ad_id,date,spend,impressions").eq("instagram_handle",handle).order("date").range(from,from+PAGE-1);
    if(error||!data||!data.length)break; for(const r of data){ const d=String(r.date).slice(0,10); map.set(`${r.ad_id}:${d}`,{date:d,spend:Number(r.spend||0),impressions:Number(r.impressions||0)}); } if(data.length<PAGE)break; from+=PAGE; }
  return map;
}

function deriveMonthly(dailyMap) {
  const todayDay=now.getDate(), y=now.getFullYear(), mo=now.getMonth();
  const cmStart=`${y}-${pad(mo+1)}-01`, cmEnd=`${y}-${pad(mo+1)}-${pad(todayDay)}`;
  const lmD=new Date(y,mo-1,1), lmY=lmD.getFullYear(), lmMo=lmD.getMonth();
  const lmStart=`${lmY}-${pad(lmMo+1)}-01`, lmLast=new Date(y,mo,0).getDate(), lmCmp=Math.min(todayDay,lmLast), lmEnd=`${lmY}-${pad(lmMo+1)}-${pad(lmCmp)}`;
  const byMonth={}, mtd={spend:0}, lastMtd={spend:0};
  for (const v of dailyMap.values()){ const mk=v.date.slice(0,7); if(!byMonth[mk])byMonth[mk]={spend:0,impressions:0}; byMonth[mk].spend+=v.spend; byMonth[mk].impressions+=v.impressions;
    if(v.date>=cmStart&&v.date<=cmEnd)mtd.spend+=v.spend; if(v.date>=lmStart&&v.date<=lmEnd)lastMtd.spend+=v.spend; }
  const monthly=Object.entries(byMonth).map(([month,x])=>({month,spend:Math.round(x.spend*100)/100,impressions:x.impressions})).sort((a,b)=>b.month.localeCompare(a.month));
  return { monthly, mtd:{spend:Math.round(mtd.spend*100)/100}, lastMtd:{spend:Math.round(lastMtd.spend*100)/100} };
}

async function verify(label, handle) {
  console.log(`\n========== ${label}: @${handle} ==========`);
  const { data: row } = await db.from("creator_ad_performance").select("monthly, totals, synced_at, sync_error").eq("instagram_handle",handle).single();
  const storedMonthly = row?.monthly || [];
  const storedByMonth = new Map(storedMonthly.map(m=>[m.month,m]));

  // 1. Meta calls
  const tot = await accountTotals(handle);
  console.log("Account-level lifetime totals call:", tot.err ? `FAILED (${tot.err})` : `OK  spend=$${tot.spend.toFixed(2)} purchase_value=$${tot.purchase_value.toFixed(2)}`);
  const { rows: freshRows, err: dErr } = await fetchDaily35(handle);
  console.log("35-day daily call:", dErr ? `FAILED (${dErr})` : `OK  ${freshRows.length} rows`);

  // 2. Simulate upsert: existing daily + fresh 35d overlaid
  const merged = await readExistingDaily(handle);
  for (const r of freshRows){ const d=r.date_start?.slice(0,10); if(d&&r.ad_id) merged.set(`${r.ad_id}:${d}`,{date:d,spend:parseFloat(r.spend||"0"),impressions:parseInt(r.impressions||"0")}); }

  // 3. Derive + window-boundary merge against stored monthly (mirrors syncCreator)
  const derived = deriveMonthly(merged);
  const finalByMonth = new Map(storedByMonth);
  for (const m of derived.monthly){ if(m.month>=windowStartMonth) finalByMonth.set(m.month,m); }
  const finalMonthly = Array.from(finalByMonth.values()).sort((a,b)=>b.month.localeCompare(a.month));

  // 4. Compare every month: stored vs new
  console.log("\nmonth     stored      new         Δ");
  const allMonths = [...new Set([...storedByMonth.keys(), ...finalByMonth.keys()])].sort().reverse();
  for (const mk of allMonths){ const s=storedByMonth.get(mk)?.spend ?? 0; const n=finalByMonth.get(mk)?.spend ?? 0; const d=Math.round((n-s)*100)/100;
    console.log(`${mk}   $${s.toFixed(2).padStart(9)} $${n.toFixed(2).padStart(9)}  ${d===0?"  =":(d>0?"+":"")+d.toFixed(2)}`); }

  // 5. Payment-impact check: already-paid ad_spend months
  const { data: pays } = await db.from("creator_payments").select("month, amount_owed, status").eq("instagram_handle", handle).eq("payment_type","ad_spend_commission");
  // payments are keyed by influencer_id, not handle — fall back via influencer
  let payRows = pays;
  if (!payRows || !payRows.length){ const { data: inf } = await db.from("influencers").select("id").eq("instagram_handle",handle).single(); if(inf){ const { data:p2 }=await db.from("creator_payments").select("month,amount_owed,status").eq("influencer_id",inf.id).eq("payment_type","ad_spend_commission"); payRows=p2; } }
  console.log("\nAlready-generated ad_spend payments vs new monthly:");
  for (const p of (payRows||[]).sort((a,b)=>b.month.localeCompare(a.month))){ const newSpend=finalByMonth.get(p.month)?.spend ?? 0; console.log(`  ${p.month} [${p.status}] paid amount=$${Number(p.amount_owed).toFixed(2)} | new monthly spend=$${newSpend.toFixed(2)}`); }
}

// Lilly
await verify("LILLY (was frozen)", "rootedwithlily");

// Pick a healthy creator: synced today, no error, has_ad_spend, not Lilly
const { data: healthy } = await db.from("creator_ad_performance").select("instagram_handle, synced_at, sync_error").is("sync_error", null).order("synced_at",{ascending:false}).limit(5);
const pick = (healthy||[]).find(h=>h.instagram_handle && h.instagram_handle!=="rootedwithlily");
if (pick) await verify("HEALTHY CONTROL", pick.instagram_handle);
else console.log("\n(no healthy creator found for control)");
