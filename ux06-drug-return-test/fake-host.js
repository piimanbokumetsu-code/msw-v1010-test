'use strict';
/* UX06 isolated fake host. NO persistent storage, no patient data, no network calls. */
var APP_VERSION='UX06-FAKE-20261105';
var screen='drugs';
var state={drugs:[
 {'薬名':'架空薬A','医薬品分類':'架空分類','薬価':'5mg(10.00)','薬効':'架空データ。実薬ではありません。'},
 {'薬名':'架空薬B','医薬品分類':'架空分類','薬価':'5mg(20.00)','薬効':'架空データ。実薬ではありません。'},
 {'薬名':'架空薬C','医薬品分類':'架空分類','薬価':'5mg(30.00)','薬効':'架空データ。実薬ではありません。'}
 ],patients:[]};
var key={fake:true};
var drugCsvBusy=false;
var $=sel=>document.querySelector(sel);
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function rx038MasterSearchText(d){return [d['薬名'],d['医薬品分類'],d['薬価'],d['薬効']].join(' ').toLowerCase();}
function drawDrugs(){
 const q=($('#dq')?.value||'').toLowerCase().trim();
 const list=state.drugs.filter(d=>!q||rx038MasterSearchText(d).includes(q)).slice(0,100);
 $('#drugList').innerHTML=list.length?'<div class="drug-list">'+
  list.map(d=>'<article class="drug"><b>'+esc(d['薬名'])+'</b><div class="small">'+esc(d['医薬品分類'])+'　'+esc(d['薬価'])+'</div><div class="effect">'+esc(d['薬効'])+'</div></article>').join('')+'</div>'
  :'<div class="empty">検索に一致する架空薬がありません。</div>';
}
function renderDrugs(){
 $('#main').innerHTML='<div class="hero"><h1>薬情（架空3件）</h1><p>編集後に検索が解除されるか検証します。</p></div><div class="toolbar"><input id="dq" placeholder="薬名・分類・薬効で検索" autocomplete="off"></div><div id="drugList"></div>';
 $('#dq').oninput=drawDrugs;drawDrugs();
}
function beginMaintenance(){return Promise.resolve();}
function endMaintenance(){}
function orderedDataWrite(fn){return Promise.resolve().then(fn);}
function encryptPatientIndex(v){return Promise.resolve(JSON.stringify(v));}
function idbSet(){return Promise.resolve();}
function ensureStateSchema(){}
function nowISO(){return new Date().toISOString();}
function medPriceChoices(){return [];}
window.addEventListener('DOMContentLoaded',()=>renderDrugs());
