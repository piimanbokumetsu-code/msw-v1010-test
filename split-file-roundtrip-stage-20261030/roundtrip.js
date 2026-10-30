'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const startSmall=$('small'),startLarge=$('large'),save=$('save'),picker=$('files'),verify=$('verify');
  const output=$('status'),picture=$('picture'),result=$('result'),saveLabel=$('saveLabel');
  const IMAGE_ID='FAKE_TEST_JPEG', FILLERS=130, TEXT_SIZE=1100000, MAX_PART=12*1024*1024;
  const META='FAKE-ONLY-20261030-NO-PATIENT-DATA', TEST_KEY='FAKE-TEST-ONLY-KEY-NOT-FOR-PATIENTS';
  let working=false,pending=null,downloaded=0,expectedParts=0,photoUrl=null;
  const idsFor=n=>[IMAGE_ID,...Array.from({length:n},(_,i)=>'fake'+String(i+1).padStart(4,'0'))];
  const mib=n=>(n/1048576).toFixed(1);
  const wait=()=>new Promise(r=>setTimeout(r,0));
  function say(s){output.textContent=s}
  function buttons(){startSmall.disabled=working;startLarge.disabled=working;save.disabled=!pending;verify.disabled=working}
  function b64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)}
  function from64(s){const raw=atob(s),data=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);return data}
  async function key(){const seed=new TextEncoder().encode(TEST_KEY);const digest=await crypto.subtle.digest('SHA-256',seed);return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt'])}
  async function fakeJPEG(){
    const c=document.createElement('canvas');c.width=520;c.height=280;
    const ctx=c.getContext('2d');if(!ctx)throw Error('Canvasが使えません');
    ctx.fillStyle='#edf6ff';ctx.fillRect(0,0,520,280);
    ctx.fillStyle='#124e7b';ctx.font='bold 54px sans-serif';ctx.fillText('FAKE TEST',62,118);
    ctx.font='25px sans-serif';ctx.fillText('Synthetic image only',86,175);
    const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('架空JPEGの生成失敗')),'image/jpeg',0.85));
    c.width=0;c.height=0;return new Uint8Array(await blob.arrayBuffer());
  }
  async function imageCipher(){
    const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),await fakeJPEG());
    return {iv:b64(iv),ct:b64(new Uint8Array(cipher))}
  }
  function triggerDownload(blob,name){
    const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(u),30000);
  }
  async function begin(n){
    if(working)return;
    working=true;downloaded=0;expectedParts=0;pending=null;picture.hidden=true;result.textContent='未検証';
    if(photoUrl){URL.revokeObjectURL(photoUrl);photoUrl=null}
    buttons();say('架空データを生成中。保存操作の案内が出たら、その都度保存してください。');
    try{
      if(!crypto?.subtle||!MSWSplitV04)throw Error('暗号・分割部品が使えません');
      // All large photo-like records share one synthetic text string.
      // They are NOT real encrypted JPEGs: the purpose here is file I/O and hash verification.
      const fake={iv:'AAAAAAAAAAAAAAAA',ct:'A'.repeat(TEXT_SIZE)};
      const img=await imageCipher();
      const photoIds=idsFor(n);
      const m=await MSWSplitV04.create({
        meta:{salt:META,check:{iv:'AAAAAAAAAAAAAAAA',ct:'AAAA'}},
        data:{iv:'AAAAAAAAAAAAAAAA',ct:'AAAA'},
        photoIds,maxBytes:MAX_PART,
        getPhoto:async id=>id===IMAGE_ID?img:fake,
        onPart:async(info,blob)=>new Promise(resolve=>{
          pending={blob,name:info.name,sequence:info.sequence,kind:'part',resolve};
          saveLabel.textContent='保存：パート '+info.sequence;
          say('パート '+info.sequence+'（'+mib(info.bytes)+'MiB）を保存してください。\n保存後に次のパートを生成します。');
          buttons();
        })
      });
      expectedParts=m.partCount;
      pending={blob:m.blob,name:m.name,kind:'manifest',sequence:m.partCount+1,resolve:null};
      saveLabel.textContent='管理ファイルを保存';
      say('分割パート '+m.partCount+' 件の保存操作が終わりました。\n最後に管理ファイルを保存してください。');
    }catch(e){pending=null;working=false;say('生成中断：'+(e?.message||e)+'\n途中まで保存したファイルだけでは復元できません。');}
    buttons();
  }
  save.onclick=()=>{
    if(!pending)return;
    const p=pending;pending=null;buttons();
    try{
      triggerDownload(p.blob,p.name);downloaded++;
      if(p.kind==='manifest'){
        working=false;
        say('全 '+downloaded+' ファイルのダウンロード開始操作が完了。\nファイルアプリで全パートと管理ファイルの実在を確認してから、下の「ファイルを選択」で一組を選んでください。\n※保存完了自体はこの画面では確認できません。');
      }else{
        say('パート '+p.sequence+' のダウンロードを開始しました。次を準備中…');
        p.resolve();
      }
    }catch(e){pending=p;say('ダウンロードを開始できません：'+(e?.message||e))}
    buttons();
  };
  async function readPhoto(files){
    for(const f of files){
      const obj=JSON.parse(await f.text());
      if(obj.kind!=='photos'||!Object.prototype.hasOwnProperty.call(obj.photos||{},IMAGE_ID))continue;
      const img=obj.photos[IMAGE_ID],iv=from64(img.iv),ct=from64(img.ct);
      if(iv.length!==12)throw Error('架空画像のIVが不正');
      const raw=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv},await key(),ct));
      if(raw.length<100||raw[0]!==255||raw[1]!==216)throw Error('画像形式が不正');
      if(photoUrl)URL.revokeObjectURL(photoUrl);
      photoUrl=URL.createObjectURL(new Blob([raw],{type:'image/jpeg'}));
      picture.src=photoUrl;picture.hidden=false;
      return;
    }
    throw Error('架空画像レコードがありません');
  }
  verify.onclick=async()=>{
    const files=Array.from(picker.files||[]);if(!files.length){say('保存した管理ファイルとパート一式を選択してください');return}
    working=true;buttons();picture.hidden=true;result.textContent='検証中';say('ファイル整合性を検証中（選択したファイル以外にはアクセスしません）');
    try{
      const manifest=files.filter(f=>f.name.endsWith('-manifest.json'));
      if(manifest.length!==1)throw Error('管理ファイルを1件だけ選んでください');
      const m=JSON.parse(await manifest[0].text());
      if(m.partCount<2||m.photoCount<2||m.photoCount>1000||m.partCount+1!==files.length)
        throw Error('ファイル数・架空写真数が不正');
      // Inspect core to ensure this backup comes from this synthetic test, not a patient backup.
      const coreName='msw-split-'+m.run+'-0001.json',coreFile=files.find(f=>f.name===coreName);
      if(!coreFile)throw Error('架空コアパートがありません');
      const core=JSON.parse(await coreFile.text());
      if(core?.meta?.salt!==META||core?.data?.ct!=='AAAA')
        throw Error('この独立架空試験で作ったデータではありません');
      await wait();
      const ids=idsFor(m.photoCount-1);
      const report=await MSWSplitV04.verify({
        manifestFile:manifest[0],
        partFiles:files.filter(f=>f!==manifest[0]),
        getReferenceIds:async()=>ids
      });
      await readPhoto(files.filter(f=>f!==manifest[0]));
      result.textContent='合格：実ファイル '+(report.parts+1)+'件を読戻し、SHA-256照合、架空レコード'+report.photos+'件照合、FAKE TEST画像を復号・表示';
      say('ファイル保存後の読み戻しが成功しました。画面内にFAKE TEST画像を表示します。\n※これは架空ファイル形式の読戻しで、患者DBの完全復元ではありません。');
    }catch(e){result.textContent='未合格：'+(e?.message||String(e));say('安全のため検証を中止しました。患者アプリの保存データには触れていません。')}
    finally{working=false;buttons()}
  };
  startSmall.onclick=()=>begin(12);startLarge.onclick=()=>begin(FILLERS);
  picker.onchange=()=>{result.textContent='選択済み '+(picker.files?.length||0)+'件（未検証）'};
  buttons();
})();
