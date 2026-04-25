/**
 * CycleScan — Data Collector (Bybit API)
 * Runs every hour via GitHub Actions
 * Bybit has no geographic restrictions on public endpoints
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');
const BYBIT = 'api.bybit.com';

// ── RESOLUTION RULES ─────────────────────────────────────────────────────────
const RESOLUTIONS = [
  { olderThanDays:  90, keepEveryMs:  1 * 3600 * 1000 },
  { olderThanDays: 180, keepEveryMs:  4 * 3600 * 1000 },
  { olderThanDays: 270, keepEveryMs:  8 * 3600 * 1000 },
  { olderThanDays: 365, keepEveryMs: 24 * 3600 * 1000 },
  { olderThanDays: 548, keepEveryMs: 48 * 3600 * 1000 },
];
const MAX_AGE_MS = 548 * 24 * 3600 * 1000;

// ── HTTP ──────────────────────────────────────────────────────────────────────
function get(host, p) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host, path: p, method: 'GET', headers: { 'User-Agent': 'CycleScan/1.0' } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error('JSON error: ' + data.slice(0,200))); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ── MATH ──────────────────────────────────────────────────────────────────────
const avgA  = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const median = a => {
  if(!a.length) return 0;
  const s = [...a].sort((x,y) => x-y);
  return s[Math.floor(s.length/2)];
};
const safe = (v, def=0) => (isFinite(v) && v !== null && v !== undefined) ? v : def;

// ── FEAR & GREED SCORES ───────────────────────────────────────────────────────
function sF(fAvg) {
  const f = safe(fAvg) * 100;
  if(f >  0.05) return clamp(10  - (f-0.05)*200,  0, 15);
  if(f >  0.01) return clamp(15  + (0.05-f)*500,  15, 35);
  if(f > -0.01) return clamp(35  + (0.01-f)*2500, 35, 65);
  if(f > -0.05) return clamp(65  + (0.01-f)*500,  65, 85);
  return clamp(85 + (-0.05-f)*200, 85, 100);
}
function sT(r) {
  r = safe(r, 1);
  if(r > 1.5) return clamp(5  + (1.5-r)*20, 0, 15);
  if(r > 1.2) return clamp(15 + (1.5-r)*67, 15, 35);
  if(r > 0.8) return clamp(35 + (1.2-r)*75, 35, 65);
  if(r > 0.5) return clamp(65 + (0.8-r)*67, 65, 85);
  return clamp(85 + (0.5-r)*50, 85, 100);
}
function sO(p) {
  p = safe(p, 50);
  if(p > 70) return clamp(5  + (70-p),    0, 20);
  if(p > 50) return clamp(20 + (70-p),   20, 40);
  if(p > 40) return clamp(40 + (50-p)*2, 40, 60);
  if(p > 30) return clamp(60 + (40-p)*2, 60, 80);
  return clamp(80 + (30-p), 80, 100);
}
function sB(p) {
  p = safe(p, 50);
  if(p > 75) return clamp(5  + (75-p),      0, 15);
  if(p > 55) return clamp(15 + (75-p),     15, 40);
  if(p > 45) return clamp(40 + (55-p)*2,   40, 60);
  if(p > 25) return clamp(60 + (45-p)*1.25,60, 85);
  return clamp(85 + (25-p), 85, 100);
}
function sV(mAbs, mChg) {
  mAbs = safe(mAbs, 2); mChg = safe(mChg, 0);
  if(mChg > 0) { if(mAbs>10) return 0; if(mAbs>5) return 10; return 30; }
  else          { if(mAbs>10) return 100; if(mAbs>5) return 90; return 65; }
}
function sL(r) {
  r = safe(r, 1);
  if(r > 2.0) return clamp(5  + (2.0-r)*10, 0, 15);
  if(r > 1.5) return clamp(15 + (2.0-r)*40,15, 35);
  if(r > 0.8) return clamp(35 + (1.5-r)*43,35, 65);
  if(r > 0.5) return clamp(65 + (0.8-r)*67,65, 85);
  return clamp(85 + (0.5-r)*50, 85, 100);
}

function calcFG({ fAvg, tMed, oUpPct, br24, mChg, mAbs, lMed }) {
  const s1=sF(fAvg), s2=sT(tMed), s3=sO(oUpPct), s4=sB(br24);
  const s5=sV(mAbs,mChg), s6=sL(lMed);
  const b=safe(br24,50);
  const s7 = b>65 ? clamp(10+(65-b),0,25) : b>45 ? clamp(25+(65-b)*1.25,25,75) : clamp(75+(45-b)*1.25,75,100);
  return Math.round(s1*.20+s2*.20+s3*.15+s4*.15+s5*.15+s6*.10+s7*.05);
}

function calcAlt(pairs, btcChg) {
  const alts = pairs.filter(p => p.sym!=='BTC' && p.sym!=='ETH');
  if(!alts.length) return 50;
  const sorted = [...alts].sort((a,b) => b.vol-a.vol);
  const t1=sorted.slice(0,50), t2=sorted.slice(50,150), t3=sorted.slice(150);
  const br = tier => tier.length ? tier.filter(p=>p.chg>btcChg).length/tier.length*100 : 50;
  return Math.round(br(alts)*.5 + (br(t1)*.35+br(t2)*.35+br(t3)*.30)*.5);
}

// ── COMPRESSION ───────────────────────────────────────────────────────────────
function compress(points) {
  const now = Date.now();
  let result = points.filter(p => (now-p.t) <= MAX_AGE_MS);
  for(const rule of RESOLUTIONS) {
    const thr = rule.olderThanDays * 24*3600*1000;
    const iv  = rule.keepEveryMs;
    const seen = new Set();
    result = result.filter(p => {
      const age = now - p.t;
      if(age <= thr) return true; // newer than threshold → keep
      const bucket = Math.floor(p.t / iv);
      if(seen.has(bucket)) return false;
      seen.add(bucket); return true;
    });
  }
  return result;
}

// ── BYBIT DATA ────────────────────────────────────────────────────────────────
async function fetchBybitTickers() {
  // Linear (USDT perpetuals) tickers
  const res = await get(BYBIT, '/v5/market/tickers?category=linear');
  if(res.retCode !== 0) throw new Error(`Bybit tickers: ${res.retMsg}`);
  return res.result.list || [];
}

async function fetchBybitFunding(symbol) {
  try {
    const res = await get(BYBIT, `/v5/market/funding/history?category=linear&symbol=${symbol}&limit=1`);
    if(res.retCode === 0 && res.result.list.length) {
      return +res.result.list[0].fundingRate;
    }
  } catch(e) {}
  return null;
}

async function fetchBybitLSR(symbol) {
  try {
    const res = await get(BYBIT, `/v5/market/account-ratio?category=linear&symbol=${symbol}&period=1h&limit=1`);
    if(res.retCode === 0 && res.result.list.length) {
      const buyR = +res.result.list[0].buyRatio;
      return buyR > 0 && buyR < 1 ? buyR/(1-buyR) : null;
    }
  } catch(e) {}
  return null;
}

async function fetchBybitTaker(symbol) {
  try {
    const res = await get(BYBIT, `/v5/market/taker-volume?category=linear&symbol=${symbol}&period=1h&limit=3`);
    if(res.retCode === 0 && res.result.list.length) {
      const ratios = res.result.list.map(t => {
        const b=+t.buyVolume, s=+t.sellVolume;
        return s>0 ? b/s : 1;
      });
      return avgA(ratios);
    }
  } catch(e) {}
  return null;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[${new Date().toISOString()}] CycleScan collector starting (Bybit)…`);

  try {
    // ── Step 1: All tickers ──
    console.log('Fetching Bybit tickers…');
    const rawTickers = await fetchBybitTickers();
    console.log(`Got ${rawTickers.length} tickers from Bybit`);

    // Filter USDT perpetuals with meaningful volume
    const pairs = rawTickers
      .filter(t => t.symbol && t.symbol.endsWith('USDT') && +t.turnover24h > 100000)
      .sort((a,b) => +b.turnover24h - +a.turnover24h)
      .map((t,i) => ({
        sym:  t.symbol.replace('USDT',''),
        chg:  +t.price24hPcnt * 100,   // Bybit gives decimal (0.012 = 1.2%)
        vol:  +t.turnover24h,
        fund: +t.fundingRate || 0,
        rank: i+1,
      }));

    console.log(`Filtered pairs: ${pairs.length}`);
    if(!pairs.length) throw new Error('No pairs after filtering');

    const btcT   = pairs.find(p => p.sym==='BTC');
    const btcChg = btcT ? btcT.chg : 0;
    console.log(`BTC 24h: ${btcChg.toFixed(2)}%`);

    // ── Step 2: Quick metrics ──
    const nonBtc = pairs.filter(p => p.sym!=='BTC');
    const br24   = nonBtc.length>0
      ? nonBtc.filter(p=>p.chg>btcChg).length/nonBtc.length*100 : 50;

    const chgs   = nonBtc.map(p=>p.chg).sort((a,b)=>a-b);
    const mChg   = chgs.length>0 ? chgs[Math.floor(chgs.length/2)] : 0;
    const absCh  = nonBtc.map(p=>Math.abs(p.chg)).sort((a,b)=>a-b);
    const mAbs   = absCh.length>0 ? absCh[Math.floor(absCh.length/2)] : 2;

    // Funding average (from ticker, non-zero only)
    const fundVals = pairs.filter(p=>p.fund!==0).map(p=>p.fund);
    const fAvg = fundVals.length>0 ? avgA(fundVals) : 0;

    console.log(`br24:${br24.toFixed(1)}% fAvg:${fAvg.toFixed(6)} mChg:${mChg.toFixed(2)}%`);

    // ── Step 3: LSR + Taker for top 30 (fast, representative) ──
    console.log('Fetching LSR + Taker for top 30 pairs…');
    const top30 = pairs.slice(0,30);
    let lsrVals=[], takerVals=[], oiUp=0, oiTot=0;

    const BATCH=6;
    for(let i=0;i<top30.length;i+=BATCH){
      await Promise.all(top30.slice(i,i+BATCH).map(async p => {
        const sym=p.sym+'USDT';
        const [lsr,taker]=await Promise.all([fetchBybitLSR(sym),fetchBybitTaker(sym)]);
        if(lsr!=null)   lsrVals.push(lsr);
        if(taker!=null) takerVals.push(taker);
        // OI proxy: use chg direction as proxy (positive chg & high vol = OI up)
        oiTot++;
        if(p.chg>0) oiUp++;
      }));
      if(i+BATCH<top30.length) await new Promise(r=>setTimeout(r,400));
    }

    const tMed   = median(takerVals) || 1;
    const lMed   = median(lsrVals)   || 1;
    const oUpPct = oiTot>0 ? oiUp/oiTot*100 : 50;

    console.log(`tMed:${tMed.toFixed(3)} lMed:${lMed.toFixed(3)} oUpPct:${oUpPct.toFixed(1)}%`);

    // ── Step 4: Scores ──
    const fg  = calcFG({fAvg,tMed,oUpPct,br24,mChg,mAbs,lMed});
    const alt = calcAlt(pairs, btcChg);
    const phase = alt<25?0:alt<40?1:alt<55?2:alt<70?3:4;

    console.log(`Scores → F&G:${fg} | AltSeason:${alt} (Phase ${phase}) | Breadth:${br24.toFixed(1)}%`);

    const newPoint = {
      t:     Date.now(),
      fg,
      alt,
      phase,
      br:    Math.round(br24*10)/10,
      fund:  Math.round(fAvg*1e7)/1e7,
      taker: Math.round(tMed*1000)/1000,
      lsr:   Math.round(lMed*100)/100,
      oiUp:  Math.round(oUpPct*10)/10,
    };

    // ── Step 5: Load + update history ──
    let history = {points:[],version:'1.0'};
    if(fs.existsSync(HISTORY_FILE)){
      try{ history=JSON.parse(fs.readFileSync(HISTORY_FILE,'utf8')); }
      catch(e){ console.warn('Could not parse history, starting fresh'); }
    }

    const lastPt = history.points[history.points.length-1];
    const minGap = 45*60*1000; // 45min min between points
    if(!lastPt || (newPoint.t-lastPt.t)>minGap){
      history.points.push(newPoint);
      console.log(`Added point. Total: ${history.points.length}`);
    } else if(lastPt.fg===null && fg!==null){
      history.points[history.points.length-1]={...lastPt,...newPoint,t:lastPt.t};
      console.log(`Updated null point with fg:${fg}`);
    } else {
      console.log(`Skipped (${Math.round((newPoint.t-lastPt.t)/60000)}min since last point)`);
    }

    history.points     = compress(history.points);
    history.generated  = new Date().toISOString();
    history.count      = history.points.length;
    history.latest_fg  = fg;
    history.latest_alt = alt;

    const dataDir = path.join(__dirname,'data');
    if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir,{recursive:true});
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
    console.log(`✓ Written ${history.count} points to history.json`);

  } catch(e){
    console.error('Fatal error:', e.message);
    process.exit(1);
  }
}

main();
