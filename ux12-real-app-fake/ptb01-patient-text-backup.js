'use strict';
/* PTB01: Encrypted, photo-free patient text backup.
 * Does not export or read encrypted photo records, PIN, drugs or master tables.
 * Recovery is deliberately restricted to a fresh, empty patient database.
 * Do not merge into clinical main until isolated iPad export/import has passed.
 */
(function(root){
  const FORMAT='MSW-PATIENT-TEXT-BACKUP', VERSION=1, ITERATIONS=250000;
  const FILE_LIMIT=32*1024*1024, DATA_LIMIT=20*1024*1024, MAX_PATIENTS=5000;
  const enc=new TextEncoder(), dec=new TextDecoder();
  function b64(bytes){
    let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(out);
  }
  function unb64(s,expected){
    if(typeof s!=='string'||!s.length||s.length>FILE_LIMIT*2||
       !/^[A-Za-z0-9+/]+={0,2}$/.test(s))throw Error('暗号化ファイルが不正です');
    const out=Uint8Array.from(atob(s),x=>x.charCodeAt(0));
    if(expected&&out.length!==expected)throw Error('暗号化データの長さが違います');
    return out;
  }
  function password(pass){
    if(typeof pass!=='string'||pass.length<12||pass.length>256||
       !/[0-9]/.test(pass)||!/\p{L}/u.test(pass))
      throw Error('専用パスフレーズは12文字以上・文字と数字を含めてください');
  }
  function checkPatients(patients,{fromFile=false}={}){
    if(!Array.isArray(patients)||patients.length>MAX_PATIENTS)throw Error('患者件数が不正です');
    const ids=new Set();
    const copy=patients.map(p=>{
      if(!p||typeof p!=='object'||Array.isArray(p)||
         typeof p.id!=='string'||!p.id||p.id.length>200||
         ids.has(p.id)||!p.data||typeof p.data!=='object'||Array.isArray(p.data))
        throw Error('患者情報の形式・IDが不正です');
      ids.add(p.id);
      if(fromFile&&Object.prototype.hasOwnProperty.call(p,'attachments'))
        throw Error('写真参照を含むファイルは取り込めません');
      for(const field of ['tasks','notes','medications']){
        if(p[field]!==undefined&&!Array.isArray(p[field]))throw Error('患者記録の形式が不正です');
      }
      // Attachment references must never survive a photo-free restoration:
      // otherwise the UI would offer buttons for images that cannot exist.
      const item=JSON.parse(JSON.stringify(p));
      delete item.attachments;
      delete item._new;
      return item;
    });
    const json=JSON.stringify(copy);
    if(enc.encode(json).length>DATA_LIMIT)throw Error('患者文字情報が容量上限を超えています');
    if(/data:image\/[a-z0-9.+-]+;base64,/i.test(json))
      throw Error('文字情報に画像データが含まれています。保存を中止しました');
    return copy;
  }
  function aad(when,count,excluded){
    return enc.encode(FORMAT+'|'+VERSION+'|'+when+'|'+count+'|'+excluded);
  }
  async function keyFor(pass,salt){
    const material=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},
      material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function seal(patients,pass,excludedPhotos=0){
    password(pass);
    if(!Number.isSafeInteger(excludedPhotos)||excludedPhotos<0||excludedPhotos>100000)
      throw Error('除外写真枚数が不正です');
    const clean=checkPatients(patients);
    const createdAt=new Date().toISOString();
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const secret=await keyFor(pass,salt);
    const plain=enc.encode(JSON.stringify({patients:clean}));
    const cipher=await crypto.subtle.encrypt(
      {name:'AES-GCM',iv,additionalData:aad(createdAt,clean.length,excludedPhotos)},
      secret,plain);
    return {format:FORMAT,version:VERSION,createdAt,patientCount:clean.length,
      photoCountExcluded:excludedPhotos,photosIncluded:false,
      cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:ITERATIONS,
      salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(cipher))};
  }
  async function unseal(packet,pass){
    password(pass);
    if(!packet||typeof packet!=='object'||Array.isArray(packet)||
       packet.format!==FORMAT||packet.version!==VERSION||
       packet.photosIncluded!==false||
       packet.cipher!=='AES-256-GCM'||packet.kdf!=='PBKDF2-SHA256'||
       packet.iterations!==ITERATIONS||
       typeof packet.createdAt!=='string'||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(packet.createdAt)||
       !Number.isSafeInteger(packet.patientCount)||packet.patientCount<0||packet.patientCount>MAX_PATIENTS||
       !Number.isSafeInteger(packet.photoCountExcluded)||packet.photoCountExcluded<0||packet.photoCountExcluded>100000)
      throw Error('対応していない患者文字情報バックアップです');
    const salt=unb64(packet.salt,16),iv=unb64(packet.iv,12),cipher=unb64(packet.ciphertext);
    if(cipher.length>DATA_LIMIT+65536)throw Error('患者情報ファイルが大きすぎます');
    const secret=await keyFor(pass,salt);
    let plain;
    try{
      plain=await crypto.subtle.decrypt(
        {name:'AES-GCM',iv,additionalData:aad(packet.createdAt,packet.patientCount,packet.photoCountExcluded)},
        secret,cipher);
    }catch(e){throw Error('パスフレーズが違うか、バックアップが破損しています');}
    let data;
    try{data=JSON.parse(dec.decode(plain));}
    catch(e){throw Error('復号した患者情報を読み取れません');}
    if(!data||typeof data!=='object'||Array.isArray(data)||
       Object.keys(data).length!==1||!Object.prototype.hasOwnProperty.call(data,'patients'))
      throw Error('患者文字情報だけのバックアップではありません');
    const patients=checkPatients(data.patients,{fromFile:true});
    if(patients.length!==packet.patientCount)throw Error('患者件数が一致しません');
    return patients;
  }
  root.MSWPTB01Core=Object.freeze({
    format:FORMAT,version:VERSION,fileLimit:FILE_LIMIT,seal,unseal,checkPatients
  });
  if(typeof renderSettings!=='function'||typeof beginMaintenance!=='function')return;
  const previousSettings=renderSettings;
  let busy=false;
  const notice=(s)=>{
    const el=document.getElementById('ptb01Status');
    if(el)el.textContent=s;
  };
  function checkSession(reference,activeKey){
    if(!key||!state||state!==reference||key!==activeKey)
      throw Error('ロック状態または保存データが変わりました。やり直してください');
  }
  async function exportPatientText(){
    if(busy)return;
    if(!state||!key){alert('ロックを解除してください');return}
    const pass=prompt('患者文字情報バックアップ専用パスフレーズ（12文字以上・文字＋数字）を設定してください。暗証番号とは別に保管してください。');
    if(pass===null)return;
    const repeat=prompt('確認のため同じ専用パスフレーズをもう一度入力してください');
    if(repeat===null)return;
    if(pass!==repeat){alert('パスフレーズが一致しません');return}
    let began=false;busy=true;
    const action='患者文字情報だけのバックアップ書出';
    try{
      await beginMaintenance(action);began=true;
      const reference=state,activeKey=key;
      // The committed index is the source of truth; never export an unsaved form.
      const ciphertext=await idbGet('data');
      if(!ciphertext)throw Error('保存済み患者情報が見つかりません');
      const stored=await decryptObj(ciphertext,activeKey);
      checkSession(reference,activeKey);
      if(JSON.stringify(stored.patients)!==JSON.stringify(reference.patients))
        throw Error('編集中の情報と保存済みの患者情報が違います。画面を閉じて再試行してください');
      const count=stored.patients.reduce((n,p)=>n+(Array.isArray(p.attachments)?p.attachments.length:0),0);
      const pack=await MSWPTB01Core.seal(stored.patients,pass,count);
      checkSession(reference,activeKey);
      const blob=new Blob([JSON.stringify(pack)],{type:'application/octet-stream'});
      if(blob.size>FILE_LIMIT)throw Error('バックアップファイルが容量上限を超えています');
      download(blob,'MSW_患者文字情報_'+pack.createdAt.slice(0,10).replace(/-/g,'')+'.mswpt');
      notice('患者 '+pack.patientCount+' 人分を暗号化して書き出しました（写真 '+count+' 枚分は除外）。iPadの「ファイル」アプリで保存を確認してください。');
    }catch(e){
      notice('書出失敗：'+String(e?.message||'不明なエラー'));
    }finally{if(began)endMaintenance(action);busy=false;}
  }
  async function restorePatientText(file){
    if(busy)return;
    if(!file||!Number.isFinite(file.size)||file.size<64||file.size>FILE_LIMIT){
      alert('患者文字情報バックアップの容量が不正です');return;
    }
    const pass=prompt('患者文字情報バックアップ作成時の専用パスフレーズを入力してください');
    if(pass===null)return;
    let began=false;busy=true;
    const action='患者文字情報だけのバックアップ復元';
    try{
      await beginMaintenance(action);began=true;
      const reference=state,activeKey=key;
      // V1 is intentionally recovery-to-empty ONLY. Never replace active
      // clinical patients, photos, or prescriptions on a populated device.
      if(reference.patients.length!==0)
        throw Error('安全のため、患者一覧が空の端末への復元に限定しています。現在の患者データは変更していません');
      const photoKeys=(await idbKeys()).filter(k=>typeof k==='string'&&k.startsWith('photo:'));
      if(photoKeys.length)throw Error('端末内に写真データがあるため復元を中止しました。現在のデータは変更していません');
      const packet=JSON.parse(await file.text());
      const patients=await MSWPTB01Core.unseal(packet,pass);
      checkSession(reference,activeKey);
      const dt=new Date(packet.createdAt);
      if(!Number.isFinite(dt.getTime()))throw Error('バックアップ日時が不正です');
      if(!confirm('【写真なし患者情報の復元】\nバックアップ日時：'+dt.toLocaleString('ja-JP')+
        '\n患者：'+patients.length+'人\n写真：含まれません（'+packet.photoCountExcluded+'枚分を除外）'+
        '\n\n患者一覧が空であることを確認済みです。患者情報を復元しますか？\n' +
        '薬情・マスター・暗証番号は変更しません。'))return;
      checkSession(reference,activeKey);
      const next={...reference,patients,updatedAt:new Date().toISOString()};
      // Encrypt with THIS device's PIN, not the export password.
      await orderedDataWrite(async()=>{
        const data=await encryptPatientIndex(next,activeKey);
        checkSession(reference,activeKey);
        await idbSet('data',data);
      });
      state=next;
      notice('患者 '+patients.length+' 人分の文字情報を復元しました。写真はありません。');
      alert('患者文字情報 '+patients.length+' 人分を復元しました。写真は未登録です。患者一覧を確認してください。');
      render();
    }catch(e){
      notice('復元失敗：'+String(e?.message||'ファイルを確認してください'));
    }finally{if(began)endMaintenance(action);busy=false;}
  }
  renderSettings=async function(){
    await previousSettings();
    if(screen!=='settings'||!key||!state||!document.getElementById('backup')||
       document.getElementById('ptb01Panel'))return;
    const old=document.getElementById('backup').closest('.panel');
    if(!old)return;
    const panel=document.createElement('section');
    panel.className='panel';panel.id='ptb01Panel';
    panel.innerHTML='<h3>写真なし患者情報の軽量バックアップ（試験機能 PTB01）</h3>'+
      '<p class="notice">患者の文字情報、処方薬、タスク、経過記録などを暗号化して保存。写真・書類画像・薬情マスターは含みません。写真を除くため、元の写真は撮り直しが必要です。専用パスフレーズを忘れると復元できません。</p>'+
      '<div class="settings-row"><div><b>患者文字情報だけを暗号化保存</b><small>保存後は必ず「ファイル」アプリで .mswpt の実物を確認してください。</small></div><button class="btn secondary" type="button" id="ptb01Export">患者情報を保存</button></div>'+
      '<div class="settings-row"><div><b>患者文字情報だけを復元</b><small>試験版は患者一覧が空・写真がない端末への復元のみ。現在の患者情報を上書きしません。</small></div><button class="btn secondary" type="button" id="ptb01Import">患者情報を復元</button></div>'+
      '<p class="notice" id="ptb01Status" role="status" aria-live="polite"></p>';
    old.parentNode.insertBefore(panel,old);
    document.getElementById('ptb01Export').onclick=()=>{void exportPatientText();};
    document.getElementById('ptb01Import').onclick=()=>pickFile('.mswpt,application/octet-stream',restorePatientText);
  };
})(window);
