import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data');
const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
const read=async(file,fallback=null)=>{try{return JSON.parse(await fs.readFile(path.join(root,file),'utf8'));}catch{return fallback;}};
const save=async(file,d)=>{await fs.writeFile(path.join(root,file)+'.tmp',JSON.stringify(d));await fs.rename(path.join(root,file)+'.tmp',path.join(root,file));};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const number=v=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
const symbol=code=>(/^6/.test(code)?'sh':/^[03]/.test(code)?'sz':'bj')+code;
async function fetchRetry(url,type='json'){
 let error;for(let n=0;n<3;n++){try{const r=await fetch(url,{signal:AbortSignal.timeout(18000)});if(!r.ok)throw new Error('HTTP '+r.status);return type==='json'?await r.json():new TextDecoder('gb18030').decode(await r.arrayBuffer());}catch(e){error=e;await delay(500*(n+1));}}throw error;
}
export function parseQuote(code,fields){
 if(!/^\d{14}$/.test(fields[30]||'')||number(fields[3])===null)return null;
 const t=fields[30];return {code,name:fields[1],price:number(fields[3]),previous:number(fields[4]),open:number(fields[5]),changePct:number(fields[32]),high:number(fields[33]),low:number(fields[34]),amount:number(fields[37])===null?null:number(fields[37])*10000,turnover:number(fields[38]),pe:number(fields[39]),pb:number(fields[46]),marketCap:number(fields[45])===null?null:number(fields[45])*1e8,floatCap:number(fields[44])===null?null:number(fields[44])*1e8,limitUp:number(fields[47]),limitDown:number(fields[48]),date:`${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}`,time:`${t.slice(8,10)}:${t.slice(10,12)}`};
}
async function quotes(data){
 const records={},missing=[];
 for(let i=0;i<data.stocks.length;i+=70){const codes=data.stocks.slice(i,i+70).map(r=>r.code);try{
  const text=await fetchRetry('https://qt.gtimg.cn/q='+codes.map(symbol).join(','),'text');
  for(const match of text.matchAll(/v_\w{2}(\d{6})="([^"]*)"/g)){const q=parseQuote(match[1],match[2].split('~'));if(q)records[q.code]=q;}
 }catch{missing.push(...codes);}if(i%700===0)console.log(`行情采集 ${i}/${data.stocks.length}`);}
 for(const row of data.stocks)if(!records[row.code]&&!missing.includes(row.code))missing.push(row.code);
 if(Object.keys(records).length<data.stocks.length*.9)throw new Error('行情覆盖不足90%，保留旧文件');
 await save('quotes.json',{source:'腾讯公开行情',generatedAt:stamp,asOf:data.meta.tradingDay,records,missing});
}
async function indexHistory(){
 const indices=['sh000001','sz399001','sz399006','sh000300','sh000688','bj899050'],records={};
 for(const code of indices){try{const d=await fetchRetry(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,2024-09-24,,640,`);const r=d.data?.[code]?.day;if(!r?.length)throw new Error('空数据');records[code]=r.map(x=>[x[0],...x.slice(1,6).map(Number)]);}catch{records[code]=[];}}
 if(!records.sh000001?.length)throw new Error('交易日期序列不可用');
 await save('index-history.json',{source:'腾讯公开日线 · 不复权',generatedAt:stamp,records});
}
async function events(){
 const previous=await read('events.json',{news:[],announcements:[]}),errors=[];let news=previous.news,announcements=previous.announcements,newsAt=previous.newsAt,announcementsAt=previous.announcementsAt;
 try{const d=await fetchRetry('https://np-weblist.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102&sortEnd=&pageSize=100&req_trace='+Date.now());if(!Array.isArray(d.data?.fastNewsList))throw new Error('结构变化');news=d.data.fastNewsList.filter(x=>x.title).map(x=>({id:x.code,title:x.title,time:x.showTime,url:`https://finance.eastmoney.com/a/${x.code}.html`,codes:(x.stockList||[]).filter(x=>/^[01]\.\d{6}$/.test(x)).map(x=>x.split('.')[1])}));newsAt=stamp;}catch(e){errors.push('快讯：'+e.message);}
 try{const result=[];for(let page=1;page<=3;page++){const d=await fetchRetry(`https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=100&page_index=${page}&ann_type=A&client_source=web&f_node=0&s_node=0`);if(!Array.isArray(d.data?.list))throw new Error('结构变化');result.push(...d.data.list);}announcements=result.map(x=>({id:x.art_code,title:x.title,time:x.display_time?.slice(0,19),noticeDate:x.notice_date?.slice(0,10),category:x.columns?.[0]?.column_name||'公告',codes:(x.codes||[]).map(c=>c.stock_code),names:(x.codes||[]).map(c=>c.short_name),url:`https://data.eastmoney.com/notices/detail/${x.codes?.[0]?.stock_code||'000001'}/${x.art_code}.html`}));announcementsAt=stamp;}catch(e){errors.push('公告：'+e.message);}
 await save('events.json',{source:'东方财富公开快讯与公告索引',generatedAt:stamp,newsAt,announcementsAt,news,announcements,errors});
}
export function windowFlow(dates,byDate,id,size){const window=dates.slice(-size);if(window.length<size)return {value:null,covered:window.length,total:size};let sum=0,covered=0;for(const date of window){const v=byDate[date]?.[id];if(v!==null&&v!==undefined&&Number.isFinite(v)){sum+=v;covered++;}}return {value:covered===size?sum:null,covered,total:size};}
async function analytics(data){
 const calendar=await read('index-history.json');const dates=(calendar?.records.sh000001||[]).map(r=>r[0]).filter(d=>d<=data.meta.tradingDay);const history=await read('history/index.json',{entries:[]});const boardSeries={},stockFlows={},boardFlows={},stockStats={};
 for(const entry of history.entries){const d=await read(`history/${entry.date}.json`);if(!d)continue;stockFlows[entry.date]={};boardFlows[entry.date]={};for(const r of d.stocks||[])stockFlows[entry.date][r.code]=r.netFlow;for(const r of [...d.industries,...d.concepts]){const id=r.category+':'+r.name;boardFlows[entry.date][id]=r.netFlow;(boardSeries[id]??=[]).push([entry.date,r.netFlow,r.changePct]);}}
 function stats(id,flows){let streak=0;for(const date of dates.slice().reverse()){const v=flows[date]?.[id];if(!(v>0))break;streak++;}const last=dates.at(-1),prior=dates.at(-2),a=flows[last]?.[id],b=flows[prior]?.[id];return {flow5:windowFlow(dates,flows,id,5),flow20:windowFlow(dates,flows,id,20),streak,delta:a!=null&&b!=null?a-b:null};}
 const boardStats={};for(const r of data.stocks)stockStats[r.code]=stats(r.code,stockFlows);for(const id of Object.keys(boardSeries))boardStats[id]=stats(id,boardFlows);
 await save('analytics.json',{asOf:data.meta.tradingDay,generatedAt:stamp,calendar:dates,availableDates:history.entries.map(x=>x.date),boardSeries,boardStats,stockStats});
 await save('stock-flows.json',{dates:history.entries.map(x=>x.date),records:Object.fromEntries(data.stocks.map(r=>[r.code,history.entries.map(x=>stockFlows[x.date]?.[r.code]??null)]))});
}
async function financials(data){
 const records={},universe=new Set(data.stocks.map(r=>r.code));
 const params={reportName:'RPT_LICO_FN_CPD',columns:'SECURITY_CODE,REPORTDATE,TOTAL_OPERATE_INCOME,PARENT_NETPROFIT,WEIGHTAVG_ROE,YSTZ,SJLTZ,BASIC_EPS,MGJYXJJE,XSMLL,NOTICE_DATE,DATATYPE',filter:'(SECURITY_TYPE_CODE="058001001")(REPORTDATE>=\'2024-09-24\')',pageSize:'500',sortColumns:'REPORTDATE,SECURITY_CODE',sortTypes:'-1,1',source:'WEB',client:'WEB'};
 let pages=1;
 for(let page=1;page<=pages;page++){
  const url=new URL('https://datacenter-web.eastmoney.com/api/data/v1/get');url.search=new URLSearchParams({...params,pageNumber:String(page)});
  const d=await fetchRetry(url);if(!d.success||!Array.isArray(d.result?.data))throw new Error('财报数据结构异常');
  pages=d.result.pages;if(!Number.isInteger(pages)||pages<1||pages>180)throw new Error('财报分页数异常');
  for(const r of d.result.data){if(!universe.has(r.SECURITY_CODE))continue;const item={period:r.REPORTDATE.slice(0,10),type:r.DATATYPE,noticeDate:r.NOTICE_DATE?.slice(0,10),revenue:number(r.TOTAL_OPERATE_INCOME),profit:number(r.PARENT_NETPROFIT),revenueGrowth:number(r.YSTZ),profitGrowth:number(r.SJLTZ),roe:number(r.WEIGHTAVG_ROE),eps:number(r.BASIC_EPS),cashPerShare:number(r.MGJYXJJE),grossMargin:number(r.XSMLL)};
   const list=records[r.SECURITY_CODE]??=[];const index=list.findIndex(x=>x.period===item.period);if(index<0)list.push(item);else if((item.noticeDate||'')>(list[index].noticeDate||''))list[index]=item;
  }
  if(page%20===0)console.log(`财报采集 ${page}/${pages}`);await delay(60);
 }
 for(const list of Object.values(records))list.sort((a,b)=>b.period.localeCompare(a.period));
 if(Object.keys(records).length<universe.size*.8)throw new Error('财报覆盖不足80%，保留原文件');
 await saveFinancialRecords({source:'东方财富公开财务摘要',generatedAt:stamp,start:'2024-09-24',records,missing:[...universe].filter(c=>!records[c])});
}
export async function saveFinancialRecords(payload){const groups={};for(const [code,rows] of Object.entries(payload.records)){(groups[code.slice(0,3)]??={})[code]=rows;}await fs.mkdir(path.join(root,'financials'),{recursive:true});for(const [prefix,records] of Object.entries(groups))await save('financials/'+prefix+'.json',{records});const {records,...meta}=payload;await save('financials.json',{...meta,count:Object.keys(records).length,shards:Object.keys(groups)});}
export async function main(){const data=await read('site-data.json');if(!data)throw new Error('缺少资金快照');let failures=0;const status={lastAttempt:stamp,sources:{}};const jobs=process.argv.includes('--financials-only')?[['财报摘要',()=>financials(data)]]:[['行情',()=>quotes(data)],['指数历史',indexHistory],['快讯与公告',events],['历史分析',()=>analytics(data)],['财报摘要',()=>financials(data)]];for(const [name,fn] of jobs){try{await fn();status.sources[name]={ok:true};console.log(name+' 已更新');}catch(e){failures++;status.sources[name]={ok:false,error:e.message};console.error(name+'：'+e.message);}}await save('research-status.json',status);if(failures)process.exitCode=1;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
