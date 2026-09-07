import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {parseNumber,moneyToYuan,parseStockRow} from './update_data.mjs';

assert.equal(parseNumber('--'),null);
assert.equal(parseNumber('未知'),null);
assert.equal(parseNumber('0'),0);
assert.equal(parseNumber('-2.15%'),-2.15);
assert.equal(moneyToYuan('300万','亿'),3000000);
assert.equal(moneyToYuan('--','亿'),null);
assert.equal(moneyToYuan('-1.2亿'),-120000000);
const stock=parseStockRow(['1','000001','测试','10.2','-2%','1.2%','1亿','1.2亿','-2000万','2.2亿']);
assert.equal(stock.netFlow,-20000000);assert.equal(stock.amount,220000000);

const data=JSON.parse(await fs.readFile('data/site-data.json','utf8'));
for(const type of ['stocks','industries','concepts']){
 assert.ok(data[type].length>0);const ids=data[type].map(r=>r.code||r.name);assert.equal(ids.length,new Set(ids).size);
}
const elements=new Map();
const context2d=new Proxy({}, {get:(_,name)=>()=>{},set:()=>true});
const element=()=>({innerHTML:'',textContent:'',value:'20',hidden:false,disabled:false,dataset:{},classList:{toggle(){}},setAttribute(){},insertAdjacentHTML(_,text){this.innerHTML+=text;},getBoundingClientRect(){return {width:720,height:220,left:0};},getContext(){return context2d;},showModal(){},close(){}});
const doc={querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s);},querySelectorAll(){return [];},addEventListener(){}};
const context=vm.createContext({document:doc,window:{addEventListener(){}},location:{hash:'#overview'},localStorage:{getItem(){return '[]';}},setTimeout,clearTimeout,console,Date,devicePixelRatio:1,URL,Blob,fetch(){throw new Error('Unexpected fetch in render test');}});
const code=(await fs.readFile('app.js','utf8')).replace(/load\(\);\s*$/,'');vm.runInContext(code,context);
context.fixture=data;context.marketFixture=JSON.parse(await fs.readFile('data/market-data.json','utf8'));context.historyFixture=JSON.parse(await fs.readFile('data/history/index.json','utf8')).entries;
vm.runInContext('state.data=fixture;state.market=marketFixture;state.archive=historyFixture;',context);
for(const view of ['overview','industry','concept','stock','watch','report','sources']){
 context.location.hash='#'+view;vm.runInContext('render()',context);assert.ok(doc.querySelector('#content').innerHTML.length>100,view);
}
context.location.hash='#stock';vm.runInContext('render();state.query=fixture.stocks[0].code;renderTable();',context);assert.equal(vm.runInContext('rows().length',context),1);
vm.runInContext("state.query='';state.filter='out';",context);assert.ok(vm.runInContext('rows().every(r=>r.netFlow<0)',context));
vm.runInContext("state.filter='all';state.query='<img onerror=alert(1)>';explorer();",context);assert.ok(!doc.querySelector('#content').innerHTML.includes('value="<img'));
assert.equal(vm.runInContext('money(null)',context),'--');assert.equal(vm.runInContext('pct(0)',context),'0.00%');
context.location.hash='#overview';vm.runInContext('state.data={meta:{},stocks:[],industries:[],concepts:[]};state.archive=[];state.market=null;render();',context);
console.log('PASS: parsing, missing values, money units, unique datasets, seven views, search, filter, escaping, empty state');
