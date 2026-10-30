'use strict';
(()=>{const button=document.getElementById('run'),status=document.getElementById('status'),list=document.getElementById('results');
const DBNAME='msw_fake_rollback_isolated_20261030_v01',STORE='fake_records';
const open=()=>new Promise((ok,no)=>{const r=indexedDB.open(DBNAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
const transact=(db,mode,fn)=>new Promise((ok,no)=>{const tx=db.transaction(STORE,mode),s=tx.objectStore(STORE);let result;tx.oncomplete=()=>ok(result);tx.onabort=()=>no(tx.error||Error('トランザクションが中止されました'));tx.onerror=()=>no(tx.error||Error('トランザクション失敗'));try{result=fn(s,tx)}catch(e){try{tx.abort()}catch{}no(e)}});
const read=(db,key)=>new Promise((ok,no)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(key);req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error)});
const check=(name,cond)=>{const li=document.createElement('li');li.textContent=(cond?'合格：':'不合格：')+name;list.append(li);if(!cond)throw Error(name)};
button.onclick=async()=>{button.disabled=true;list.replaceChildren();status.textContent='架空データベースを試験中…';let db;
try{db=await open();const original='FAKE-ORIGINAL-20261030';
await transact(db,'readwrite',s=>{s.put(original,'patient');s.put('FAKE-PHOTO-ORIGINAL','photo')});
check('開始前の架空記録',await read(db,'patient')===original);
let aborted=false;try{await transact(db,'readwrite',(s,tx)=>{s.put('FAKE-REPLACEMENT','patient');s.put('FAKE-PHOTO-REPLACEMENT','photo');tx.abort()})}catch{aborted=true}
check('復元途中の中断を検出',aborted);
check('中断時に元の患者記録を維持',(await read(db,'patient'))===original);
check('中断時に元の写真記録を維持',(await read(db,'photo'))==='FAKE-PHOTO-ORIGINAL');
await transact(db,'readwrite',s=>s.put('FAKE-STAGING-INCOMPLETE','staging'));
check('不完全な仮置きは患者記録へ反映されない',await read(db,'patient')===original);
status.textContent='合格：5 / 5件（架空データのみ）';
}catch(e){status.textContent='未合格・実行エラー：'+(e?.message||String(e))}finally{db?.close();button.disabled=false}
};
})();