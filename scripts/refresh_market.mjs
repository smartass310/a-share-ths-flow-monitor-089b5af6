import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTokenFactory, fetchDataset } from './update_data.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataPath=path.join(root,'data');
const now=new Date();
const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now);
const today=stamp.slice(0,10);
async function read(file,fallback=null){try{return JSON.parse(await fs.readFile(path.join(dataPath,file),'utf8'));}catch{return fallback;}}
async function write(file,data){const dest=path.join(dataPath,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest+'.tmp',JSON.stringify(data,null,2));await fs.rename(dest+'.tmp',dest);}
async function market(){
 const codes=['sh000001','sz399001','sz399006','sh000300','sh000688','bj899050'];
 const response=await fetch('https://qt.gtimg.cn/q='+codes.join(','),{signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error('指数行情 HTTP '+response.status);
 const text=new TextDecoder('gb18030').decode(await response.arrayBuffer());const indices=[];
 for(const match of text.matchAll(/v_(\w+)="([^"]*)"/g)){
  const f=match[2].split('~'),date=f[30];if(!codes.includes(match[1])||!/^\d{14}$/.test(date)||!Number.isFinite(Number(f[3]))||Number(f[3])<=0)continue;
  indices.push({code:match[1],name:f[1],price:Number(f[3]),changePct:Number(f[32]),change:Number(f[31]),date:`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`,time:`${date.slice(8,10)}:${date.slice(10,12)}`,amount:Number(f[37])*10000});
 }
 if(indices.length!==codes.length)throw new Error('指数行情不完整');
 const payload={source:'腾讯公开行情',generatedAt:stamp,indices};await write('market-data.json',payload);return payload;
}
function validate(rows,label,previous){
 const floor=label==='stocks'?1000:label==='concepts'?50:20;
 if(rows.length<floor||(previous?.length&&rows.length<previous.length*.85))throw new Error(label+' 覆盖数量异常，未覆盖旧快照');
 const keys=new Map();for(const row of rows){const id=row.code||row.name;if(!id)throw new Error(label+' 出现无名称记录');if(keys.has(id)&&JSON.stringify(keys.get(id))!==JSON.stringify(row))throw new Error(label+' 同一记录数据冲突');keys.set(id,row);if(row.netFlow===null||!Number.isFinite(row.netFlow))throw new Error(label+' 净流入缺失');}
 rows.splice(0,rows.length,...keys.values());
}
async function archive(payload){
 const date=payload?.meta?.tradingDay;if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
 await write(`history/${date}.json`,payload);
 const index=await read('history/index.json',{targetStart:'2024-09-24',entries:[]});
 const entry={date,generatedAt:payload.meta.generatedAt,stocks:payload.stocks.length,netFlow:payload.stocks.reduce((s,r)=>s+(r.netFlow||0),0),amount:payload.stocks.reduce((s,r)=>s+(r.amount||0),0)};index.entries=index.entries.filter(x=>x.date!==date).concat(entry).sort((a,b)=>a.date.localeCompare(b.date));await write('history/index.json',index);
}
const previous=await read('site-data.json');
if(previous)await archive(previous);
let quote;
try{quote=await market();}catch(e){const prior=await read('market-data.json',{indices:[]});await write('market-data.json',{...prior,lastAttempt:stamp,error:e.message});console.error(e.message);}
if(process.argv.includes('--indices-only'))process.exit(0);
try{
 if(!quote)throw new Error('无法核实交易日，资金更新暂停');
 const date=quote.indices.find(x=>x.code==='sh000001').date;
 if(date!==today||stamp.slice(11,16)<'15:15'){console.log('休市或尚未收盘，保留原资金快照');process.exit(0);}
 const token=await makeTokenFactory();
 const industries=await fetchDataset('industry',token);validate(industries,'industries',previous?.industries);
 const concepts=await fetchDataset('concept',token);validate(concepts,'concepts',previous?.concepts);
 const stocks=await fetchDataset('stock',token);validate(stocks,'stocks',previous?.stocks);
 for(const row of [...industries,...concepts,...stocks]){
  const denominator=row.category==='个股'?row.amount:(row.inflow===null||row.outflow===null?null:row.inflow+row.outflow);
  row.flowRate=denominator>0?Number((row.netFlow/denominator*100).toFixed(2)):null;
  if(row.changePct===null)row.status='数据缺失';
 }
 const payload={meta:{tradingDay:date,generatedAt:stamp,taxonomy:'同花顺行业 / 概念 / 个股',dataMode:'live',dataWarning:'资金页面未提供逐条行情日期；快照日期采用已核实的当日指数交易日，采集时间为收盘后。',dateBasis:'当日收盘后采集，指数交易日校验；资金源站无独立日期字段',fundFlowCoverage:{targetStart:'2024-09-24',statusText:'公开资金快照'},counts:{industries:industries.length,concepts:concepts.length,stocks:stocks.length}},industries,concepts,stocks};
 await archive(payload);await write('site-data.json',payload);console.log(`更新成功 ${date}: 行业 ${industries.length} / 概念 ${concepts.length} / 个股 ${stocks.length}`);
}catch(e){if(previous){previous.meta.lastAttempt=stamp;previous.meta.lastError=e.message;await write('site-data.json',previous);}console.error(e.message);process.exitCode=1;}
