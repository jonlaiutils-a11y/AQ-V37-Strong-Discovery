// AQ V37.4 Discovery Beta1 — 强势发现 + 风险过滤 + 实盘确认
// 核心原则：主动发现强股 + 不追直线 + 买点确认 + 次日/3日延续 + 风险撤销

const CORS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "cache-control": "no-store"
};
const resp = (x, s = 200, h = {}) => new Response(JSON.stringify(x), { status: s, headers: { ...CORS, ...h } });
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 };
const validCode = c => /^\d{6}$/.test(c) && !c.startsWith("688") && !c.startsWith("4") && !c.startsWith("8");
const secid = c => (/^(5|6|9)/.test(c) ? "1." : "0.") + c;

const KV_MARKET_KEY = "aq:ext:market:latest";

function getKv(context) {
  const kv = context?.env?.AQ_KV;
  return kv && typeof kv.get === "function" && typeof kv.put === "function" ? kv : null;
}
async function kvGetJson(context, key) {
  const kv = getKv(context);
  if (!kv) return null;
  try { const raw = await kv.get(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function kvPutJson(context, key, value, ttlSeconds) {
  const kv = getKv(context);
  if (!kv) return false;
  try { await kv.put(key, JSON.stringify(value), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined); return true; } catch { return false; }
}

async function fetchText(url, timeout = 9000, headers = {}) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0", "referer": "https://quote.eastmoney.com/", "accept": "application/json,text/plain,*/*", ...headers },
      signal: c.signal
    });
    const buf = await r.arrayBuffer();
    if (!r.ok) throw new Error("HTTP " + r.status);
    return new TextDecoder("utf-8").decode(buf);
  } finally { clearTimeout(t); }
}
function cleanName(v) {
  const s = String(v || "").trim();
  if (!s || /[�]{2,}|\?{3,}/.test(s)) return "";
  return s.replace(/[\u0000-\u001f]/g, "").trim();
}
function parseJsonLike(text) {
  const s = String(text || "").trim();
  try { return JSON.parse(s); } catch { }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch { }
  throw new Error("无法解析返回内容");
}

const EAST_HOSTS = [
  "https://82.push2.eastmoney.com", "https://79.push2.eastmoney.com",
  "https://99.push2.eastmoney.com", "https://push2.eastmoney.com"
];
async function east(path) {
  const errors = [];
  for (const host of EAST_HOSTS) {
    try {
      const j = parseJsonLike(await fetchText(host + path, 7500));
      if (j?.data) return { j, source: new URL(host).hostname };
      errors.push(new URL(host).hostname + ":空数据");
    } catch (e) { errors.push(new URL(host).hostname + ":" + e.message); }
  }
  throw new Error(errors.join(" | "));
}

const FIELDS = "f12,f14,f2,f3,f4,f5,f6,f8,f10,f15,f16,f17,f18,f20,f21,f22,f33,f34,f35,f37,f38,f40,f41,f42,f43,f44,f45,f50,f51,f52,f62,f100";

function normalize(x) {
  return {
    code: String(x.f12 || ""), name: cleanName(x.f14),
    price: num(x.f2), rise: num(x.f3), changeAmt: num(x.f4),
    volume: num(x.f5), amount: num(x.f6) / 1e8,
    turnover: num(x.f8), vr: num(x.f10),
    high: num(x.f15), low: num(x.f16), open: num(x.f17), prevClose: num(x.f18),
    totalCap: num(x.f20) / 1e8, floatCap: num(x.f21) / 1e8,
    speed: num(x.f22),
    peStatic: num(x.f33), peDynamic: num(x.f34), peTTM: num(x.f35),
    eps: num(x.f37), revenue: num(x.f40), revGrowth: num(x.f41),
    profit: num(x.f42), profitGrowth: num(x.f43),
    grossMargin: num(x.f44), netMargin: num(x.f45),
    roe: num(x.f50), debtRatio: num(x.f51),
    mainNet: num(x.f62) / 1e8,
    sector: String(x.f100 || "")
  };
}
function allowed(x) {
  return validCode(x.code) && x.name && x.price > 0 && !/ST|退/.test(x.name);
}

