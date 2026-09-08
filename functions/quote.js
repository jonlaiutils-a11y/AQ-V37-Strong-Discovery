// AQ V37.5 Strong Discovery Beta2
// 全市场分批扫描 + 稀缺评分 + 买点过滤 + 次日/3日延续性（基于实时盘口/量价代理指标）
const CORS={"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","access-control-allow-methods":"GET,OPTIONS","cache-control":"no-store"};
const resp=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{...CORS,...h}});
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const validCode=c=>/^\d{6}$/.test(c)&&!c.startsWith("688")&&!c.startsWith("4")&&!c.startsWith("8");
const secid=c=>(/^(5|6|9)/.test(c)?"1.":"0.")+c;
const KV_MARKET_KEY="aq:v375:market:latest";
function getKv(c){const kv=c?.env?.AQ_KV;return kv&&typeof kv.get==="function"&&typeof kv.put==="function"?kv:null}
async function kvGetJson(c,k){const kv=getKv(c);if(!kv)return null;try{const r=await kv.get(k);return r?JSON.parse(r):null}catch{return null}}
async function kvPutJson(c,k,v,ttl){const kv=getKv(c);if(!kv)return false;try{await kv.put(k,JSON.stringify(v),ttl?{expirationTtl:ttl}:undefined);return true}catch{return false}}
async function fetchText(url,timeout=9000){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0","referer":"https://quote.eastmoney.com/","accept":"application/json,text/plain,*/*"},signal:c.signal});const b=await r.arrayBuffer();if(!r.ok)throw new Error("HTTP "+r.status);return new TextDecoder("utf-8").decode(b)}finally{clearTimeout(t)}}
function parseJsonLike(text){const s=String(text||"").trim();try{return JSON.parse(s)}catch{}const m=s.match(/\{[\s\S]*\}/);if(m)try{return JSON.parse(m[0])}catch{}throw new Error("无法解析返回内容")}
const EAST_HOSTS=["https://82.push2.eastmoney.com","https://79.push2.eastmoney.com","https://99.push2.eastmoney.com","https://push2.eastmoney.com"];
async function east(path){let last="";for(const host of EAST_HOSTS){try{const j=parseJsonLike(await fetchText(host+path,8500));if(j?.data)return{j,source:new URL(host).hostname};last="空数据"}catch(e){last=e.message}}throw new Error(last||"行情源不可用")}
const FIELDS="f12,f14,f2,f3,f4,f5,f6,f8,f10,f15,f16,f17,f18,f20,f21,f22,f33,f34,f35,f37,f38,f40,f41,f42,f43,f44,f45,f50,f51,f52,f62,f100";
function cleanName(v){return String(v||"").replace(/[\u0000-\u001f]/g,"").trim()}
function normalize(x){return{code:String(x.f12||""),name:cleanName(x.f14),price:num(x.f2),rise:num(x.f3),changeAmt:num(x.f4),volume:num(x.f5),amount:num(x.f6)/1e8,turnover:num(x.f8),vr:num(x.f10),high:num(x.f15),low:num(x.f16),open:num(x.f17),prevClose:num(x.f18),totalCap:num(x.f20)/1e8,floatCap:num(x.f21)/1e8,speed:num(x.f22),peStatic:num(x.f33),peDynamic:num(x.f34),peTTM:num(x.f35),eps:num(x.f37),revenue:num(x.f40),revGrowth:num(x.f41),profit:num(x.f42),profitGrowth:num(x.f43),grossMargin:num(x.f44),netMargin:num(x.f45),roe:num(x.f50),debtRatio:num(x.f51),mainNet:num(x.f62)/1e8,sector:String(x.f100||"")}}
function allowed(x){return validCode(x.code)&&x.name&&x.price>0&&!/ST|退/.test(x.name)}
function assessMarket(rows){const total=rows.length,up=rows.filter(r=>r.rise>0).length,down=rows.filter(r=>r.rise<0).length,flat=total-up-down,limitUp=rows.filter(r=>r.rise>=9.5).length,limitDown=rows.filter(r=>r.rise<=-9.5).length,totalAmount=rows.reduce((s,r)=>s+r.amount,0);const ratio=total?down/total:0;let risk=45;if(ratio>.8)risk=92;else if(ratio>.7)risk=82;else if(ratio>.6)risk=70;else if(ratio>.52)risk=58;else if(up>down*1.4)risk=35;if(limitDown>limitUp*2&&limitDown>20)risk+=6;risk=clamp(risk,0,100);const isExtreme=risk>=85,isPanic=risk>=92;return{risk,up,down,flat,limitUp,limitDown,totalAmount:Math.round(totalAmount),isExtreme,isPanic,status:risk>=85?"极度恐慌":risk>=70?"弱势下跌":risk>=55?"偏弱":risk<=40?"偏强":"震荡",advice:risk>=85?"🚨 风险极高：原则上空仓，只观察。":risk>=70?"⚠️ 弱势：只做极少数确认后的强势机会。":risk>=55?"📉 偏弱：控制仓位，优先回踩确认。":"市场可交易，但仍按买点纪律执行。"}}
function grade(score){return score>=95?"S":score>=90?"A+":score>=85?"A":score>=75?"B":"C"}
function scorePick(x,market){
  if(x.amount<0.6||x.turnover>28||x.vr>12||x.rise<-2||x.rise>9.3)return null;
  const dayRange=x.high>x.low?(x.high-x.low)/x.low*100:0,pullback=x.high>0?(x.high-x.price)/x.high*100:0,fromOpen=x.open>0?(x.price-x.open)/x.open*100:0,pos=x.high>x.low?(x.price-x.low)/(x.high-x.low):.5;
  // 硬否决：冲高回落/高开低走/极端追高/明显资金流出
  const chase=x.rise>=6.5||pos>.94&&x.rise>5;
  const fade=pullback>2.8&&x.rise>2;
  const weakOpen=fromOpen<-1.5&&x.rise>0;
  const outflow=x.mainNet<-.35;
  if(fade||weakOpen||outflow)return null;
  let raw=54;
  // 强度（最多14）
  if(x.rise>=2&&x.rise<=5.8)raw+=14;else if(x.rise>=.5&&x.rise<2)raw+=8;else if(x.rise>5.8)raw+=5;else raw+=2;
  // 量比（最多9）
  if(x.vr>=1.2&&x.vr<=2.8)raw+=9;else if(x.vr>=.8&&x.vr<=4)raw+=5;else if(x.vr>5)raw-=5;
  // 换手（最多8）
  if(x.turnover>=2&&x.turnover<=10)raw+=8;else if(x.turnover>=1&&x.turnover<=15)raw+=4;else if(x.turnover>18)raw-=6;
  // 日内结构（最多12）
  if(pos>=.58&&pos<=.88)raw+=8;else if(pos>.88&&pos<=.94)raw+=3;else if(pos<.4)raw-=7;
  if(pullback<=1.2)raw+=4;else if(pullback>2)raw-=4;
  // 资金（最多10）
  if(x.mainNet>=1)raw+=10;else if(x.mainNet>=.3)raw+=7;else if(x.mainNet>0)raw+=3;else raw-=3;
  // 涨速（最多4，避免过度奖励）
  if(x.speed>=.1&&x.speed<=1.2)raw+=4;else if(x.speed>2)raw-=3;
  // 基本面底线（最多惩罚12）
  if(x.peTTM<=0||x.peTTM>180)raw-=7;if(x.debtRatio>75)raw-=5;if(x.profitGrowth<-50)raw-=5;
  // 追高惩罚
  if(chase)raw-=10;if(x.rise>7.5)raw-=8;
  // 市场风险惩罚：弱市不硬造S
  raw-=market.risk>=85?8:market.risk>=70?5:market.risk>=55?2:0;
  const score=clamp(Math.round(raw),0,100),g=grade(score);
  // 概率为模型启发式估计，不是历史校准胜率
  const structure=clamp((pos-.35)*35,0,20)+clamp((2.5-pullback)*4,0,10);
  const flow=clamp(x.mainNet*3,0,10)+clamp((x.vr-.8)*4,0,8);
  const nextDayProb=clamp(Math.round(43+(score-70)*.75+structure*.35+flow*.25-(x.rise>6?8:0)-(market.risk>70?5:0)),35,88);
  const threeDayProb=clamp(Math.round(46+(score-70)*.65+structure*.25+flow*.2-(x.rise>7?8:0)-(market.risk>75?5:0)),35,85);
  const remaining=clamp(5.8-x.rise*.45-pullback*.5+(score-80)*.06,0.5,6.5);
  let signal="不买",decision="观察",action="等待更好结构",riskLevel="中高";
  if(score>=95&&!chase&&pullback<=1.3&&pos>=.55&&pos<=.9&&x.mainNet>0){signal="买入";decision="S级机会";action="仅在买入区内、分时承接不破时小仓确认";riskLevel="中"}
  else if(score>=90&&!chase){signal="等回踩买";decision="A+强候选";action="回踩买入区企稳后再买，不追直线";riskLevel="中"}
  else if(score>=85){signal="突破后买";decision="A级候选";action="等突破确认或回踩承接，不满足则不买";riskLevel="中"}
  else if(score>=75){signal="观察";decision="B级观察";action="暂不买，等待评分和结构同步增强";riskLevel="中高"}
  if(chase){signal="不买";action="位置过高，禁止追涨；等回踩重新评估";riskLevel="高"}
  if(market.risk>=85&&signal==="买入"){signal="等回踩买";action="市场风险过高，即使S级也只观察回踩确认"}
  const pb=x.rise>=5?.018:x.rise>=3?.012:.009,buyHigh=x.price*(1-Math.max(.002,pb*.25)),buyLow=x.price*(1-pb),stopLoss=Math.max(x.price*.965,Math.min(x.low*.992,x.price*.975));
  return{...x,score,grade:g,signal,decision,action,riskLevel,dayRange:+dayRange.toFixed(2),pullback:+pullback.toFixed(2),fromOpen:+fromOpen.toFixed(2),pos:+pos.toFixed(2),chase,nextDayProb,threeDayProb,remaining:+remaining.toFixed(1),buyHigh:+buyHigh.toFixed(2),buyLow:+buyLow.toFixed(2),cancelBuy:+(buyLow*.985).toFixed(2),stopLoss:+stopLoss.toFixed(2),target1:+(x.price*1.05).toFixed(2),target2:+(x.price*1.08).toFixed(2)}
}
async function fetchPage(p,pz=500){const fs="m:0+t:6,m:0+t:80,m:1+t:2";const path="/api/qt/clist/get?pn="+p+"&pz="+pz+"&po=1&np=1&fltt=2&invt=2&fid=f6&fs="+encodeURIComponent(fs)+"&fields="+FIELDS;const r=await east(path);return(r.j?.data?.diff||[]).map(normalize).filter(allowed)}
async function scanMarket(context){const started=Date.now();let pages=[];try{pages=await Promise.all(Array.from({length:12},(_,i)=>fetchPage(i+1,500)))}catch{pages=await Promise.all(Array.from({length:20},(_,i)=>fetchPage(i+1,200)))}const all=pages.flat(),unique=[...new Map(all.map(x=>[x.code,x])).values()],market=assessMarket(unique);let picks=unique.map(x=>scorePick(x,market)).filter(Boolean).sort((a,b)=>b.score-a.score||b.nextDayProb-a.nextDayProb||b.mainNet-a.mainNet);const trade=picks.filter(x=>["买入","等回踩买","突破后买"].includes(x.signal));const strong=trade.slice(0,8);const micro=picks.filter(x=>x.score>=75&&!trade.includes(x)).slice(0,8);const body={ok:true,version:"AQ-V37.5-Beta2",time:new Date().toISOString(),market,strongContra:strong.map((x,i)=>({...x,rank:i+1})),microContra:micro.map((x,i)=>({...x,rank:i+1})),allPicks:picks.slice(0,30).map((x,i)=>({...x,rank:i+1})),scanned:unique.length,coverage:"沪深A股分批扫描（排除688/北交所/ST/退市）",probabilityNote:"次日/3日概率为实时量价启发式模型估计，尚非历史回测校准胜率",elapsedMs:Date.now()-started};context.waitUntil(kvPutJson(context,KV_MARKET_KEY,body,86400));return resp(body,200,{"cache-control":"public, max-age=30"})}
async function queryQuotes(url,context){const codes=[...new Set((url.searchParams.get("codes")||"").split(",").map(x=>x.trim()).filter(validCode))].slice(0,50);if(!codes.length)return resp({ok:false,error:"没有有效代码"},400);const live=[];for(let i=0;i<codes.length;i+=10){const chunk=codes.slice(i,i+10),path="/api/qt/ulist.np/get?fltt=2&np=1&invt=2&fields="+FIELDS+"&secids="+encodeURIComponent(chunk.map(secid).join(","));const{j}=await east(path);live.push(...(j?.data?.diff||[]).map(normalize).filter(allowed))}const market=(await kvGetJson(context,KV_MARKET_KEY))?.market||{risk:50};const items=live.map(x=>scorePick(x,market)||({...x,score:0,grade:"C",signal:"不买",decision:"不符合",action:"不参与"}));return resp({ok:true,time:new Date().toISOString(),count:items.length,items})}
export async function onRequestOptions(){return resp({ok:true})}
export async function onRequestGet(context){const url=new URL(context.request.url);try{if(url.searchParams.get("health")==="1")return resp({ok:true,service:"AQ-V37.5-Beta2",time:new Date().toISOString(),kvEnabled:!!getKv(context)});if(url.searchParams.get("mode")==="scan")return await scanMarket(context);return await queryQuotes(url,context)}catch(e){const cached=await kvGetJson(context,KV_MARKET_KEY);if(cached){cached.stale=true;cached.warning=e.message;return resp(cached,200,{"cache-control":"no-store"})}return resp({ok:false,error:e.message||"接口异常"},502)}}
