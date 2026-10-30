'use strict';
(()=>{
const b=document.getElementById('start'),status=document.getElementById('status'),list=document.getElementById('results');
const a='a'.repeat(24),c='c'.repeat(24);
const file=(run,part,size=100)=>({name:'msw-split-'+run+'-'+part+'.json',size});
const part1=file(a,'0001'),part2=file(a,'0002'),manifest=file(a,'manifest');
const foreign=file(c,'0002');
const cases=[
['同一バックアップの3ファイルを段階的に選択',()=>{const m=new Map();return MSWSplitFileSelection.add(m,[part1]).ok&&MSWSplitFileSelection.add(m,[part2,manifest]).ok&&m.size===3}],
['同じ選択内のファイル名重複を拒否',()=>{const m=new Map();const r=MSWSplitFileSelection.add(m,[part1,part1]);return !r.ok&&m.size===0}],
['追加選択によるファイル名重複を拒否',()=>{const m=new Map();MSWSplitFileSelection.add(m,[part1]);const r=MSWSplitFileSelection.add(m,[part1]);return !r.ok&&m.size===0}],
['同じ選択内の異なるバックアップ混在を拒否',()=>{const m=new Map();const r=MSWSplitFileSelection.add(m,[part1,foreign]);return !r.ok&&m.size===0}],
['追加選択による異なるバックアップ混在を拒否',()=>{const m=new Map();MSWSplitFileSelection.add(m,[part1]);const r=MSWSplitFileSelection.add(m,[foreign]);return !r.ok&&m.size===0}],
['不正なファイル名を拒否',()=>{const m=new Map();const r=MSWSplitFileSelection.add(m,[{name:'patient-data.json',size:100}]);return !r.ok&&m.size===0}],
['最大48MiBを超える分割パートを拒否',()=>{const m=new Map();const r=MSWSplitFileSelection.add(m,[file(a,'0001',48*1024*1024+1)]);return !r.ok&&m.size===0}],
['1MiBを超える管理ファイルを拒否',()=>{const m=new Map();const r=MSWSplitFileSelection.add(m,[file(a,'manifest',1024*1024+1)]);return !r.ok&&m.size===0}],
['空のパートファイルを拒否',()=>{const m=new Map();const r=MSWSplitFileSelection.add(m,[file(a,'0001',0)]);return !r.ok&&m.size===0}],
['0000の不正パート番号を拒否',()=>{const m=new Map();const r=MSWSplitFileSelection.add(m,[file(a,'0000')]);return !r.ok&&m.size===0}],
];
b.addEventListener('click',async()=>{
 b.disabled=true;list.replaceChildren();status.textContent='架空ファイル情報を検査中…';
 let ok=0;for(const [name,test] of cases){let passed=false;let detail='';try{passed=!!test()}catch(e){detail='：'+(e?.message||String(e))}
 const li=document.createElement('li');li.textContent=(passed?'合格：':'不合格：')+name+detail;list.append(li);if(passed)ok++}
 status.textContent=(ok===cases.length?'合格':'不合格')+'：'+ok+' / '+cases.length+'件（架空情報のみ）';b.disabled=false
});
})();