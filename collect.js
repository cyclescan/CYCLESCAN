/**
 * CycleScan — Data Collector
 * Uses CoinGecko (no geo-restrictions) for price/market data
 * Uses CryptoCompare public API for additional sentiment data
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');
const MAX_AGE_MS   = 548 * 24 * 3600 * 1000;

const RESOLUTIONS = [
  { olderThanDays:  90, keepEveryMs:  1 * 3600 * 1000 },
  { olderThanDays: 180, keepEveryMs:  4 * 3600 * 1000 },
  { olderThanDays: 270, keepEveryMs:  8 * 3600 * 1000 },
  { olderThanDays: 365, keepEveryMs: 24 * 3600 * 1000 },
  { olderThanDays: 548, keepEveryMs: 48 * 3600 * 1000 },
];

// ── HTTP ──────────────────────────────────────────────────────────────────────
function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      host: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'CycleScan/1.0 (github.com/cyclescan)',
        'Accept': 'application/json',
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if(res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0,200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON error: ' + data.slice(0,200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── MATH ──────────────────────────────────────────────────────────────────────
const avgA   = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const clamp  = (v,a,b) => Math.max(a, Math.min(b, v));
const median = a => { if(!a.length) return 0; const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
const safe   = (v, d=0) => (v != null && isFinite(+v)) ? +v : d;

// ── FEAR & GREED SCORING ─────────────────────────────────────────────────────
// Convention standard : 0 = Fear Extrême, 100 = Greed Extrême

function scoreBreadth(p) {
  // Breadth élevé (alts surperf BTC) = Greed → score élevé
  p = safe(p, 50);
  if(p > 75) return clamp(85 + (p-75),      85, 100); // Greed Extrême
  if(p > 55) return clamp(60 + (p-55)*1.25, 60, 85);  // Greed
  if(p > 45) return clamp(40 + (p-45)*2,    40, 60);  // Neutre
  if(p > 25) return clamp(15 + (p-25)*1.25, 15, 40);  // Fear
  return clamp((p/25)*15, 0, 15);                      // Fear Extrême
}

function scoreVol(mAbs, mChg) {
  // Hausse volatile = Greed, Baisse volatile = Fear
  mAbs=safe(mAbs,2); mChg=safe(mChg,0);
  if(mChg > 0){ if(mAbs>10) return 100; if(mAbs>5) return 85; return 65; }
  else         { if(mAbs>10) return 0;   if(mAbs>5) return 12; return 35; }
}

function scoreDom(btcDomPct) {
  // Dominance BTC élevée = Fear (capital fuit vers BTC) → score bas
  // Dominance BTC faible = Greed (capital en alts) → score élevé
  const d = safe(btcDomPct, 50);
  if(d > 60) return clamp(20 - (d-60)*2, 0,  20); // Fear Extrême
  if(d > 55) return clamp(35 - (d-55)*3, 20, 35); // Fear
  if(d > 45) return clamp(65 - (d-45)*3, 35, 65); // Neutre
  if(d > 40) return clamp(80 - (d-40)*3, 65, 80); // Greed
  return clamp(95, 80, 100);                        // Greed Extrême
}

function scoreMarketCap24h(mcChgPct) {
  // Hausse market cap = Greed → score élevé
  const c = safe(mcChgPct, 0);
  if(c >  10) return 100;
  if(c >   5) return 88;
  if(c >   2) return 75;
  if(c >   0) return 60;
  if(c >  -2) return 40;
  if(c >  -5) return 25;
  if(c > -10) return 12;
  return 0;
}

function scoreAltPerf(altBreadth) {
  // Alts surperforment = Greed → score élevé
  const b = safe(altBreadth, 50);
  if(b > 70) return 95;
  if(b > 55) return 75;
  if(b > 45) return 50;
  if(b > 30) return 25;
  return 5;
}

// ── ALTSAISON ────────────────────────────────────────────────────────────────
function calcAlt(coins, btcChg) {
  const alts = coins.filter(c => c.sym !== 'BTC' && c.sym !== 'ETH');
  if(!alts.length) return 50;
  const sorted = [...alts].sort((a,b) => b.mcap - a.mcap);
  const t1 = sorted.slice(0, 50);
  const t2 = sorted.slice(50, 150);
  const t3 = sorted.slice(150);
  const br = tier => tier.length
    ? tier.filter(p => p.chg > btcChg).length / tier.length * 100 : 50;
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
      if(age <= thr) return true;
      const bucket = Math.floor(p.t / iv);
      if(seen.has(bucket)) return false;
      seen.add(bucket); return true;
    });
  }
  return result;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[${new Date().toISOString()}] CycleScan collector starting (CoinGecko)…`);

  try {
    // ── Step 1: Global market data ──
    console.log('Fetching global market data…');
    const global = await get('https://api.coingecko.com/api/v3/global');
    const gd = global.data;

    const totalMcap     = safe(gd.total_market_cap?.usd, 0);
    const btcDom        = safe(gd.market_cap_percentage?.btc, 50);
    const ethDom        = safe(gd.market_cap_percentage?.eth, 0);
    const mcap24hChg    = safe(gd.market_cap_change_percentage_24h_usd, 0);
    const activeCryptos = safe(gd.active_cryptocurrencies, 0);

    console.log(`BTC dom:${btcDom.toFixed(1)}% mcap24h:${mcap24hChg.toFixed(2)}% activeCryptos:${activeCryptos}`);

    await sleep(2000); // CoinGecko rate limit

    // ── Step 2: Top coins market data ──
    console.log('Fetching top coins…');
    const [page1, page2] = await Promise.all([
      get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h'),
      get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=2&price_change_percentage=24h'),
    ]);

    const coins = [...(Array.isArray(page1)?page1:[]), ...(Array.isArray(page2)?page2:[])]
      .filter(c => c.symbol && !['usdt','usdc','dai','busd','tusd','usdp','usdd','frax'].includes(c.symbol.toLowerCase()))
      .map(c => ({
        sym:  c.symbol.toUpperCase(),
        chg:  safe(c.price_change_percentage_24h, 0),
        mcap: safe(c.market_cap, 0),
        vol:  safe(c.total_volume, 0),
      }));

    console.log(`Coins loaded: ${coins.length}`);

    const btcCoin = coins.find(c => c.sym === 'BTC');
    const btcChg  = btcCoin ? btcCoin.chg : 0;

    // Breadth: % of coins outperforming BTC
    const nonBtc    = coins.filter(c => c.sym !== 'BTC');
    const br24      = nonBtc.length > 0
      ? nonBtc.filter(c => c.chg > btcChg).length / nonBtc.length * 100 : 50;

    const allChgs   = nonBtc.map(c => c.chg).sort((a,b) => a-b);
    const mChg      = allChgs.length > 0 ? allChgs[Math.floor(allChgs.length/2)] : 0;
    const absChgs   = nonBtc.map(c => Math.abs(c.chg)).sort((a,b) => a-b);
    const mAbs      = absChgs.length > 0 ? absChgs[Math.floor(absChgs.length/2)] : 2;

    console.log(`br24:${br24.toFixed(1)}% btcChg:${btcChg.toFixed(2)}% mChg:${mChg.toFixed(2)}%`);

    // ── Step 3: Fear & Greed (CoinGecko-based components) ──
    // Component weights adapted for available data:
    // Breadth (alts vs BTC)     25%
    // BTC Dominance             25%
    // Market cap 24h change     20%
    // Volatility                15%
    // Alt performance           15%

    const s1 = scoreBreadth(br24);
    const s2 = scoreDom(btcDom);
    const s3 = scoreMarketCap24h(mcap24hChg);
    const s4 = scoreVol(mAbs, mChg);
    const s5 = scoreAltPerf(br24);

    const fg = Math.round(s1*.25 + s2*.25 + s3*.20 + s4*.15 + s5*.15);

    // ── Step 4: AltSeason ──
    const alt   = calcAlt(coins, btcChg);
    const phase = alt<25?0 : alt<40?1 : alt<55?2 : alt<70?3 : 4;

    console.log(`Scores → F&G:${fg} | AltSeason:${alt} (Phase ${phase})`);
    console.log(`Components → s1(breadth):${s1} s2(dom):${s2} s3(mcap):${s3} s4(vol):${s4} s5(altperf):${s5}`);

    const newPoint = {
      t:     Date.now(),
      fg,
      alt,
      phase,
      br:    Math.round(br24*10)/10,
      dom:   Math.round(btcDom*10)/10,
      mc24:  Math.round(mcap24hChg*100)/100,
      mChg:  Math.round(mChg*100)/100,
    };

    // ── Step 5: History ──
    let history = {points:[], version:'1.0'};
    if(fs.existsSync(HISTORY_FILE)){
      try{ history=JSON.parse(fs.readFileSync(HISTORY_FILE,'utf8')); }
      catch(e){ console.warn('Could not parse history, starting fresh'); }
    }

    const lastPt = history.points[history.points.length-1];
    const minGap = 45*60*1000;
    if(!lastPt || (newPoint.t-lastPt.t)>minGap){
      history.points.push(newPoint);
      console.log(`Added point #${history.points.length}`);
    } else {
      console.log(`Skipped (${Math.round((newPoint.t-lastPt.t)/60000)}min since last)`);
    }

    history.points     = compress(history.points);
    history.generated  = new Date().toISOString();
    history.count      = history.points.length;
    history.latest_fg  = fg;
    history.latest_alt = alt;

    const dataDir = path.join(__dirname,'data');
    if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir,{recursive:true});
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
    console.log(`✓ Written ${history.count} points`);

  } catch(e){
    console.error('Fatal error:', e.message);
    process.exit(1);
  }
}

main();
