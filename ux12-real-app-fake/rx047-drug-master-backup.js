'use strict';
/* RX047: Drug-master-only encrypted portable backup.
 * DOES NOT export patients, patient prescriptions, photos, journal, PIN or settings.
 * The export is protected with its own 12+ character passphrase.
 * Tested separately from clinical use; never auto-import or alter patient records.
 */
(function(root){
  const FORMAT='MSW-RX-MASTER-BACKUP', VERSION=1;
  const ITERATIONS=250000, FILE_LIMIT=20*1024*1024, DATA_LIMIT=12*1024*1024;
  const encoder=new TextEncoder(), decoder=new TextDecoder();

  function bytesToB64(bytes){
    let out='';for(let i=0;i<bytes.length;i+=8192)
      out+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(out);
  }
  function b64ToBytes(s,expected){
    if(typeof s!=='string'||!s.length||s.length>FILE_LIMIT*2||
       !/^[A-Za-z0-9+/]+={0,2}$/.test(s))throw Error('暗号化ファイルの形式が不正です');
    const str=atob(s),bytes=Uint8Array.from(str,c=>c.charCodeAt(0));
    if(expected&&bytes.length!==expected)throw Error('暗号化ファイルの長さが不正です');
    return bytes;
  }
  function checkPassword(pass){
    if(typeof pass!=='string'||pass.length<12||pass.length>256||
       !/[0-9]/.test(pass)||!/\p{L}/u.test(pass))
      throw Error('専用パスフレーズは12文字以上で、文字と数字を含めてください');
  }
  function checkDrugs(drugs){
    if(!Array.isArray(drugs)||drugs.length>10000)throw Error('薬情件数が不正です');
    for(const d of drugs){
      if(!d||typeof d!=='object'||Array.isArray(d)||
         typeof d['薬名']!=='string'||!d['薬名'].trim())
        throw Error('薬情データの形式が不正です');
    }
    const json=JSON.stringify(drugs);
    if(!json||encoder.encode(json).length>DATA_LIMIT)throw Error('薬情データが容量上限を超えています');
    return JSON.parse(json);
  }
  function associatedData(date,count){
    return encoder.encode(FORMAT+'|'+VERSION+'|'+date+'|'+count);
  }
  async function makeKey(pass,salt){
    const material=await crypto.subtle.importKey('raw',encoder.encode(pass),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},
      material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function seal(drugs,pass){
    checkPassword(pass);
    const clean=checkDrugs(drugs);
    const date=new Date().toISOString(),salt=crypto.getRandomValues(new Uint8Array(16)),
      iv=crypto.getRandomValues(new Uint8Array(12)),secret=await makeKey(pass,salt);
    const plaintext=encoder.encode(JSON.stringify({drugs:clean}));
    const ciphertext=await crypto.subtle.encrypt(
      {name:'AES-GCM',iv,additionalData:associatedData(date,clean.length)},secret,plaintext);
    return {format:FORMAT,version:VERSION,createdAt:date,itemCount:clean.length,
      cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:ITERATIONS,
      salt:bytesToB64(salt),iv:bytesToB64(iv),
      ciphertext:bytesToB64(new Uint8Array(ciphertext))};
  }
  async function unseal(packet,pass){
    checkPassword(pass);
    if(!packet||typeof packet!=='object'||Array.isArray(packet)||
       packet.format!==FORMAT||packet.version!==VERSION||
       packet.cipher!=='AES-256-GCM'||packet.kdf!=='PBKDF2-SHA256'||
       packet.iterations!==ITERATIONS||
       typeof packet.createdAt!=='string'||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(packet.createdAt)||
       !Number.isSafeInteger(packet.itemCount)||packet.itemCount<0||packet.itemCount>10000)
      throw Error('対応していない薬情バックアップ形式です');
    const salt=b64ToBytes(packet.salt,16),iv=b64ToBytes(packet.iv,12);
    const encrypted=b64ToBytes(packet.ciphertext);
    if(encrypted.length>DATA_LIMIT+65536)throw Error('薬情バックアップが大きすぎます');
    const secret=await makeKey(pass,salt);
    let plaintext;
    try{
      plaintext=await crypto.subtle.decrypt(
        {name:'AES-GCM',iv,additionalData:associatedData(packet.createdAt,packet.itemCount)},
        secret,encrypted);
    }catch(e){throw Error('パスフレーズが違うか、バックアップが破損しています');}
    let data;
    try{data=JSON.parse(decoder.decode(plaintext));}
    catch(e){throw Error('復号した薬情データを読み取れません');}
    if(!data||typeof data!=='object'||Array.isArray(data)||
       Object.keys(data).length!==1||!Object.hasOwn(data,'drugs'))
      throw Error('薬情だけのバックアップではありません');
    const drugs=checkDrugs(data.drugs);
    if(drugs.length!==packet.itemCount)throw Error('薬情件数が一致しません');
    return drugs;
  }
  root.MSWRX047Core=Object.freeze({format:FORMAT,version:VERSION,fileLimit:FILE_LIMIT,seal,unseal,checkDrugs});

  if(typeof renderSettings!=='function'||typeof beginMaintenance!=='function')return;
  const previousSettings=renderSettings;
  let busy=false;

  function showMessage(message){
    const el=document.getElementById('rx047Status');
    if(el)el.textContent=message;
  }
  function checkSession(reference){
    if(!key||!state||state!==reference)throw Error('ロック状態が変わりました。もう一度開き直してください');
  }
  async function exportMaster(){
    if(busy)return;
    if(!key||!state){alert('ロックを解除してください');return;}
    const pass=prompt('薬情バックアップ専用のパスフレーズ（12文字以上・文字＋数字）を設定してください。アプリの暗証番号とは別に管理してください。');
    if(pass===null)return;
    const repeat=prompt('確認のため、同じ専用パスフレーズをもう一度入力してください');
    if(repeat===null)return;
    if(pass!==repeat){alert('パスフレーズが一致しません');return;}
    let started=false;busy=true;
    try{
      await beginMaintenance('薬情専用バックアップ書出');started=true;
      const reference=state;
      const copy=MSWRX047Core.checkDrugs(reference.drugs||[]);
      const pack=await MSWRX047Core.seal(copy,pass);
      checkSession(reference);
      const blob=new Blob([JSON.stringify(pack)],{type:'application/octet-stream'});
      if(blob.size>FILE_LIMIT)throw Error('薬情ファイルが容量上限を超えています');
      const stamp=pack.createdAt.slice(0,10).replace(/-/g,'');
      download(blob,'MSW_薬情バックアップ_'+stamp+'.mswrx');
      showMessage('薬情 '+copy.length+' 件を暗号化して書き出しました。「ファイル」アプリで実物を確認してください。復元保証ではありません。');
    }catch(e){
      showMessage('書出失敗：'+(e&&e.message?e.message:'処理に失敗しました'));
    }finally{if(started)endMaintenance('薬情専用バックアップ書出');busy=false;}
  }
  async function importMaster(file){
    if(busy)return;
    if(!file||!Number.isFinite(file.size)||file.size>FILE_LIMIT||file.size<64){
      alert('薬情バックアップのサイズが不正です');return;
    }
    const pass=prompt('この薬情バックアップを作成したときの専用パスフレーズを入力してください');
    if(pass===null)return;
    let started=false;busy=true;
    try{
      await beginMaintenance('薬情専用バックアップ復元');started=true;
      const reference=state,activeKey=key;
      const pack=JSON.parse(await file.text());
      const drugs=await MSWRX047Core.unseal(pack,pass);
      checkSession(reference);
      if(!confirm('【薬情だけを置換】\n現在 '+(reference.drugs||[]).length+' 件 → バックアップ '+drugs.length+' 件\n\n患者情報・処方薬・写真・日誌・その他のマスターは変更しません。\n薬情の現在の内容は上書きされます。復元しますか？'))return;
      checkSession(reference);
      const next=JSON.parse(JSON.stringify(reference));
      next.drugs=drugs;
      next.updatedAt=new Date().toISOString();
      // Save the whole encrypted index in ONE IndexedDB put. No partial writes,
      // and never call the normal save() during the maintenance lock.
      await orderedDataWrite(async()=>{
        const encrypted=await encryptPatientIndex(next,activeKey);
        checkSession(reference);
        await idbSet('data',encrypted);
      });
      state=next;
      showMessage('薬情 '+drugs.length+' 件を復元しました。患者情報・写真は変更していません。');
      alert('薬情 '+drugs.length+' 件を復元しました。画面で薬情一覧を確認してください。');
    }catch(e){
      showMessage('復元失敗：'+(e&&e.message?e.message:'ファイルを確認してください'));
    }finally{if(started)endMaintenance('薬情専用バックアップ復元');busy=false;}
  }
  renderSettings=async function(){
    await previousSettings();
    if(screen!=='settings'||!key||!state||!document.getElementById('backup')||document.getElementById('rx047Panel'))return;
    const old=document.getElementById('backup').closest('.panel');
    if(!old)return;
    const panel=document.createElement('section');
    panel.className='panel';panel.id='rx047Panel';
    panel.innerHTML='<h3>薬情だけの軽量バックアップ（試験機能 RX047）</h3>'+
      '<p class="notice">薬情の先発品・後発品・規格・薬価など全項目を暗号化します。患者情報・処方薬・写真・日誌は含めません。復元時は薬情のみ入れ替えます。専用パスフレーズを忘れると復元できません。</p>'+
      '<div class="settings-row"><div><b>薬情だけを暗号化保存</b><small>写真容量の120MB制限とは無関係。患者情報を含みません。</small></div><button class="btn secondary" type="button" id="rx047Export">薬情を保存</button></div>'+
      '<div class="settings-row"><div><b>薬情だけを復元</b><small>.mswrx ファイルから薬情マスターのみ置換。実行前に件数を確認します。</small></div><button class="btn secondary" type="button" id="rx047Import">薬情を復元</button></div>'+
      '<p class="notice" id="rx047Status" role="status" aria-live="polite"></p>';
    old.parentNode.insertBefore(panel,old);
    document.getElementById('rx047Export').onclick=()=>{void exportMaster();};
    document.getElementById('rx047Import').onclick=()=>pickFile('.mswrx,application/octet-stream',importMaster);
  };
})(window);
