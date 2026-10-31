'use strict';
(function(){
 const summary=document.getElementById('summary'),host=document.getElementById('cases');
 const engine=window.MSWKana02;
 if(!engine||typeof engine.getCandidates!=='function'){
   summary.textContent='辞書読込エラー（KANA03エンジンが起動していません）';
   summary.className='result fail';return;
 }
 const rows=[["佐藤美佐江","サトウ ミサエ"],["田島定雄","タジマ サダオ"],["山田花子","ヤマダ ハナコ"],["山田 花子","ヤマダ ハナコ"],["山田・花子","ヤマダ ハナコ"],["松下健一","マツシタ ケンイチ"],["宇都宮明子","ウツノミヤ アキコ"],["青柳幸子","アオヤギ サチコ"],["高橋虹子","タカハシ ニジコ"],["田島 初江","タジマ ハツエ"],["山田幸子","ヤマダ サチコ"],["小川\\u200B明子","オガワ アキコ"],["佐藤 彩乃","サトウ アヤノ"],["奥村よし子","オクムラ ヨシコ"],["渡辺春江","ワタナベ ハルエ"],["山崎一郎","ヤマザキ イチロウ"],["山田\\n太郎","ヤマダ タロウ"],["未登録姓未登録名",""]];
 const expected=rows.map(([name,kana])=>[name.replace(/\\u200B/g,'\u200B').replace(/\\n/g,'\n'),kana]);
 const checked=[];
 for(const [name,want] of expected){
   const options=engine.getCandidates(name),actual=engine.suggest(name),pass=actual===want;
   checked.push(pass);
   const card=document.createElement('article');card.className='entry';
   const content=document.createElement('div');
   const lbl=document.createElement('div');lbl.className='label';lbl.textContent='架空の氏名';
   const title=document.createElement('div');title.className='name';title.textContent=name.replace(/\u200B/g,'');
   const val=document.createElement('div');val.className='value';val.textContent=actual||'候補なし（手入力が必要）';
   const meta=document.createElement('div');meta.className='small';meta.textContent=options.length>1?'ほかの読み候補あり：'+(options.length-1)+'件':'';
   content.append(lbl,title,val,meta);
   if(options.length>1){
     const picker=document.createElement('select');picker.className='pick';
     picker.setAttribute('aria-label','別のフリガナ候補を選択');
     for(const reading of options){const op=document.createElement('option');op.value=reading;op.textContent=reading;picker.append(op)}
     picker.addEventListener('change',()=>{val.textContent=picker.value;meta.textContent='画面上の表示だけ変更・保存なし'});
     content.append(picker);
   }
   const mark=document.createElement('span');mark.className='status '+(pass?'ok':'fail');
   mark.textContent=pass?'合格':'不合格';card.append(content,mark);host.append(card);
 }
 const verified={data:{'氏名':'山崎一郎','フリガナ':'ヤマサキ イチロウ'},furiganaConfirmed:true,furiganaConfirmedFor:'山崎一郎'};
 checked.push(engine.preview(verified).text==='ヤマサキ イチロウ'&&engine.preview(verified).confirmed);
 checked.push(engine.getCandidates('山田花子').includes('ヤマダ カコ'));
 checked.push(engine.dataset.surnames===1999&&engine.dataset.givenSpellings===70296);
 const passed=checked.filter(Boolean).length;
 summary.textContent=passed+'/'+checked.length+' 項目 合格'+(passed===checked.length?'':'（不合格あり）');
 summary.className='result '+(passed===checked.length?'ok':'fail');
})();
