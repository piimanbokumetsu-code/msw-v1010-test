'use strict';
(function(){
 const k=window.MSWKana02;
 const examples=[
  {id:'f1',data:{'氏名':'山田 太郎','フリガナ':''}},
  {id:'f2',data:{'氏名':'佐藤 花子','フリガナ':''}},
  {id:'f3',data:{'氏名':'中川 明美','フリガナ':''}},
  {id:'f4',data:{'氏名':'河野 和夫','フリガナ':''}},
  {id:'f5',data:{'氏名':'小川 明子','フリガナ':''}},
  {id:'f6',data:{'氏名':'大久保 昭子','フリガナ':''}},
  {id:'f7',data:{'氏名':'山崎 一郎','フリガナ':'ヤマサキ イチロウ'},furiganaConfirmed:true,furiganaConfirmedFor:'山崎 一郎'},
  {id:'f8',data:{'氏名':'渡辺 花子','フリガナ':''}}
 ];
 let patients=[];
 function safe(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function reset(){patients=JSON.parse(JSON.stringify(examples));render()}
 const tests=[
  ['一般的な姓と名',k.suggest('山田 太郎')==='ヤマダ タロウ'],
  ['追加した姓',k.suggest('中川 明美')==='ナカガワ アケミ'],
  ['追加した年配者名',k.suggest('大久保 昭子')==='オオクボ アキコ'],
  ['空白なしの漢字名',k.suggest('佐藤花子')==='サトウ ハナコ'],
  ['ひらがな読み',k.suggest('やまだ たろう')==='ヤマダ タロウ'],
  ['未知の漢字名は無理に埋めない',k.suggest('未知の漢字')===''],
  ['既存の確認済みを保護',k.preview(examples[6]).text==='ヤマサキ イチロウ'&&k.preview(examples[6]).confirmed],
  ['未確認の空欄には候補',k.preview(examples[0]).text==='ヤマダ タロウ'&&!k.preview(examples[0]).confirmed],
  ['既存の未確認手入力を保護',k.preview({data:{'氏名':'山田 太郎','フリガナ':'ヤマダ タロオ'}}).text==='ヤマダ タロオ'],
  ['外国語・数字を勝手に読まない',k.suggest('TEST 123')===''],
  ['表示のみでは患者データを変更しない',(k.preview(examples[0]),examples[0].data['フリガナ']==='')],
  ['確認済み氏名と現在氏名の照合',!k.isConfirmed({data:{'氏名':'山田 次郎','フリガナ':'ヤマダ タロウ'},furiganaConfirmed:true,furiganaConfirmedFor:'山田 太郎'})]
 ];
 const passed=tests.filter(t=>t[1]).length;
 document.querySelector('#checks').textContent='架空データ自動試験：'+passed+'/'+tests.length+' 件合格（姓'+k.surnameCount+'種・名'+k.givenCount+'種）';
 document.querySelector('#checks').className=passed===tests.length?'ok':'bad';
 const newName=document.querySelector('#newName'), newKana=document.querySelector('#newKana'),newStatus=document.querySelector('#newStatus');
 let newConfirmed=false, newTouched=false;
 function propose(){
  if(!newConfirmed&&!newTouched)newKana.value=k.suggest(newName.value);
  if(!newConfirmed)newStatus.textContent=newKana.value?'候補・要確認':'候補なし（手入力してください）';
 }
 newName.addEventListener('input',function(){newConfirmed=false;newTouched=false;propose()});
 newKana.addEventListener('input',function(){newConfirmed=false;newTouched=true;newStatus.textContent='手直し中・要確認'});
 document.querySelector('#newConfirm').onclick=function(){
  if(!newName.value.trim()||!newKana.value.trim()){alert('架空の氏名とフリガナを入力してください。');return}
  newConfirmed=true;newStatus.textContent='確認済み（架空データ）';
 };
 function render(){
  const list=document.querySelector('#list');
  list.innerHTML=patients.map(function(p){
   const r=k.preview(p),done=k.isConfirmed(p);
   return '<div class="row" data-id="'+safe(p.id)+'"><span class="patient">'+safe(p.data['氏名'])+'</span>'+
    '<span class="field"><input aria-label="'+safe(p.data['氏名'])+'のフリガナ" data-kana="'+safe(p.id)+'" value="'+safe(r.text)+'" '+(done?'readonly':'')+'></span>'+
    '<span class="status">'+(done?'確認済み':'要確認')+'</span>'+
    '<button data-confirm="'+safe(p.id)+'" '+(done?'disabled':'')+'>'+(done?'済':'確認')+'</button></div>';
  }).join('');
  list.querySelectorAll('[data-confirm]').forEach(function(btn){btn.onclick=function(){
   const p=patients.find(x=>x.id===btn.dataset.confirm);
   if(!p||k.isConfirmed(p))return;
   const row=btn.closest('.row'),v=row.querySelector('input').value.trim();
   if(!v){alert('読みを入力してください。');return}
   p.data['フリガナ']=k.normalizeKana(v);
   p.furiganaConfirmed=true;p.furiganaConfirmedFor=p.data['氏名'];
   render();
  }});
 }
 document.querySelector('#reset').onclick=reset;
 propose();reset();
})();