// ========== 市场环境评估（极端行情专用） ==========
function assessMarket(rows) {
  const total = rows.length;
  const up = rows.filter(r => num(r.f3) > 0).length;
  const down = rows.filter(r => num(r.f3) < 0).length;
  const flat = total - up - down;
  const limitUp = rows.filter(r => num(r.f3) >= 9.5).length;
  const limitDown = rows.filter(r => num(r.f3) <= -9.5).length;
  const totalAmount = rows.reduce((s, r) => s + num(r.f6), 0) / 1e8;

  // 极端行情判断
  const isExtreme = down > 3500 || limitDown > 50 || (up < 800 && down > 3000);
  const isPanic = limitDown > limitUp * 3 && down > 3000;

  let risk = 50;
  if (down > 4000) risk = 95;
  else if (down > 3500) risk = 88;
  else if (down > 3000) risk = 78;
  else if (down > up * 2) risk = 70;

  if (limitDown > 100) risk += 5;
  if (totalAmount < 6000) risk += 5;

  risk = Math.min(100, risk);

  return {
    risk, up, down, flat, limitUp, limitDown,
    totalAmount: Math.round(totalAmount),
    isExtreme, isPanic,
    status: risk >= 85 ? "极度恐慌" : risk >= 70 ? "恐慌下跌" : risk >= 55 ? "弱势" : "震荡",
    advice: risk >= 85 ? "🚨 极度恐慌！建议完全空仓，只观望不操作" :
            risk >= 70 ? "⚠️ 恐慌下跌！只看不买，或极小仓位（<10%）试错逆势活口" :
            risk >= 55 ? "📉 市场偏弱，控制仓位，只做最强逆势股" : "震荡市，可正常操作"
  };
}

// ========== 逆势选股引擎 ==========
function contraPick(x, market) {
  const rise = x.rise, amount = x.amount, vr = x.vr, turnover = x.turnover;
  const high = x.high, low = x.low, price = x.price, open = x.open;
  const mainNet = x.mainNet, speed = x.speed;

  // 基础过滤
  if (amount < 0.5) return null; // 流动性不足
  if (turnover > 25) return null; // 换手过高，筹码松动
  if (vr > 10) return null; // 量异常

  // 逆势核心：大盘暴跌时还能红盘或微跌
  const isContra = rise >= 0.5; // 大盘跌时还能红盘
  const isStrongContra = rise >= 2 && rise <= 7; // 强势逆势
  const isMicroContra = rise >= -1 && rise < 0.5; // 微跌抗跌

  if (!isContra && !isMicroContra) return null;

  // 日内形态：不能是冲高回落
  const dayRange = high > low ? (high - low) / low * 100 : 0;
  const pullback = high > 0 ? (high - price) / high * 100 : 0;
  const fromOpen = open > 0 ? (price - open) / open * 100 : 0;
  const pos = high > low ? (price - low) / (high - low) : 0.5;

  if (pullback > 2.5 && rise > 3) return null; // 冲高回落
  if (fromOpen < -1 && rise > 1) return null; // 高开低走
  if (pos < 0.35 && rise <= 1) return null; // 落到日内低位

  // 资金验证
  if (mainNet < -0.2) return null; // 主力净流出

  // 评分
  let score = 50;

  // 逆势强度
  if (isStrongContra) score += 25;
  else if (isContra) score += 18;
  else score += 10;

  // 量能健康
  if (vr >= 1.2 && vr <= 3.5) score += 15;
  else if (vr >= 0.8 && vr <= 5) score += 8;

  // 换手合理
  if (turnover >= 2 && turnover <= 12) score += 10;
  else if (turnover >= 1 && turnover <= 18) score += 5;

  // 位置健康
  if (pos >= 0.55 && pos <= 0.88) score += 10;
  if (pullback <= 1.5) score += 8;

  // 涨速
  if (speed >= 0.2) score += 8;

  // 主力流入
  if (mainNet > 0.5) score += 10;
  else if (mainNet > 0.1) score += 5;

  // 基本面底线（股灾中更要避开基本面雷）
  if (x.peTTM <= 0 || x.peTTM > 200) score -= 20;
  if (x.debtRatio > 80) score -= 10;
  if (x.profitGrowth < -50) score -= 10;

  score = Math.min(100, Math.max(0, score));

  // 决策
  let decision = "观望", action = "等待", riskLevel = "高";
  if (score >= 80 && rise >= 2 && rise <= 6 && pullback <= 1.5 && pos >= 0.5 && mainNet > 0) {
    decision = "逆势强"; action = "尾盘14:30后若不破分时均线可极小仓试错"; riskLevel = "中";
  } else if (score >= 70 && rise >= 0.5 && rise <= 5 && pullback <= 2) {
    decision = "抗跌"; action = "观察，等大盘企稳信号"; riskLevel = "中";
  }

  // 买入区间（只做回踩，不追直线）
  const pb = rise >= 4 ? 0.015 : 0.008;
  const buyHigh = price * (1 - Math.max(0.002, pb * 0.3));
  const buyLow = price * (1 - pb);
  const stopLoss = Math.min(low * 0.985, price * 0.97); // 股灾里-3%就砍
  const target1 = price * 1.05;  // +5%就跑
  const target2 = price * 1.08;  // +8%强目标

  const grade = score >= 90 ? "S" : score >= 82 ? "A+" : score >= 75 ? "A" : score >= 68 ? "B" : "C";
  const stage = pullback <= 1.2 && pos >= 0.65 ? "强势承接" : pullback <= 2.2 ? "突破后整理" : "观察";
  const nextDayStrength = Math.max(0, Math.min(100, Math.round(score * 0.72 + (pos * 100) * 0.18 + (mainNet > 0 ? 8 : -8))));
  const threeDayStrength = Math.max(0, Math.min(100, Math.round(score * 0.68 + (vr >= 1 && vr <= 4 ? 10 : 0) + (turnover >= 2 && turnover <= 12 ? 8 : 0))));
  const cancelBuy = +(Math.max(low, buyLow * 0.992)).toFixed(2);

  return {
    ...x,
    score, grade, stage, decision, action, riskLevel,
    nextDayStrength, threeDayStrength, cancelBuy,
    isContra, isStrongContra,
    dayRange: +dayRange.toFixed(2),
    pullback: +pullback.toFixed(2),
    fromOpen: +fromOpen.toFixed(2),
    pos: +pos.toFixed(2),
    buyHigh: +buyHigh.toFixed(2),
    buyLow: +buyLow.toFixed(2),
    stopLoss: +stopLoss.toFixed(2),
    target1: +target1.toFixed(2),
    target2: +target2.toFixed(2)
  };
}

