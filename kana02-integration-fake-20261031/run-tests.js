'use strict';
(async function(){
 const report=document.getElementById('results'),lines=[];
 function check(description,pass){
   lines.push({description,pass:!!pass});
   const line=document.createElement('p');line.className=pass?'pass':'fail';
   line.textContent=(pass?'✓ ':'✗ ')+description;report.append(line);
 }
 function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
 async function clickAndSettle(button){
   button.click();
   try{await lastPersist}catch(_){}
   await sleep(100);
 }
 try{
  await bootFake();
  // Read the already-encrypted IndexedDB record BEFORE this run writes anything.
  // This checks browser reload persistence separately from the 16 in-session checks.
  const priorLabel=document.getElementById('lastSession');
  try{
    const prior=await getRecord();
    if(!prior){
      priorLabel.textContent='前回の暗号化保存：未確認（この端末で初回の実行）';
      priorLabel.className='notice';
    }else{
      const previous=await fakeDecrypt(prior);
      const saved=previous?.patients?.find(p=>p.id==='k02f01');
      const success=saved?.data?.['フリガナ']==='サトウ ハナ'
       &&saved?.furiganaConfirmed===true&&saved?.furiganaConfirmedFor==='佐藤 花子';
      priorLabel.textContent=success?
       '前回の暗号化保存を再読込：合格（フリガナと確認済み状態を保持）':
       '前回の暗号化保存を再読込：不合格（保存内容が期待と異なります）';
      priorLabel.className=success?'pass':'fail';
    }
  }catch(err){
    priorLabel.textContent='前回の暗号化保存を再読込：不合格（読込エラー）';
    priorLabel.className='fail';
  }
  const kana=window.MSWKana02;
  check('本番用KANA02の2部品が読み込めた',!!kana&&typeof furiganaSuggestion==='function'&&furiganaSuggestion('佐藤 花子')==='サトウ ハナコ');
  check('確認済み患者の別読みは保護',state.patients[2].data['フリガナ']==='ヤマサキ イチロウ'&&kana.isConfirmed(state.patients[2]));
  check('未確認は保存前に変更されない',!state.patients[0].data['フリガナ']&&writes===0);
  check('本体側の一括確認ボタンが表示',!!document.getElementById('kana02OpenBatch'));
  document.getElementById('kana02OpenBatch')?.click();
  const rows=[...document.querySelectorAll('#kana02Batch .kana02-batch-row')];
  check('未確認の架空患者だけを一覧表示',rows.length===2);
  const first=rows[0];
  check('既存患者の自動候補を表示',first?.querySelector('input')?.value==='サトウ ハナコ');
  first.querySelector('input').value='サトウ ハナ';
  await clickAndSettle(first.querySelector('button'));
  check('手直し後に「済」と表示',first.querySelector('button').textContent==='済'&&state.patients[0].data['フリガナ']==='サトウ ハナ');
  check('暗号化保存が完了',writes===1);
  const stored=await getRecord();
  check('保存データはAES-GCMで暗号化',stored?.kind==='KANA02-FAKE-ONLY'&&!JSON.stringify(stored).includes('佐藤'));
  const restored=await fakeDecrypt(stored);
  check('暗号化ファイルから確認済み・読みを復元',restored.patients[0].data['フリガナ']==='サトウ ハナ'&&restored.patients[0].furiganaConfirmed===true);
  check('別の患者の入力値は変更されていない',restored.patients[1].data['フリガナ']===''&&restored.patients[2].data['フリガナ']==='ヤマサキ イチロウ');
  // Simulate a failed write in the exact addon confirmation path.
  failSaveNext=true;
  const second=rows[1];second.querySelector('input').value='ナカガワ アケ';
  await clickAndSettle(second.querySelector('button'));
  check('保存失敗時は患者の確定状態を巻き戻す',!state.patients[1].furiganaConfirmed&&state.patients[1].data['フリガナ']===''&&second.querySelector('button').disabled===false);
  check('保存失敗後も入力した修正候補は残る',second.querySelector('input').value==='ナカガワ アケ');
  document.querySelector('#kana02Batch .sheethead button')?.click();
  state=await fakeDecrypt(await getRecord());renderPatients();
  check('再読込後も正しい確認済み・修正内容が保持',kana.isConfirmed(state.patients[0])&&state.patients[0].data['フリガナ']==='サトウ ハナ'&&state.patients[1].data['フリガナ']==='');
  check('再読込後も一括確認の対象人数が正しい',document.getElementById('kana02OpenBatch')?.textContent.includes('未確認 1人'));
  document.getElementById('kana02OpenBatch')?.click();
  check('再読込後は未確認患者1名だけ表示',document.querySelectorAll('#kana02Batch .kana02-batch-row').length===1);
 }catch(e){
  check('テスト中のエラー：'+String(e?.message||e),false);
 }
 const pass=lines.filter(x=>x.pass).length;
 const header=document.getElementById('testCount');
 header.textContent='本体連動・架空データ自動試験：'+pass+'/'+lines.length+'件合格';
 header.className=pass===lines.length?'pass':'fail';
 document.getElementById('details').textContent=pass===lines.length?
  '本番用のKANA02コードを隔離環境で実行しました。実患者・本番DBとは接続していません。':
  '不合格項目があります。実患者のアプリには触れず、結果をチャッピーに教えてください。';
})();
