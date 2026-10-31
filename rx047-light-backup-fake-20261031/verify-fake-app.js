'use strict';
(function(){
 const el=id=>document.getElementById(id);
 let passed=0,total=0,fail=[];
 function result(label,ok){
   total++;if(ok)passed++;else fail.push(label);
   const li=document.createElement('li');
   li.textContent=(ok?'合格　':'不合格　')+label;
   li.style.color=ok?'#067545':'#a22';el('results').appendChild(li);
 }
 function eq(a,b){return JSON.stringify(a)===JSON.stringify(b)}
 function pause(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
 async function until(check,limitMs=18000){
   const end=Date.now()+limitMs;
   while(Date.now()<end){
     if(await check())return;
     await pause(100);
   }
   throw Error('処理の完了を確認できませんでした');
 }
 async function run(){
   el('results').replaceChildren();el('status').textContent='架空アプリで本物のWebCryptoとIndexedDBを検証中…';
   try{
     if(!crypto.subtle||!indexedDB)throw Error('iPadの暗号化/保存機能を利用できません');
     db=await openFakeDB();
     key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
     state=createFakeState();
     const original=JSON.parse(JSON.stringify(state));
     const photoRecord={fakePhoto:'架空写真の位置を保護'};
     await idbSet('photo:FAKE-001',photoRecord);
     await renderSettings();
     result('薬情専用の保存・復元ボタンが設定画面に表示',!!el('rx047Export')&&!!el('rx047Import'));
     el('rx047Export').click();
     await until(()=>!!chosenBlob&&el('rx047Status')?.textContent.includes('暗号化して書き出しました')&&maintenanceAction===null);
     const sealed=JSON.parse(await chosenBlob.text());
     result('実際の保存ボタンで暗号化ファイル作成',sealed.format==='MSW-RX-MASTER-BACKUP'&&sealed.itemCount===2&&chosenName.endsWith('.mswrx'));
     const string=await chosenBlob.text();
     result('ファイルに患者情報・薬剤名・PINが平文で含まれない',
       !string.includes('架空患者・検証用')&&!string.includes('架空薬A')&&!string.includes('FAKE-001')&&!('patients'in sealed)&&!('photos'in sealed));
     const recovered=await MSWRX047Core.unseal(sealed,'FAKE-Lab-Passphrase2026');
     result('入れ子の先発・後発・規格と薬価が完全一致',eq(recovered,sampleDrugs));
     state.drugs=[{'薬名':'置換前の架空薬'}];
     el('rx047Import').click();
     await until(()=>approved===1&&state.drugs.length===2&&maintenanceAction===null);
     result('実際の復元ボタンで薬情だけを置換',approved===1&&eq(state.drugs,sampleDrugs));
     const persisted=await idbGet('data');
     const saved=await decryptObj(persisted);
     result('暗号化してIndexedDBに保存後も薬情が一致',eq(saved.drugs,sampleDrugs)&&!!persisted.ct&&!JSON.stringify(persisted).includes('架空薬A'));
     result('患者・日誌・設定・他マスターが保存前後で不変',
       eq(saved.patients,original.patients)&&eq(saved.journal,original.journal)&&eq(saved.settings,original.settings)&&eq(saved.masters,original.masters));
     result('別レコードの架空写真は変更されない',eq(await idbGet('photo:FAKE-001'),photoRecord));
     el('status').textContent=passed+'/'+total+'件合格'+(fail.length?' ― 不合格:'+fail.join(', '):' ― 薬情だけの復元と患者データの保護を確認');
     el('status').style.color=fail.length?'#a22':'#067545';
   }catch(e){
     el('status').textContent='検証できませんでした：'+(e?.message||String(e));
     el('status').style.color='#a22';
   }
 }
 void run();
})();
