'use strict';
/* Add precisely one original synthetic JPEG fixture to a named fake test patient.
   This file runs ONLY in the independent test-app path and origin.
   No real photos, file access, outside upload or production DB. */
(()=>{
 const PATH='/msw-v1010-test/msw-patient-kana-search-stage-20261029/';
 if(location.origin!=='https://piimanbokumetsu-code.github.io'||location.pathname!==PATH)return;
 const prev=renderSettings;
 const anchorId='splitFakePhotoRow';
 const PHOTO_ID='fake-photo-split-20261030-01';
 let busy=false, lastMessage='';
 function image(){
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
  try{
   const g=canvas.getContext('2d');if(!g)throw Error('テスト画像を作成できません');
   g.fillStyle='#ffffff';g.fillRect(0,0,640,360);
   g.fillStyle='#126e6a';g.fillRect(0,0,640,100);
   g.fillStyle='#ffffff';g.font='bold 46px sans-serif';g.fillText('FAKE TEST',35,68);
   g.fillStyle='#164c4a';g.font='bold 30px sans-serif';g.fillText('BACKUP PHOTO',35,178);
   g.font='22px sans-serif';g.fillText('Synthetic sample only',36,230);
   g.strokeStyle='#126e6a';g.lineWidth=6;g.strokeRect(20,115,600,224);
   const result={dataUrl:canvas.toDataURL('image/jpeg',0.85),width:640,height:360,rotation:0};
   validateStoredPhoto(result);return result;
  }finally{canvas.width=0;canvas.height=0}
 }
 function makeButton(){
  if(!document.getElementById('backup')||document.getElementById(anchorId))return;
  const panel=document.createElement('div');panel.className='panel';panel.id=anchorId;
  panel.innerHTML='<h3>写真付き復元の検証（架空患者専用）</h3><p class="notice">実写真を使わず、画面内で作る「FAKE TEST」の画像1枚を架空患者Aに暗号化登録します。写真なしで成功した前回のバックアップとは別に作り直すための準備です。</p><button type="button" class="btn secondary" id="splitSeedFakePhoto">架空写真を1枚登録</button><p id="splitFakePhotoResult" class="notice" role="status">未実施</p>';
  document.getElementById('backup').closest('.panel').insertAdjacentElement('afterend',panel);
  panel.querySelector('#splitSeedFakePhoto').onclick=register;
  panel.querySelector('#splitFakePhotoResult').textContent=lastMessage||'未実施';
 }
 async function register(){
  if(busy)return;
  const b=document.getElementById('splitSeedFakePhoto'),output=document.getElementById('splitFakePhotoResult');
  busy=true;if(b)b.disabled=true;if(output)output.textContent='架空の写真を生成・暗号化して登録中…';
  let maintained=false;
  try{
   if(APP_VERSION!=='KANA-SEARCH-STAGE-20261029-01')throw Error('想定と違う架空アプリです');
   if(screen!=='settings'||selectedPatient||!state||!key)throw Error('設定画面でロック解除してから実施してください');
   const patient=state.patients.find(p=>String(p.data?.['ＩＤ']||'')==='架空A001');
   if(!patient)throw Error('対象の架空患者Aが見つかりません');
   if(state.patients.some(p=>(p.attachments||[]).some(a=>a.id===PHOTO_ID))){
    lastMessage='架空写真は登録済みです。写真付きバックアップの作成へ進めます。';
    return;
   }
   await beginMaintenance('架空写真1枚の登録');
   maintained=true;
   await dataWriteTail;
   if(await idbGet(photoKey(PHOTO_ID)))throw Error('同じ写真IDのデータが既にあります。追加は中止しました');
   const payload=image();
   const cipher=await encryptObj(payload,key);
   const newEntry={id:PHOTO_ID,type:'admission',name:'入院時画像',addedAt:nowISO(),order:nextPhotoOrder(photoList(patient,'admission'))};
   const newPatient={...patient,attachments:[...(patient.attachments||[]),newEntry],updatedAt:nowISO()};
   const next={...state,patients:state.patients.map(p=>p===patient?newPatient:p),updatedAt:nowISO()};
   const indexCipher=await encryptPatientIndex(next,key);
   // Photo ciphertext and patient index are written in one atomic transaction.
   await idbApplyChanges([[photoKey(PHOTO_ID),cipher],['data',indexCipher]]);
   state=next;
   lastMessage='合格：架空患者Aにテスト画像1枚を暗号化保存しました。次は写真付きの分割書き出しを確認します。';
  }catch(e){lastMessage='登録中断（既存データ維持）：'+(e?.message||String(e))}
  finally{
   if(maintained)endMaintenance('架空写真1枚の登録');
   busy=false;
   if(output?.isConnected)output.textContent=lastMessage;
   if(b?.isConnected)b.disabled=false;
  }
 }
 renderSettings=async function(...args){await prev(...args);makeButton()};
})();
