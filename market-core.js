(function(root){
 const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 const median=values=>{const a=values.filter(valid).map(Number).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
 const sum=values=>values.some(valid)?values.filter(valid).reduce((s,x)=>s+Number(x),0):null;
 function rolling(dates,series,end,count){const window=dates.filter(d=>d<=end).slice(-count),map=new Map(series);const values=window.map(d=>map.get(d));return {value:window.length===count&&values.every(valid)?sum(values):null,covered:values.filter(valid).length,total:count};}
 function movingAverage(rows,size){return rows.map((_,i)=>i<size-1?null:sum(rows.slice(i-size+1,i+1).map(r=>r[2]))/size);}
 function stockStats(dates,series,end){let streak=0;const map=new Map(series),window=dates.filter(d=>d<=end);for(const d of window.slice().reverse()){if(!(map.get(d)>0))break;streak++;}const a=map.get(window.at(-1)),b=map.get(window.at(-2));return {flow5:rolling(dates,series,end,5),flow20:rolling(dates,series,end,20),streak,delta:valid(a)&&valid(b)?a-b:null};}
 function filterRows(rows,f){return rows.filter(r=>{
  if(f.query&&!`${r.name} ${r.code||''}`.toLowerCase().includes(f.query.toLowerCase()))return false;
  if(f.exchange&&f.exchange!=='all'&&r.exchange!==f.exchange)return false;
  if(f.noST&&/ST/i.test(r.name))return false;
  if(f.direction==='in'&&!(r.netFlow>0))return false;
  if(f.direction==='out'&&!(r.netFlow<0))return false;
  if(f.direction==='diverge'&&!(r.netFlow*r.changePct<0))return false;
  if(valid(f.peMax)&&!(r.pe>0&&r.pe<=Number(f.peMax)))return false;
  if(valid(f.capMin)&&!(r.marketCap>=Number(f.capMin)*1e8))return false;
  if(valid(f.turnMin)&&!(r.turnover>=Number(f.turnMin)))return false;
  if(valid(f.flowMin)&&!(r.netFlow>=Number(f.flowMin)*1e8))return false;
  if(f.preset==='strength'&&!(r.netFlow>0&&r.changePct>0))return false;
  if(f.preset==='persistent'&&!(r.stats?.streak>=3))return false;
  if(f.preset==='improving'&&!(r.stats?.delta>0))return false;
  return true;
 });}
 function sortRows(rows,key,direction=-1){const value=r=>key==='flow5'?r.stats?.flow5?.value:key==='flow20'?r.stats?.flow20?.value:key==='delta'?r.stats?.delta:r[key];return rows.slice().sort((a,b)=>{const x=value(a),y=value(b);return !valid(x)&&!valid(y)?0:!valid(x)?1:!valid(y)?-1:direction*(x-y);});}
 root.MarketCore={valid,median,sum,rolling,movingAverage,stockStats,filterRows,sortRows};
})(globalThis);
