'use strict';
(function(){
  const summary=document.getElementById('summary');
  const target=document.getElementById('tests');
  const kana=window.MSWKana02;
  if(!kana){summary.textContent='読込失敗：候補プログラムが見つかりません';summary.classList.add('err');return;}
  const cases=[
    ['通常の氏名（空白あり）','小川 明子','オガワ アキコ'],
    ['通常の氏名（空白なし）','小川明子','オガワ アキコ'],
    ['全角スペース','佐藤　花子','サトウ ハナコ'],
    ['見えないゼロ幅文字','佐藤\u200B花子','サトウ ハナコ'],
    ['中黒による区切り','山田・太郎','ヤマダ タロウ'],
    ['全角スラッシュ','小川／明子','オガワ アキコ'],
    ['改行を含む氏名','山田\n花子','ヤマダ ハナコ'],
    ['不可視区切りの別形式','小川\uFEFF明子','オガワ アキコ'],
    ['普通の辞書の別姓','山崎 一郎','ヤマザキ イチロウ'],
    ['未対応の氏名は推測しない','未登録姓 未登録名','']
  ];
  const items=cases.map(([label,name,expected])=>({label,actual:kana.suggest(name),expected}));
  const saved={data:{'氏名':'山崎 一郎','フリガナ':'ヤマサキ イチロウ'},furiganaConfirmed:true,furiganaConfirmedFor:'山崎 一郎'};
  items.push({label:'確認済みの特殊読みを保護',actual:kana.preview(saved).text,expected:'ヤマサキ イチロウ'});
  const unconfirmed={data:{'氏名':'佐藤 花子','フリガナ':''},furiganaConfirmed:false,furiganaConfirmedFor:''};
  items.push({label:'候補を表示しても自動確定しない',actual:kana.isConfirmed(unconfirmed)?'確認済み':'未確認',expected:'未確認'});
  for(const item of items){
    const ok=item.actual===item.expected;
    const row=document.createElement('div');row.className='test';
    const body=document.createElement('div');
    const title=document.createElement('span');title.className='name';title.textContent=item.label;
    const text=document.createElement('span');text.className='reading';text.textContent='候補：'+(item.actual||'空欄');
    body.append(title,text);
    const state=document.createElement('span');state.className='mark';state.textContent=ok?'合格':'不合格';state.style.color=ok?'#08704f':'#a22324';
    row.append(body,state);target.append(row);
  }
  const passed=items.filter(x=>x.actual===x.expected).length;
  summary.textContent=passed+'/'+items.length+' 項目 合格'+(passed===items.length?'':'（不合格があります）');
  summary.classList.add(passed===items.length?'ok':'err');
})();