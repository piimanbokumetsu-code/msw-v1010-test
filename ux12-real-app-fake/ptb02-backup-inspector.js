'use strict';
/* PTB02: Verify a PTB01 .mswpt file WITHOUT restoring any patient data.
 * No patient state/IndexedDB/photograph reads or writes; no external requests.
 * The only backup contents shown to staff are date and aggregate counts.
 */
(function(root){
  const MAX_FILE_BYTES=32*1024*1024;
  async function verifyFile(file,passphrase){
    if(!root.MSWPTB01Core||typeof root.MSWPTB01Core.unseal!=='function')
      throw Error('PTB01の暗号化検査部品が読み込まれていません');
    if(!file||!Number.isFinite(file.size)||file.size<64||file.size>MAX_FILE_BYTES)
      throw Error('ファイル容量が不正です（32MB以下の .mswpt を選択してください）');
    if(typeof file.name!=='string'||!/\.mswpt$/i.test(file.name))
      throw Error('患者文字情報バックアップ .mswpt を選択してください');
    let packet;
    try{packet=JSON.parse(await file.text())}
    catch(e){throw Error('バックアップファイルを読み取れません（JSON形式が不正です）')}
    // The PTB01 AES-GCM tag authenticates the ciphertext AND the header
    // (createdAt, patientCount, photoCountExcluded) through additionalData.
    // PTB01 also validates all patient records, duplicate IDs and photo exclusion.
    let patients=await root.MSWPTB01Core.unseal(packet,passphrase);
    const count=patients.length;
    patients=null; // Do not retain, render, log, download or store plaintext.
    return Object.freeze({
      createdAt:packet.createdAt,
      patientCount:count,
      photoCountExcluded:packet.photoCountExcluded,
      photosIncluded:false,
      fileBytes:file.size
    });
  }
  root.MSWPTB02Core=Object.freeze({verifyFile,maxFileBytes:MAX_FILE_BYTES});
  if(typeof renderSettings!=='function')return;
  const originalSettings=renderSettings;
  let checking=false;
  function setStatus(message){
    const el=document.getElementById('ptb02Status');
    if(el)el.textContent=message;
  }
  async function inspect(file){
    if(checking||!file)return;
    // No IndexedDB access or application maintenance locks. The only operation
    // is reading this local File plus PBKDF2/AES-GCM in memory.
    let passphrase=prompt('検査する .mswpt を保存したときの専用パスフレーズを入力してください。内容を変更せず検査します。');
    if(passphrase===null)return;
    const button=document.getElementById('ptb02Verify');
    checking=true;
    if(button)button.disabled=true;
    setStatus('暗号化ファイルを検査しています…');
    try{
      const result=await root.MSWPTB02Core.verifyFile(file,passphrase);
      const date=new Date(result.createdAt);
      if(!Number.isFinite(date.getTime()))throw Error('バックアップの保存日時が不正です');
      setStatus('検査合格：ファイルの復号・認証と患者データ形式を確認しました。\n'+
        '作成日時：'+date.toLocaleString('ja-JP')+
        '\n患者：'+result.patientCount+' 人／写真除外：'+result.photoCountExcluded+' 枚'+
        '\n写真データ：含まれていません'+
        '\nファイル容量：'+(result.fileBytes/1024).toFixed(1)+' KB'+
        '\n患者データは変更していません。これは実際の復元成功の保証ではありません。');
    }catch(e){
      setStatus('検査不合格：'+String(e?.message||'検査できませんでした')+
        '\n既存の患者データは変更していません。');
    }finally{
      passphrase=null;
      checking=false;
      if(button?.isConnected)button.disabled=false;
    }
  }
  renderSettings=async function(){
    await originalSettings();
    if(screen!=='settings'||!key||!state)return;
    const parent=document.getElementById('ptb01Panel');
    if(!parent||document.getElementById('ptb02Panel'))return;
    const panel=document.createElement('div');
    panel.id='ptb02Panel';
    panel.innerHTML='<div class="settings-row"><div><b>保存済みバックアップを検査（PTB02）</b>'+
      '<small>.mswpt を復号・認証して患者件数と保存日時を確認します。患者情報・写真・薬情を変更しません。</small></div>'+
      '<button class="btn secondary" type="button" id="ptb02Verify">ファイルを検査</button></div>'+
      '<input id="ptb02FileInput" type="file" accept=".mswpt,application/octet-stream" hidden>'+
      '<p id="ptb02Status" class="notice" role="status" style="white-space:pre-wrap;overflow-wrap:anywhere"></p>';
    parent.appendChild(panel);
    const input=document.getElementById('ptb02FileInput');
    document.getElementById('ptb02Verify').onclick=()=>{
      if(checking)return;
      input.value='';
      input.click();
    };
    input.onchange=()=>{
      const file=input.files?.[0];
      if(file)void inspect(file);
    };
  };
})(window);
