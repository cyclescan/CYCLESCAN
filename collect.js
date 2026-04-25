/**
 * CycleScan — Data Collector
 * Runs every hour via GitHub Actions
 * Fetches Binance Futures data, calculates Fear & Greed + AltSeason
 * Updates history.json with compression by time resolution
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');
const FAPI = 'fapi.binance.com';

// ── RESOLUTION RULES ─────────────────────────────────────────────────────────
// Points older than threshold are compressed to the given interval (ms)
const RESOLUTIONS = [
  { olderThanDays:  90, keepEveryMs:  1 * 3600 * 1000 }, // 0-90J   → 1h
  { olderThanDays: 180, keepEveryMs:  4 * 3600 * 1000 }, // 90-180J → 4h
  { olderThanDays: 270, keepEveryMs:  8 * 3600 * 1000 }, // 180-270J→ 8h
  { olderThanDays: 365, keepEveryMs: 24 * 3600 * 1000 }, // 270-365J→ 1j
  { olderThanDays: 548, keepEveryMs: 48 * 3600 * 1000 }, // 365-548J→ 2j
];
const MAX_AGE_MS = 548 * 24 * 3600 * 1000;

// ── HTTP HELPER ───────────────────────────────────────────────────────────────
function get(host, path) {
  return new Promise((resolve, reject) => {
    const options = { host, path, method: 'GET',
      headers: { 'User-Agent': 'CycleScan/1.0' } };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0,100))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ── MATH UTILS ────────────────────────────────────────────────────────────────
const avgA  = arr => arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const median = arr => {
  if(!arr.length) return 0;
  const s = [...arr].sort((a,b) => a-b);
  return s[Math.floor(s.length/2)];
};

// ── FEAR & GREED SCORES ───────────────────────────────────────────────────────
function sF(fAvg) {
  const f = fAvg * 100;
  if(f >  0.05) return clamp(10  - (f - 0.05) * 200, 0, 15);
  if(f >  0.01) return clamp(15  + (0.05 - f) * 500, 15, 35);
  if(f > -0.01) return clamp(35  + (0.01 - f) * 2500, 35, 65);
  if(f > -0.05) return clamp(65  + (0.01 - f) * 500, 65, 85);
  return clamp(85 + (-0.05 - f) * 200, 85, 100);
}
function sT(r) {
  if(r > 1.5) return clamp(5  + (1.5-r)*20, 0, 15);
  if(r > 1.2) return clamp(15 + (1.5-r)*67, 15, 35);
  if(r > 0.8) return clamp(35 + (1.2-r)*75, 35, 65);
  if(r > 0.5) return clamp(65 + (0.8-r)*67, 65, 85);
  return clamp(85 + (0.5-r)*50, 85, 100);
}
function sO(p) {
  if(p > 70) return clamp(5  + (70-p), 0, 20);
  if(p > 50) return clamp(20 + (70-p), 20, 40);
  if(p > 40) return clamp(40 + (50-p)*2, 40, 60);
  if(p > 30) return clamp(60 + (40-p)*2, 60, 80);
  return clamp(80 + (30-p), 80, 100);
}
function sB(p) {
  if(p > 75) return clamp(5  + (75-p), 0, 15);
  if(p > 55) return clamp(15 + (75-p), 15, 40);
  if(p > 45) return clamp(40 + (55-p)*2, 40, 60);
  if(p > 25) return clamp(60 + (45-p)*1.25, 60, 85);
  return clamp(85 + (25-p), 85, 100);
}
function sV(mAbs, mChg) {
  const up = mChg > 0;
  if(up)  { if(mAbs>10) return 0;  if(mAbs>5) return 10; return 30; }
  else    { if(mAbs>10) return 100; if(mAbs>5) return 90; return 65; }
}
function sL(r) {
  if(r > 2.0) return clamp(5  + (2.0-r)*10, 0, 15);
  if(r > 1.5) return clamp(15 + (2.0-r)*40, 15, 35);
  if(r > 0.8) return clamp(35 + (1.5-r)*43, 35, 65);
  if(r > 0.5) return clamp(65 + (0.8-r)*67, 65, 85);
  return clamp(85 + (0.5-r)*50, 85, 100);
}

function calcFG({ fAvg, tMed, oUpPct, br24, mChg, mAbs, lMed }) {
  // Safe defaults for any undefined/NaN values
  fAvg   = isFinite(fAvg)   ? fAvg   : 0;
  tMed   = isFinite(tMed)   ? tMed   : 1;
  oUpPct = isFinite(oUpPct) ? oUpPct : 50;
  br24   = isFinite(br24)   ? br24   : 50;
  mChg   = isFinite(mChg)   ? mChg   : 0;
  mAbs   = isFinite(mAbs)   ? mAbs   : 2;
  lMed   = isFinite(lMed)   ? lMed   : 1;

  const s1 = sF(fAvg);
  const s2 = sT(tMed);
  const s3 = sO(oUpPct);
  const s4 = sB(br24);
  const s5 = sV(mAbs, mChg);
  const s6 = sL(lMed);
  const s7 = br24 > 65 ? clamp(10+(65-br24), 0, 25)
           : br24 > 45 ? clamp(25+(65-br24)*1.25, 25, 75)
           : clamp(75+(45-br24)*1.25, 75, 100);
  return Math.round(s1*.20 + s2*.20 + s3*.15 + s4*.15 + s5*.15 + s6*.10 + s7*.05);
}

// ── ALTSEASON SCORE ───────────────────────────────────────────────────────────
function calcAlt(pairs, btcChg) {
  const alts = pairs.filter(p => p.sym !== 'BTC' && p.sym !== 'ETH');
  if(!alts.length) return 50;
  const sorted = [...alts].sort((a,b) => b.vol - a.vol);
  const t1 = sorted.slice(0, 50);
  const t2 = sorted.slice(50, 150);
  const t3 = sorted.slice(150);
  const br = tier => tier.length
    ? tier.filter(p => p.chg > btcChg).length / tier.length * 100 : 0;
  const brAll = br(alts);
  const brW   = br(t1)*.35 + br(t2)*.35 + br(t3)*.30;
  return Math.round(brAll*.5 + brW*.5);
}

// ── COMPRESSION ───────────────────────────────────────────────────────────────
function compress(points) {
  const now = Date.now();
  // Remove points older than MAX_AGE_MS
  let result = points.filter(p => (now - p.t) <= MAX_AGE_MS);

  // Apply resolution rules — keep only 1 point per interval for older data
  for(const rule of RESOLUTIONS) {
    const thresholdMs = rule.olderThanDays * 24 * 3600 * 1000;
    const intervalMs  = rule.keepEveryMs;
    // Only compress points that fall in this age bucket
    const nextThreshold = RESOLUTIONS[RESOLUTIONS.indexOf(rule)+1];
    const minAgeMs = nextThreshold ? nextThreshold.olderThanDays * 24 * 3600 * 1000 : 0;

    result = result.map((p, i) => {
      const age = now - p.t;
      if(age > thresholdMs) return p; // older — handled by next rule
      if(age <= minAgeMs)   return p; // newer — not in this bucket

      // This point is in the current bucket — check if we should keep it
      const bucket = Math.floor(p.t / intervalMs);
      // Keep only the first point in each bucket
      const isFirst = result.slice(0, i).every(prev => {
        const prevAge = now - prev.t;
        if(prevAge <= minAgeMs || prevAge > thresholdMs) return true;
        return Math.floor(prev.t / intervalMs) !== bucket;
      });
      return isFirst ? p : null;
    }).filter(Boolean);
  }

  return result;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[${new Date().toISOString()}] CycleScan collector starting…`);

  try {
    // ── Fetch all tickers + funding (2 calls) ──
    console.log('Fetching tickers + funding…');
    const [tickers, fundData] = await Promise.all([
      get(FAPI, '/fapi/v1/ticker/24hr'),
      get(FAPI, '/fapi/v1/premiumIndex'),
    ]);

    const fMap = {};
    // premiumIndex can return array or single object — handle both
    const fundArr = Array.isArray(fundData) ? fundData : [fundData];
    fundArr.forEach(f => { if(f && f.symbol) fMap[f.symbol] = +f.lastFundingRate; });

    const tickerArr = Array.isArray(tickers) ? tickers : [tickers];
    const pairs = tickerArr
      .filter(t => t.symbol && t.symbol.endsWith('USDT') && +t.quoteVolume > 100000)
      .sort((a,b) => +b.quoteVolume - +a.quoteVolume)
      .map((t, i) => ({
        sym:     t.symbol.replace('USDT',''),
        chg:     +t.priceChangePercent,
        vol:     +t.quoteVolume,
        funding: fMap[t.symbol] ?? 0,
      }));

    const btcT   = pairs.find(p => p.sym === 'BTC');
    const btcChg = btcT ? btcT.chg : 0;

    // Quick metrics from ticker
    const nonBtc  = pairs.filter(p => p.sym !== 'BTC');
    const br24    = nonBtc.filter(p => p.chg > btcChg).length / nonBtc.length * 100;
    const allChgs = nonBtc.map(p => p.chg).sort((a,b) => a-b);
    const mChg    = allChgs[Math.floor(allChgs.length/2)];
    const absChgs = nonBtc.map(p => Math.abs(p.chg)).sort((a,b) => a-b);
    const mAbs    = absChgs[Math.floor(absChgs.length/2)];
    const fAvg    = avgA(pairs.filter(p => p.funding != null).map(p => p.funding));

    // ── Sample LSR + Taker from top 50 pairs (avoid 500 API calls) ──
    // We use top 50 by volume — representative enough and fast
    console.log('Fetching LSR + Taker for top 50 pairs…');
    const top50 = pairs.slice(0, 50);
    let lsrVals = [], takerVals = [], oiUp = 0, oiTot = 0;

    const BATCH = 10;
    for(let i = 0; i < top50.length; i += BATCH) {
      await Promise.all(top50.slice(i, i+BATCH).map(async p => {
        const sym = p.sym + 'USDT';
        try {
          const [lD, oD, tD] = await Promise.all([
            get(FAPI, `/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=1h&limit=1`),
            get(FAPI, `/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=2`),
            get(FAPI, `/futures/data/takerlongshortRatio?symbol=${sym}&period=1h&limit=3`),
          ]);
          if(Array.isArray(lD) && lD.length) lsrVals.push(+lD[0].longShortRatio);
          if(Array.isArray(oD) && oD.length >= 2) {
            const delta = +oD[0].sumOpenInterest > 0
              ? (+oD[oD.length-1].sumOpenInterest - +oD[0].sumOpenInterest) / +oD[0].sumOpenInterest * 100 : 0;
            oiTot++; if(delta > 0) oiUp++;
          }
          if(Array.isArray(tD) && tD.length)
            takerVals.push(avgA(tD.map(t => +t.buySellRatio)));
        } catch(e) { /* skip failed pair */ }
      }));
      // Small delay between batches
      if(i + BATCH < top50.length) await new Promise(r => setTimeout(r, 500));
    }

    const tMed   = median(takerVals) || 1;
    const oUpPct = oiTot > 0 ? (oiUp / oiTot * 100) : 50;
    const lMed   = median(lsrVals) || 1;

    console.log(`Metrics → br24:${br24.toFixed(1)}% fAvg:${fAvg.toFixed(6)} tMed:${tMed.toFixed(3)} lMed:${lMed.toFixed(3)} oUp:${oUpPct.toFixed(1)}%`);

    // ── Calculate scores ──
    let fg = null;
    try {
      fg = calcFG({ fAvg, tMed, oUpPct, br24, mChg, mAbs, lMed });
    } catch(e) {
      console.error('calcFG error:', e.message);
    }

    let alt = 50;
    try {
      alt = calcAlt(pairs, btcChg);
    } catch(e) {
      console.error('calcAlt error:', e.message);
    }

    // Altseason phase
    const phase = alt < 25 ? 0 : alt < 40 ? 1 : alt < 55 ? 2 : alt < 70 ? 3 : 4;

    const newPoint = {
      t:     Date.now(),
      fg,             // Fear & Greed 0-100
      alt,            // AltSeason 0-100
      phase,          // 0-4
      br:    Math.round(br24 * 10) / 10,   // Breadth %
      fund:  Math.round(fAvg * 1e7) / 1e7, // Funding (7 decimals)
      taker: Math.round(tMed * 1000) / 1000,
      lsr:   Math.round(lMed * 100) / 100,
      oiUp:  Math.round(oUpPct * 10) / 10,
    };

    console.log(`Scores → F&G: ${fg} | AltSeason: ${alt} (Phase ${phase}) | Breadth: ${br24.toFixed(1)}%`);

    // ── Load existing history ──
    let history = { points: [], version: '1.0' };
    if(fs.existsSync(HISTORY_FILE)) {
      try {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      } catch(e) {
        console.warn('Could not parse existing history, starting fresh');
      }
    }

    // ── Add new point (avoid duplicates within 30min) ──
    const lastPt = history.points[history.points.length - 1];
    const minGap = 30 * 60 * 1000;
    if(!lastPt || (newPoint.t - lastPt.t) > minGap) {
      history.points.push(newPoint);
      console.log(`Added new point. Total before compression: ${history.points.length}`);
    } else {
      console.log('Skipped — too soon since last point');
    }

    // ── Compress ──
    history.points = compress(history.points);
    history.generated  = new Date().toISOString();
    history.count      = history.points.length;
    history.latest_fg  = fg;
    history.latest_alt = alt;

    console.log(`After compression: ${history.points.length} points`);

    // ── Write ──
    const dataDir = path.join(__dirname, 'data');
    if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
    console.log(`✓ Written to ${HISTORY_FILE}`);

  } catch(e) {
    console.error('Fatal error:', e.message);
    process.exit(1);
  }
}

main();
