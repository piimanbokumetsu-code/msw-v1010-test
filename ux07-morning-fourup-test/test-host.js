'use strict';
/* UX07 isolated fake 4-sheet print host. NO patient data or persistent storage. */
let screen='patients';
let state={patients:[]};
function renderPatients(){
 const app=document.getElementById('app');
 app.innerHTML='<header><h1>UX07　朝一患者一覧の印刷テスト</h1><p>架空患者だけの画面。実際の患者データはありません。印刷はせずプレビューでページ数を確認してください。</p></header>'+
 '<main><h2>入院患者（架空データ）</h2><p>既存の4枚印刷を残し、A4・1枚（4分割）で印刷を追加するテストです。</p>'+
 '<div class="toolbar"><button type="button" id="print" class="btn secondary">朝一患者一覧を印刷（A4・4枚）</button></div>'+
 '<p class="notice">A4・1枚（4分割）を押すと、4ページを1枚にまとめた印刷プレビューが表示されます。</p>'+
 '<ul><li>1ページ目：一般病棟 201〜203</li><li>2ページ目：一般病棟 205〜213</li><li>3ページ目：ICU</li><li>4ページ目：その他・未配置／重複</li></ul></main>';
 document.getElementById('print').onclick=printMorningList;
}
function row(bed,n){
 const name='架空患者'+String.fromCharCode(65+(n%26));
 const disease=n%4===0?'架空の病名（長い病名の折り返しテスト）': '架空病名';
 return '<tr><td>'+bed+'</td><td>'+(1000+n)+'</td><td>'+name+'</td><td>11/05</td><td>架空医</td><td>架空町</td><td class="disease-cell"><span class="disease-text">'+disease+'</span></td><td>要1</td><td class="facility-cell"><span class="facility-text">架空のケアマネ・施設</span></td><td></td><td>2</td><td>13</td></tr>';
}
const beds=(room,count)=>Array.from({length:count},(_,i)=>room+'-'+(i+1));
function table(bedsArray){
 const heads=['部屋','ID','氏名','入院日','主治医','住所','病名','介護度','ケアマネ・施設','メモ','家族','日数'];
 let lastRoom='';const rows=bedsArray.map((bed,i)=>{
  const room=bed.split('-')[0]; const gap=room!==lastRoom&&i>0?'<tr class="room-gap"><td colspan="12"></td></tr>':'';
  lastRoom=room;return gap+row(bed,i);
 }).join('');
 const cols=['bed','id','name','admit','doc','address','disease','care','facility','memo','family','days'];
 return '<table class="morning-table"><colgroup>'+cols.map(c=>'<col class="c-'+c+'">').join('')+'</colgroup><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>';
}
function printMorningList(){
 const pages=[
  {ward:'一般病棟　201〜203',beds:[...beds('201',6),...beds('202',6),...beds('203',7)]},
  {ward:'一般病棟　205〜213',beds:[...beds('205',6),...beds('206',6),...beds('207',6),...beds('208',2),...beds('210',2),'211','212','213']},
  {ward:'ICU',beds:[...beds('ICU1',7),...beds('ICU2',7),...beds('ICU3',9)]},
  {ward:'その他・未配置／重複',beds:['未配置A','未配置B','未配置C']}
 ];
 document.getElementById('morningPrint')?.remove();
 const root=document.createElement('div');root.id='morningPrint';root.className='morning-print';
 root.innerHTML=pages.map((pg,i)=>'<section class="morning-page"><div class="morning-head"><h1>入院患者一覧</h1><div>2026/11/05　朝　　'+pg.ward+'　'+(i+1)+'/4</div></div>'+table(pg.beds)+'</section>').join('');
 document.body.appendChild(root);
 setTimeout(()=>window.print(),50);
}
renderPatients();
