'use strict';
const $=q=>document.querySelector(q),$$=q=>Array.from(document.querySelectorAll(q));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let screen='drugs';
let state={drugs:[
 {'薬名':'架空薬 A','医薬品分類':'架空分類','薬価':'5mg 10.00円','薬効':'架空の説明','後発品':'架空後発A'},
 {'薬名':'架空薬 B','医薬品分類':'架空分類','薬価':'10mg 20.00円','薬効':'架空の説明','後発品':'架空後発B'},
 {'薬名':'架空薬 C','医薬品分類':'架空分類','薬価':'2.5mg 5.00円','薬効':'架空の説明','後発品':'架空後発C'}
]};
let editIndex=-1;
function rx038MasterSearchText(d){return [d['薬名'],d['医薬品分類'],d['薬効'],d['後発品']].join(' ').toLowerCase();}
function renderDrugs(){
 $('#main').innerHTML='<h1>薬情（架空テスト）</h1><div class="toolbar"><input id="dq" type="search" placeholder="薬名で検索"></div>'+
  '<div class="rx036Actions"><span class="notice">色がついた薬をタップして、薬価・後発品を確認してください。</span></div>'+
  '<section id="rx036Editor" class="panel" hidden><h2 id="rx036Heading">薬情マスター編集</h2>'+
  '<form id="rx036Form" autocomplete="off">'+
  '<label>薬名<input name="name" type="text" required></label>'+
  '<label>薬価<input name="price" type="text"></label>'+
  '<label>後発品<input name="generic" type="text"></label>'+
  '<label>薬効・補足<input name="effect" type="text"></label>'+
  '<div class="rx036Controls"><button id="rx036Save" type="submit">保存する</button><button id="rx036Cancel" type="button" class="secondary">キャンセル</button></div>'+
  '</form><p id="rx036FormStatus" class="notice"></p></section>'+
  '<div id="drugList"></div><button id="resetFake" type="button" class="secondary">架空データを初期化</button>';
 const form=$('#rx036Editor');
 window.RX05?.install(form);
 $('#dq').oninput=drawDrugs;
 $('#rx036Cancel').onclick=()=>{form.hidden=true;editIndex=-1;};
 $('#rx036Form').onsubmit=e=>{e.preventDefault();commitEdit();};
 $('#resetFake').onclick=()=>location.reload();
 drawDrugs();
}
function drawDrugs(){
 const q=$('#dq')?.value.toLowerCase().trim()||'';
 const all=state.drugs.map((drug,index)=>({drug,index}));
 const filtered=all.filter(({drug})=>!q||rx038MasterSearchText(drug).includes(q)).slice(0,100);
 $('#drugList').innerHTML=filtered.length?'<div class="drug-list">'+filtered.map(({drug,index})=>
  '<article class="drug" tabindex="0" role="button" data-index="'+index+'"><b>'+esc(drug['薬名'])+
  '</b><div class="small">薬価：'+esc(drug['薬価'])+'<p>後発品：'+esc(drug['後発品'])+'</p></div></article>'
 ).join('')+'</div>':'<div class="panel">該当する架空薬はありません。</div>';
 $$('#drugList article.drug').forEach(c=>{
  c.onclick=()=>openEdit(Number(c.dataset.index));
  c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();c.click();}};
 });
}
function openEdit(index){
 const drug=state.drugs[index],form=$('#rx036Editor');
 if(!drug||!form)return;
 editIndex=index;
 form.querySelector('[name=name]').value=drug['薬名'];
 form.querySelector('[name=price]').value=drug['薬価'];
 form.querySelector('[name=generic]').value=drug['後発品'];
 form.querySelector('[name=effect]').value=drug['薬効'];
 form.querySelector('#rx036Heading').textContent=drug['薬名']+' の薬情マスター編集';
 window.RX05?.open(form,drug);
 form.hidden=false;
 form.querySelector('#rx036FormStatus').textContent='';
 form.scrollIntoView({block:'start'});
}
function commitEdit(){
 if(editIndex<0)return;
 const drug=state.drugs[editIndex];
 const f=$('#rx036Editor'),form=f.querySelector('form');
 const next={...drug,'薬名':form.elements.namedItem('name').value.trim(),
  '薬価':form.elements.namedItem('price').value.trim(),
  '後発品':form.elements.namedItem('generic').value.trim(),'薬効':form.elements.namedItem('effect').value.trim()};
 if(!next['薬名']){f.querySelector('#rx036FormStatus').textContent='薬名が必要です';return;}
 const modified=['薬名','薬価','後発品','薬効'].some(k=>next[k]!==drug[k]);
 const reviewedChanged=window.RX05?.changed(f,drug);
 if(!modified&&!reviewedChanged){f.querySelector('#rx036FormStatus').textContent='変更されていません';return;}
 if(!confirm('架空薬の変更・確認状況を保存しますか？'))return;
 window.RX05.write(f,next);
 state.drugs[editIndex]=next;editIndex=-1;
 document.querySelector('#testMessage').textContent='架空データを画面内だけで保存しました。端末の本番薬情には影響しません。';
 renderDrugs();
}
