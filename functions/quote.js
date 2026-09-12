// AQ V37.5 Strong Discovery Beta3 P0
// 核心：AQ强度 + MQ买点质量 + HR追高风险 + ΔAQ强度变化 + T+1交易约束
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
function strengthText(v){return v>=84?"极强":v>=74?"强":v>=62?"中":v>=50?"偏弱":"弱"}
function calcMetrics(x,market){
  if(x.amount<0.6||x.turnover>28||x.vr>12||x.rise<-2||x.rise>9.5)return null;
  const dayRange=x.high>x.low?(x.high-x.low)/x.low*100:0;
  const pullback=x.high>0?(x.high-x.price)/x.high*100:0;
  const fromOpen=x.open>0?(x.price-x.open)/x.open*100:0;
  const pos=x.high>x.low?(x.price-x.low)/(x.high-x.low):.5;
  const chase=x.rise>=6.5||(pos>.94&&x.rise>5);
  const fade=pullback>2.8&&x.rise>2;
  const weakOpen=fromOpen<-1.5&&x.rise>0;
  const outflow=x.mainNet<-.35;

  // AQ：股票强度，回答“是不是强股”
  let aq=50;
  if(x.rise>=1.2&&x.rise<=5.8)aq+=16; else if(x.rise>=.2&&x.rise<1.2)aq+=9; else if(x.rise>5.8)aq+=8; else aq+=2;
  if(x.vr>=1.2&&x.vr<=3.2)aq+=10; else if(x.vr>=.8&&x.vr<=4.5)aq+=5; else if(x.vr>5)aq-=4;
  if(x.turnover>=2&&x.turnover<=10)aq+=8; else if(x.turnover>=1&&x.turnover<=15)aq+=4; else if(x.turnover>18)aq-=6;
  if(pos>=.58&&pos<=.9)aq+=10; else if(pos>.9)aq+=6; else if(pos<.38)aq-=8;
  if(pullback<=1.2)aq+=5; else if(pullback>2.2)aq-=5;
  if(x.mainNet>=1)aq+=11; else if(x.mainNet>=.3)aq+=7; else if(x.mainNet>0)aq+=3; else aq-=4;
  if(x.speed>=.08&&x.speed<=1.2)aq+=5; else if(x.speed>2.2)aq-=2;
  if(x.peTTM<=0||x.peTTM>180)aq-=5;if(x.debtRatio>75)aq-=4;if(x.profitGrowth<-50)aq-=4;
  aq-=market.risk>=85?8:market.risk>=70?5:market.risk>=55?2:0;
  aq=clamp(Math.round(aq),0,100);

  // MQ：买点质量，回答“现在这个价格能不能买”
  let mq=52;
  // 承接/位置
  if(pos>=.55&&pos<=.82)mq+=16; else if(pos>.82&&pos<=.9)mq+=10; else if(pos>.94)mq-=12; else if(pos<.4)mq-=8;
  if(pullback>=.25&&pullback<=1.35)mq+=14; else if(pullback<.25&&x.rise>4)mq-=8; else if(pullback>2.2)mq-=10;
  // 量价
  if(x.vr>=1.15&&x.vr<=3.2)mq+=9; else if(x.vr>5)mq-=7;
  if(x.turnover>=1.8&&x.turnover<=9.5)mq+=7; else if(x.turnover>16)mq-=7;
  // 资金与速度
  if(x.mainNet>=.5)mq+=9; else if(x.mainNet>0)mq+=4; else mq-=8;
  if(x.speed>=.05&&x.speed<=.9)mq+=7; else if(x.speed>1.8)mq-=8;
  // 当日涨幅越高，入场性价比越差
  if(x.rise>=1&&x.rise<=4.8)mq+=8; else if(x.rise>6.5)mq-=14; else if(x.rise>5.2)mq-=7;
  if(market.risk>=75)mq-=7; else if(market.risk<=40)mq+=3;
  if(fade)mq-=18;if(weakOpen)mq-=10;if(outflow)mq-=16;
  mq=clamp(Math.round(mq),0,100);

  // HR：追高/冲高回落风险，越高越危险
  let hr=22;
  if(x.rise>5)hr+=12;if(x.rise>6.5)hr+=18;if(x.rise>8)hr+=10;
  if(pos>.9)hr+=10;if(pos>.96)hr+=8;
  if(pullback<.2&&x.rise>4)hr+=8;if(pullback>2.2&&x.rise>2)hr+=14;
  if(x.speed>1.4)hr+=8;if(x.speed>2.2)hr+=8;
  if(x.vr>4)hr+=7;if(x.turnover>14)hr+=7;
  if(x.mainNet<0)hr+=10;if(fade)hr+=18;if(weakOpen)hr+=10;if(outflow)hr+=16;
  if(market.risk>=75)hr+=8;
  hr=clamp(Math.round(hr),0,100);

  // 硬否决只针对买点，不把股票强度一票否决
  const hardVeto=fade||weakOpen||outflow||hr>=82;
  const buyQuality=mq>=85?"优秀":mq>=75?"良好":mq>=65?"一般":"差";
  const chaseRisk=hr>=75?"高":hr>=50?"中":"低";
  const todayEdge=(mq>=80&&hr<=42&&aq>=86)?"强":(mq>=68&&hr<=58&&aq>=80)?"中":"弱";

  const structure=clamp((pos-.35)*35,0,20)+clamp((2.5-pullback)*4,0,10);
  const flow=clamp(x.mainNet*3,0,10)+clamp((x.vr-.8)*4,0,8);
  const nextDayProb=clamp(Math.round(43+(aq-70)*.72+structure*.33+flow*.23-(x.rise>6?8:0)-(market.risk>70?5:0)),35,88);
  const threeDayProb=clamp(Math.round(46+(aq-70)*.62+structure*.24+flow*.18-(x.rise>7?8:0)-(market.risk>75?5:0)),35,85);

  // 买入区以当前价回踩比例为代理，追高票给更深的等待区
  const pb=x.rise>=6?.022:x.rise>=4?.016:x.rise>=2?.011:.008;
  const buyHigh=x.price*(1-Math.max(.002,pb*.28));
  const buyLow=x.price*(1-pb);
  const cancelBuy=buyLow*.985;
  const stopLoss=Math.max(x.price*.965,Math.min(x.low*.992,x.price*.975));

  let signal="观察",decision="观察",action="等待强度与买点同步增强",riskLevel=chaseRisk;
  if(hardVeto){signal="不买";decision=aq>=88?"强股但禁止追":"风险过滤";action=fade?"冲高回落结构，撤销买点":outflow?"资金明显流出，撤销买点":weakOpen?"高开/冲高后走弱，不参与":"追高风险过高，等待回踩重评";}
  else if(aq>=90&&mq>=82&&hr<=42){signal="可进";decision="S/A+可交易";action="仅在买入区内、承接不破时分批确认";riskLevel="低";}
  else if(aq>=88&&mq>=72&&hr<=58){signal="等回踩";decision="强股等买点";action="股票强，但只等回踩承接，不追直线";}
  else if(aq>=84&&mq>=68&&hr<=62){signal="突破确认";decision="强势备选";action="等突破确认或回踩后重新转强";}
  else if(aq>=88&&mq<68){signal="不追";decision="强股但买点差";action="强度高但当前价格性价比差，等待新的买点";riskLevel=hr>=60?"高":"中";}
  if(market.risk>=85&&signal==="可进"){signal="等回踩";decision="极端行情降级";action="市场风险过高，即使强股也只等确认";riskLevel="高";}

  return{...x,score:aq,aq,mq,hr,grade:grade(aq),signal,decision,action,riskLevel,hardVeto,buyQuality,chaseRisk,todayEdge,dayRange:+dayRange.toFixed(2),pullback:+pullback.toFixed(2),fromOpen:+fromOpen.toFixed(2),pos:+pos.toFixed(2),chase,nextDayProb,threeDayProb,nextDayStrength:strengthText(nextDayProb),threeDayStrength:strengthText(threeDayProb),buyHigh:+buyHigh.toFixed(2),buyLow:+buyLow.toFixed(2),cancelBuy:+cancelBuy.toFixed(2),stopLoss:+stopLoss.toFixed(2),target1:+(x.price*1.05).toFixed(2),target2:+(x.price*1.08).toFixed(2)};
}
async function fetchPage(p,pz=500){const fs="m:0+t:6,m:0+t:80,m:1+t:2";const path="/api/qt/clist/get?pn="+p+"&pz="+pz+"&po=1&np=1&fltt=2&invt=2&fid=f6&fs="+encodeURIComponent(fs)+"&fields="+FIELDS;const r=await east(path);return(r.j?.data?.diff||[]).map(normalize).filter(allowed)}
function applyDynamics(picks,previous){
  const prevMap=new Map((previous?.allPicks||[]).map(x=>[x.code,x]));
  return picks.map(x=>{
    const p=prevMap.get(x.code);
    const aqDelta=p&&Number.isFinite(Number(p.aq??p.score))?x.aq-Number(p.aq??p.score):0;
    const flowDelta=p&&Number.isFinite(Number(p.mainNet))?x.mainNet-Number(p.mainNet):0;
    const momentum=clamp(Math.round(50+aqDelta*5+flowDelta*8+x.speed*4),0,100);
    const trend=aqDelta>=4?"↑↑":aqDelta>=1?"↑":aqDelta<=-4?"↓↓":aqDelta<=-1?"↓":"→";
    // Top排序不只看“现在多强”，更看买点质量、追高风险和正在变强的速度
    const tradeScore=clamp(Math.round(x.aq*.44+x.mq*.32+(100-x.hr)*.16+momentum*.08),0,100);
    return{...x,aqDelta:+aqDelta.toFixed(1),flowDelta:+flowDelta.toFixed(2),momentum,trend,tradeScore};
  });
}
async function scanMarket(context){
  const started=Date.now();let pages=[];
  try{pages=await Promise.all(Array.from({length:12},(_,i)=>fetchPage(i+1,500)))}catch{pages=await Promise.all(Array.from({length:20},(_,i)=>fetchPage(i+1,200)))}
  const all=pages.flat(),unique=[...new Map(all.map(x=>[x.code,x])).values()],market=assessMarket(unique);
  const previous=await kvGetJson(context,KV_MARKET_KEY);
  let picks=unique.map(x=>calcMetrics(x,market)).filter(Boolean);
  picks=applyDynamics(picks,previous).sort((a,b)=>b.tradeScore-a.tradeScore||b.momentum-a.momentum||b.aq-a.aq||b.mainNet-a.mainNet);
  const trade=picks.filter(x=>["可进","等回踩","突破确认"].includes(x.signal)&&!x.hardVeto);
  const strong=trade.slice(0,8);
  const micro=picks.filter(x=>x.aq>=75&&!strong.some(s=>s.code===x.code)).slice(0,10);
  const body={ok:true,version:"AQ-V37.5-Beta3-P0",time:new Date().toISOString(),market,strongContra:strong.map((x,i)=>({...x,rank:i+1})),microContra:micro.map((x,i)=>({...x,rank:i+1})),allPicks:picks.slice(0,40).map((x,i)=>({...x,rank:i+1})),scanned:unique.length,coverage:"沪深A股分批扫描（排除688/北交所/ST/退市）",probabilityNote:"次日/3日为实时量价启发式估计；交易指令以AQ强度、MQ买点质量、HR追高风险及ΔAQ变化共同决定。",elapsedMs:Date.now()-started};
  context.waitUntil(kvPutJson(context,KV_MARKET_KEY,body,86400));
  return resp(body,200,{"cache-control":"public, max-age=30"});
}
async function queryQuotes(url,context){const codes=[...new Set((url.searchParams.get("codes")||"").split(",").map(x=>x.trim()).filter(validCode))].slice(0,50);if(!codes.length)return resp({ok:false,error:"没有有效代码"},400);const live=[];for(let i=0;i<codes.length;i+=10){const chunk=codes.slice(i,i+10),path="/api/qt/ulist.np/get?fltt=2&np=1&invt=2&fields="+FIELDS+"&secids="+encodeURIComponent(chunk.map(secid).join(","));const{j}=await east(path);live.push(...(j?.data?.diff||[]).map(normalize).filter(allowed))}const cached=await kvGetJson(context,KV_MARKET_KEY),market=cached?.market||{risk:50};let items=live.map(x=>calcMetrics(x,market)||({...x,score:0,aq:0,mq:0,hr:100,grade:"C",signal:"不买",decision:"不符合",action:"不参与"}));items=applyDynamics(items,cached);return resp({ok:true,time:new Date().toISOString(),count:items.length,items})}
export async function onRequestOptions(){return resp({ok:true})}
export async function onRequestGet(context){const url=new URL(context.request.url);try{if(url.searchParams.get("health")==="1")return resp({ok:true,service:"AQ-V37.5-Beta3-P0",time:new Date().toISOString(),kvEnabled:!!getKv(context)});if(url.searchParams.get("mode")==="scan")return await scanMarket(context);return await queryQuotes(url,context)}catch(e){const cached=await kvGetJson(context,KV_MARKET_KEY);if(cached){cached.stale=true;cached.warning=e.message;return resp(cached,200,{"cache-control":"no-store"})}return resp({ok:false,error:e.message||"接口异常"},502)}}
