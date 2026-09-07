import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data/history');
await fs.mkdir(root,{recursive:true});
const response=await fetch('https://api.github.com/repos/smartass310/a-share-ths-flow-monitor-089b5af6/commits?path=data/site-data.json&per_page=100',{signal:AbortSignal.timeout(25000)});
if(!response.ok)throw new Error('历史版本列表 HTTP '+response.status);
const commits=await response.json();
let recovered=0;
for(const commit of commits.reverse()){
 try{
  const r=await fetch(`https://raw.githubusercontent.com/smartass310/a-share-ths-flow-monitor-089b5af6/${commit.sha}/data/site-data.json`,{signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json(),date=d.meta?.tradingDay;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!d.stocks?.length||/失败/.test(d.meta.dataWarning||''))continue;
  d.meta.recoveredFrom=commit.sha;
  const dest=path.join(root,date+'.json');
  let old;try{old=JSON.parse(await fs.readFile(dest,'utf8'));}catch{}
  if(old?.meta.generatedAt>d.meta.generatedAt)continue;
  await fs.writeFile(dest,JSON.stringify(d));recovered++;
 }catch(e){console.error(commit.sha.slice(0,7),e.message);}
}
const entries=[];
for(const file of await fs.readdir(root)){
 if(!/^\d{4}-\d{2}-\d{2}\.json$/.test(file))continue;
 const d=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
 entries.push({date:d.meta.tradingDay,generatedAt:d.meta.generatedAt,stocks:d.stocks.length,netFlow:d.stocks.reduce((s,r)=>s+(r.netFlow||0),0),amount:d.stocks.reduce((s,r)=>s+(r.amount||0),0)});
}
await fs.writeFile(path.join(root,'index.json'),JSON.stringify({targetStart:'2024-09-24',entries:entries.sort((a,b)=>a.date.localeCompare(b.date))},null,2));
console.log(`恢复 ${recovered} 个版本，已保存 ${entries.length} 个日期`);
