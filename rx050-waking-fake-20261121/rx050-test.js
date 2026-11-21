/* RX050 fake only. All records are fictional, in memory only. */
(function(){
 'use strict';
 const api=window.UX19DoseSchedule,printer=window.UX17PrescriptionPrintCheck;
 const el=id=>document.getElementById(id);
 const old={version:1,slots:{morning:'1',noon:'0',evening:'0',bedtime:'0'},relation:'食後',strength:'架空規格1mg',unit:'錠',status:'定期',dailyQuantity:'1'};
 const waking={version:1,slots:{waking:'1',morning:'0',noon:'0',evening:'0',bedtime:'0'},relation:'時間帯のみ',strength:'架空規格1mg',unit:'錠',status:'定期',dailyQuantity:'1'};
 function row(s){return {drug:{'薬名':'架空テスト薬A'},pricing:{strength:'架空規格1mg',unit:'錠',status:'定期',dailyQuantity:s.dailyQuantity},ux19Schedule:s};}
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
   if(v.error){el('result').textContent='入力を確認してください：'+v.error;return}
   const r=row(v.schedule), resolved=api.resolve(r), printed=printer?.printableRow(r);
   const ok=Boolean(resolved&&printed&&printed.when===resolved.description&&printed.dose===resolved.total+'錠／日');
   el('result').textContent=(ok?'✅ 正常':'❌ 不一致')+'\n画面表示：'+(resolved?.description||'表示不可')+
     '\n1日合計：'+(resolved?.total||'?')+'錠'+
     '\nA4情報提供用の用法：'+(printed?.when||'印刷不可')+
     '\n※印刷は実行しません。';
  }catch(e){el('result').textContent='確認エラー：'+String(e?.message||e)}
 });
 try{
   const read=api.resolve(row(old)),printed=printer?.printableRow(row(old));
   const valid=read?.description==='朝:1（食後）'&&printed?.when===read.description&&
     old.slots.waking===undefined&&read.total==='1';
   el('compat').textContent=(valid?'✅ 合格':'❌ 要修正')+
     '\n旧形式（起床時項目なし）：朝1錠・食後' +
     '\n保存済みの表示：'+(read?.description||'読取不可')+
     '\n印刷用の表示：'+(printed?.when||'読取不可');
 }catch(e){el('compat').textContent='旧形式の確認エラー：'+String(e?.message||e)}
 install(null);
})();
