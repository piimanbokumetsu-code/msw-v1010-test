'use strict';
/* All sample names are fictional. No IndexedDB, cookies or localStorage. */
let screen='patients';
const host=document.getElementById('app');
const heading='<header><h1>UX09 拡大倍率の自動復元（架空テスト）</h1><p>試し太郎など架空の表示だけ／実データ・保存処理なし</p></header>';
function render(){
 const title=screen==='patients'?'患者一覧':screen==='drugs'?'薬情':'設定';
 const patient=screen==='patients'?'<div class="panel">206-3 <b>試し太郎</b><p>架空患者・検査用の説明文</p><button id="openP">患者情報を開く</button></div>':'';
 const drugs=screen==='drugs'?'<button id="newDrug">薬剤を編集（架空）</button><section class="panel" id="rx036Editor" hidden><h3>架空薬剤を編集</h3><p>ここでも拡大ができるかチェック</p><button id="closeDrug">一覧へ戻る</button></section>':'';
 host.innerHTML=heading+'<div class="topbar"><strong class="brand">架空の患者管理</strong><button id="lockBtn">🔒 暗証画面へ</button></div><main><div class="panel"><h2>'+title+'</h2><p>ここを指2本で拡大してから下のメニューをタップしてね。</p><p>小さい文字を拡大して読むことは今までどおり可能。<strong>画面移動した時だけ1倍に戻るか</strong>確認するためのページだよ。</p>'+patient+drugs+'<div class="panel">細かい字のサンプル：退院支援・記録・薬剤マスターなど文字が小さい場合はピンチで拡大して読むことができます。</div></div></main><nav class="bottomnav"><button class="navbtn '+(screen==='patients'?'active':'')+'" data-screen="patients">🏥患者</button><button class="navbtn '+(screen==='drugs'?'active':'')+'" data-screen="drugs">💊薬情</button><button class="navbtn '+(screen==='settings'?'active':'')+'" data-screen="settings">⚙️設定</button></nav>';
 document.querySelectorAll('.navbtn').forEach(el=>el.onclick=()=>{screen=el.dataset.screen;render()});
 document.getElementById('lockBtn').onclick=renderLock;
 document.getElementById('openP')?.addEventListener('click',()=>openPatient());
 document.getElementById('newDrug')?.addEventListener('click',()=>document.getElementById('rx036Editor').hidden=false);
 document.getElementById('closeDrug')?.addEventListener('click',()=>document.getElementById('rx036Editor').hidden=true);
}
function renderLock(){
 host.innerHTML='<div class="lockwrap"><div class="lockcard"><h2>暗証番号画面（架空）</h2><p>本物の暗証番号は入力しないでください。</p><input aria-label="架空の暗証入力" placeholder="入力不要です" disabled><button id="fakeUnlock">架空患者一覧に戻る</button></div></div>';
 document.getElementById('fakeUnlock').onclick=()=>{screen='patients';render()};
}
function openPatient(){
 document.body.insertAdjacentHTML('beforeend','<div class="modal" id="modal"><div class="sheet"><h2>試し太郎（架空）</h2><div class="tabs"><button class="tab active" data-tab="basic">基本</button><button class="tab" data-tab="medications">処方薬</button></div><p>患者情報内でも拡大できます。</p><button id="closePatient">保存せず閉じる</button></div></div>');
 document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(a=>a.classList.remove('active'));t.classList.add('active')});
 document.getElementById('closePatient').onclick=()=>{document.getElementById('modal').remove()};
}
function scale(){return Number(window.visualViewport?.scale||1);}
function scaleInfo(text){const v=document.getElementById('scaleInfo');if(v)v.textContent='倍率:'+scale().toFixed(2)+'倍'+(text?' ／ '+text:'');}
window.addEventListener('ux09-report',e=>{const d=e.detail;scaleInfo('移動前'+d.before.toFixed(2)+'→後'+d.after.toFixed(2))});
window.visualViewport?.addEventListener('resize',()=>scaleInfo('倍率変化'));
render();
scaleInfo('ピンチで拡大してね');
