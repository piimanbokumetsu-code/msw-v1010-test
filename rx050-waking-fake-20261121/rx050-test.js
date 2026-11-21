/* RX050 fake only. All records and drug names are fictional; this page never saves, prints or sends them. */
(function(){
  'use strict';
  const api=window.UX19DoseSchedule, printer=window.UX17PrescriptionPrintCheck;
  const el=id=>document.getElementById(id);
  const legacy={version:1,slots:{morning:'1',noon:'0',evening:'0',bedtime:'0'},relation:'食後',strength:'架空規格1mg',unit:'錠',status:'定期',dailyQuantity:'1'};
  const waking={version:1,slots:{waking:'1',morning:'0',noon:'0',evening:'0',bedtime:'0'},relation:'時間帯のみ',strength:'架空規格1mg',unit:'錠',status:'定期',dailyQuantity:'1'};
  function row(schedule){
    return {drug:{'薬名':'架空テスト薬A'},pricing:{strength:'架空規格1mg',unit:'錠',status:'定期',dailyQuantity:schedule.dailyQuantity},ux19Schedule:schedule};
  }
  let editor;
  function install(schedule){
    editor=api.buildEditor(schedule,()=> '錠');
    el('editor').replaceChildren(editor.panel);
    el('result').textContent='未確認';
  }
  el('preset').addEventListener('click',()=>install(waking));
  el('reset').addEventListener('click',()=>install(null));
  el('check').addEventListener('click',()=>{
    try{
      const v=editor.read('架空規格1mg','錠','定期');
      if(v.error){el('result').textContent='入力を確認してください：'+v.error;return;}
      const record=row(v.schedule),display=api.resolve(record),print=printer?.printableRow(record);
      const ok=Boolean(display&&print&&print.when===display.description&&print.dose===display.total+'錠／日');
      el('result').textContent=(ok?'✅ 正常':'❌ 不一致')+
        '\n服用条件：'+v.schedule.relation+
        '\n画面表示：'+(display?.description||'表示不可')+
        '\n1日合計：'+(display?.total||'?')+'錠'+
        '\nA4情報提供用の用法：'+(print?.when||'印刷不可')+
        '\n※保存・印刷は実行しません。';
    }catch(e){el('result').textContent='確認エラー：'+String(e?.message||e);}
  });
  try{
    const original=api.resolve(row(legacy));
    const legacyPrint=printer?.printableRow(row(legacy));
    const wakingRead=api.resolve(row(waking));
    const wakingPrint=printer?.printableRow(row(waking));
    const before={...waking,relation:'食前'};
    const beforeRead=api.resolve(row(before));
    const beforePrint=printer?.printableRow(row(before));
    const results=[
      ['既存の朝1錠・食後が変わらない',original?.description==='朝:1（食後）'&&legacyPrint?.when===original.description],
      ['既存処方は起床時キーがなくても読み取れる',legacy.slots.waking===undefined&&original?.total==='1'],
      ['起床時＋時間帯のみを表示・印刷できる',wakingRead?.description==='起床時:1'&&wakingPrint?.when==='起床時:1'],
      ['起床時＋食前を表示・印刷できる',beforeRead?.description==='起床時:1（食前）'&&beforePrint?.when===beforeRead.description],
      ['服用条件の既存6選択肢が変わらない',JSON.stringify(api.relations)===JSON.stringify(['食後','食前','食直前','食直後','食間','時間帯のみ'])],
      ['服用条件なしでは登録用法が有効にならない',api.resolve(row({...waking,relation:''}))===null]
    ];
    const pass=results.every(([,ok])=>ok);
    el('compat').textContent=(pass?'✅ 自動検査6/6合格':'❌ 自動検査に未合格項目あり')+
      '\n'+results.map(([label,ok])=>(ok?'✅ ':'❌ ')+label).join('\n')+
      '\n※架空処方によるコード上の結果。iPadでの操作確認とは別です。';
  }catch(e){el('compat').textContent='自動検査エラー：'+String(e?.message||e);}
  install(null);
})();