// ========== 扫描市场 ==========
async function scanMarket(context) {
  const started = Date.now();
  const fs = "m:0+t:6,m:0+t:80,m:1+t:2";
  let all = [];

  // 扫描前5页（约500只最活跃的）
  for (let p = 1; p <= 5; p++) {
    const path = "/api/qt/clist/get?pn=" + p + "&pz=100&po=1&np=1&fltt=2&invt=2&fid=f6&fs=" + encodeURIComponent(fs) + "&fields=" + FIELDS;
    const r = await east(path);
    all.push(...(r.j?.data?.diff || []).map(normalize).filter(allowed));
  }

  const unique = [...new Map(all.map(x => [x.code, x])).values()];
  const market = assessMarket(all);

  // 逆势选股
  let picks = unique.map(x => contraPick(x, market)).filter(Boolean);
  picks.sort((a, b) => b.score - a.score);

  // 分类
  const strongContra = picks.filter(x => x.isStrongContra && x.score >= 75).slice(0, 5);
  const microContra = picks.filter(x => !x.isStrongContra && x.score >= 65).slice(0, 5);
  const allPicks = picks.slice(0, 15);

  const body = {
    ok: true,
    version: "AQ-V37.4-Discovery-Beta1",
    time: new Date().toISOString(),
    market,
    strongContra: strongContra.map((x, i) => ({ ...x, rank: i + 1 })),
    microContra: microContra.map((x, i) => ({ ...x, rank: i + 1 })),
    allPicks: allPicks.map((x, i) => ({ ...x, rank: i + 1 })),
    scanned: unique.length,
    elapsedMs: Date.now() - started
  };

  const res = resp(body, 200, { "cache-control": "public, max-age=30" });
  context.waitUntil(kvPutJson(context, KV_MARKET_KEY, body, 24 * 60 * 60));
  return res;
}

// ========== 自选查询 ==========
async function queryQuotes(url, context) {
  const codes = [...new Set((url.searchParams.get("codes") || "").split(",").map(x => x.trim()).filter(validCode))].slice(0, 50);
  if (!codes.length) return resp({ ok: false, error: "没有有效代码" }, 400);

  const live = [];
  for (let i = 0; i < codes.length; i += 10) {
    const chunk = codes.slice(i, i + 10);
    const path = "/api/qt/ulist.np/get?fltt=2&np=1&invt=2&fields=" + FIELDS + "&secids=" + encodeURIComponent(chunk.map(secid).join(","));
    const { j } = await east(path);
    live.push(...(j?.data?.diff || []).map(normalize).filter(allowed));
  }

  const items = live.map(x => {
    const r = contraPick(x, { risk: 70 });
    if (!r) return { ...x, score: 0, decision: "不符合", action: "不参与" };
    return r;
  });

  return resp({ ok: true, time: new Date().toISOString(), count: items.length, items });
}

export async function onRequestOptions() { return resp({ ok: true }); }
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  try {
    if (url.searchParams.get("health") === "1") {
      return resp({ ok: true, service: "AQ-V37.4-Discovery-Beta1", time: new Date().toISOString(), kvEnabled: !!getKv(context) });
    }
    if (url.searchParams.get("mode") === "scan") {
      return await scanMarket(context);
    }
    return await queryQuotes(url, context);
  } catch (e) {
    const kvMarket = await kvGetJson(context, KV_MARKET_KEY);
    if (kvMarket) { kvMarket.stale = true; kvMarket.warning = e.message; return resp(kvMarket, 200, { "cache-control": "no-store" }); }
    return resp({ ok: false, error: e.message || "接口异常" }, 502);
  }
}
