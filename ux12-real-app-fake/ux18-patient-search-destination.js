/* UX18 FAKE STAGE 2026-11-19:
 * (1) Show ONLY matching patients in room search, no extra roommates/empty beds.
 * (2) Select destination first -> search patient -> existing UX10 confirmation.
 *
 * Display-only until UX10's already approved transfer handler is invoked.
 * Uses the preserved original UX10 move validation, occupancy warning,
 * encrypted save and rollback. No direct writes to patient/master data.
 */
(function(){
'use strict';
if(window.__MSW_UX18_INSTALLED__)return;
const priorRoom=window.roomMapHtml,priorDraw=window.drawPatientList;
if(typeof priorRoom!=='function'||typeof priorDraw!=='function'||
   typeof window.patientBedHtml!=='function'||typeof window.patientMatches!=='function')return;
window.__MSW_UX18_INSTALLED__=true;

const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('ja').trim();
const bedNorm=s=>typeof normalizeBed==='function'?normalizeBed(s):norm(s);
const qText=()=>String(document.getElementById('q')?.value||'').trim();
const patientWard=()=>String(document.getElementById('ward')?.value||'');
const viewActive=()=>typeof screen!=='undefined'&&screen==='patients'&&
  !!document.querySelector('#showAllPatients[aria-pressed="true"]')&&
  !!document.getElementById('patientList');
const searchActive=()=>viewActive()&&!!qText();
const patientMatchesQuery=(p,q)=>!p.dischargeDate&&patientMatches(p,q);
const patientWardMatches=p=>!patientWard()||wardForBed(p.data?.['ベッド番号'])===patientWard();

const style=document.createElement('style');
style.id='ux18Style';
style.textContent=[
 '#patientList .general-room-map .room-map-item .room-block.ux18-hits-only .bed-grid,',
 '#patientList .icu-map>.room-block.ux18-hits-only .bed-grid{',
 'display:grid!important;grid-template-columns:repeat(auto-fit,minmax(135px,1fr))!important;',
 'grid-auto-columns:auto!important;grid-auto-flow:row!important;gap:8px!important}',
 '.ux18-action-bar{display:flex;justify-content:flex-end;margin:8px 0 10px}',
 '.ux18-action-bar .btn{width:100%;min-height:42px;font-size:14px;font-weight:700}',
 '.ux18-search-hide-extra{display:none!important}',
 '.ux18-overlay{position:fixed;inset:0;z-index:115;background:rgba(12,29,43,.56);',
 'display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}',
 '.ux18-panel{background:white;color:#243447;border-radius:15px;width:min(100%,540px);',
 'max-height:calc(100dvh - 48px);overflow-y:auto;padding:18px;box-shadow:0 8px 32px #152d4570}',
 '.ux18-head{display:flex;align-items:center;justify-content:space-between;gap:12px}',
 '.ux18-head h2{font-size:19px;margin:0}',
 '.ux18-label{display:block;margin:14px 0 7px;font-weight:700}',
 '.ux18-input{width:100%;box-sizing:border-box;border:1px solid #9aabb9;border-radius:9px;',
 'font-size:16px;min-height:45px;padding:9px}',
 '.ux18-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));',
 'gap:8px;max-height:55vh;overflow-y:auto;margin-top:10px}',
 '.ux18-list.patients{grid-template-columns:1fr}',
 '.ux18-choice{display:block;min-height:43px;white-space:normal;text-align:left;',
 'border:1px solid #b3c5d2;border-radius:8px;background:#f5fafc;padding:10px;',
 'font-size:15px;color:#162f45;overflow-wrap:anywhere}',
 '.ux18-choice:focus-visible{outline:3px solid #12866c}',
 '.ux18-choice small{display:block;color:#42576a;margin-top:4px;font-size:13px}',
 '.ux18-help{font-size:13px;color:#5b6b78;margin:8px 0}',
 '.ux18-destination{font-size:17px;font-weight:800;margin-top:10px;color:#136f59}'
].join('\n');
document.head.appendChild(style);

window.roomMapHtml=function(room,patients,q,...rest){
 if(!searchActive())return priorRoom.call(this,room,patients,q,...rest);
 // Main app intentionally supplies ALL patients to roomMapHtml while searching
 // to show entire rooms. Restrict rendering to matching individuals only.
 const query=qText().toLowerCase();
 const hits=patients.filter(p=>patientMatchesQuery(p,query)&&patientWardMatches(p));
 const html=room.beds.map(bed=>hits.filter(p=>bedNorm(p.data?.['ベッド番号'])===bedNorm(bed))
   .map(p=>patientBedHtml(bed,[p])).join('')).join('');
 const heading=esc(room.room)+(room.room.startsWith('ICU')?'':'号室');
 return '<div class="room-block ux18-hits-only"><div class="room-title">'+
   heading+'</div><div class="bed-grid">'+html+'</div></div>';
};

function compactTray(){
 if(!searchActive())return;
 const query=qText().toLowerCase(),tray=document.getElementById('ux10Tray');
 if(!tray)return;
 const ids=new Set((state?.patients||[])
   .filter(p=>patientMatchesQuery(p,query)&&patientWardMatches(p)&&
     !isMappedBed(p.data?.['ベッド番号'])).map(p=>String(p.id)));
 tray.querySelectorAll('.ux10-person').forEach(card=>{
   if(!ids.has(String(card.dataset.ux11Id||'')))card.remove();
 });
 const count=tray.querySelector('.ux10-count');
 if(count)count.textContent=ids.size+'人';
 // UX12's unplaced map and sticky tray normally display the same people
 // twice. Keep the tray for existing drag operations; hide the map copy
 // while the tray is expanded. If folded, keep the map copy visible.
 syncUnplacedDuplicate();
}
function syncUnplacedDuplicate(){
 const section=document.querySelector('#patientList .unplaced-patient-grid')?.closest('.map-section');
 if(!section)return;
 const tray=document.getElementById('ux10Tray');
 const count=Number((tray?.querySelector('.ux10-count')?.textContent||'0').match(/\d+/)?.[0]||0);
 const useTray=searchActive()&&!!tray&&!tray.classList.contains('ux10-folded')&&count>0;
 section.classList.toggle('ux18-search-hide-extra',useTray);
}
document.addEventListener('click',event=>{
 if(event.target.closest('#ux10Tray .ux10-toggle'))requestAnimationFrame(syncUnplacedDuplicate);
},false);

function element(tag,cls,text){
 const node=document.createElement(tag);if(cls)node.className=cls;
 if(text!==undefined)node.textContent=String(text);
 return node;
}
function button(text,handler,extraClass=''){
 const b=element('button','ux18-choice '+extraClass,text);
 b.type='button';b.onclick=handler;return b;
}
function attachLauncher(){
 if(!viewActive())return;
 const toolbar=document.querySelector('.patient-search-toolbar');
 if(!toolbar||document.getElementById('ux18DestinationLauncher'))return;
 const bar=element('div','ux18-action-bar');bar.id='ux18DestinationLauncher';
 const open=element('button','btn secondary','📍 移動先ベッドを先に指定して患者を探す');
 open.type='button';open.onclick=showDestinationFirst;
 bar.appendChild(open);
 toolbar.insertAdjacentElement('afterend',bar);
}

let overlay=null;
function closeOverlay(){
 overlay?.remove();overlay=null;
}
function displayOverlay(title){
 closeOverlay();
 overlay=element('div','ux18-overlay');overlay.id='ux18Overlay';
 const panel=element('section','ux18-panel');
 panel.setAttribute('role','dialog');
 panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-label','移動先を先に選ぶ');
 const head=element('div','ux18-head');
 head.appendChild(element('h2','',title));
 const cancel=element('button','btn secondary','やめる');
 cancel.type='button';cancel.onclick=closeOverlay;head.appendChild(cancel);
 panel.appendChild(head);overlay.appendChild(panel);
 document.body.appendChild(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)closeOverlay()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape')closeOverlay()});
 return panel;
}
function showDestinationFirst(){
 if(!viewActive()||document.getElementById('ux10Confirm'))return;
 if(typeof officialBeds!=='function'||typeof window.__MSW_UX10_REQUEST_MOVE__!=='function')return;
 const beds=officialBeds();
 const panel=displayOverlay('① 移動先ベッドを選ぶ');
 panel.appendChild(element('label','ux18-label','ベッド番号を入力（例：202-3、ICU2-1）'));
 const input=element('input','ux18-input');
 input.type='search';input.autocomplete='off';input.placeholder='202-3';
 input.setAttribute('aria-label','移動先ベッド番号');
 panel.appendChild(input);
 const help=element('p','ux18-help','候補から実在するベッドを選んでね。検索だけでは患者データは変更されません。');
 panel.appendChild(help);
 const list=element('div','ux18-list');panel.appendChild(list);
 function update(){
   const q=norm(input.value);
   list.replaceChildren();
   if(!q){help.textContent='ベッド番号を入力すると候補が表示されます。';return}
   const matches=beds.filter(b=>norm(b).includes(q));
   help.textContent=matches.length?matches.length+'床が該当します':'該当するベッド番号がありません';
   for(const bed of matches.slice(0,30)){
     list.appendChild(button(bed,()=>showPatientChoice(bed)));
   }
 }
 input.addEventListener('input',update);
 input.focus({preventScroll:true});
}
function showPatientChoice(destination){
 if(!viewActive()||typeof officialBeds!=='function'||!officialBeds().includes(destination)){
   closeOverlay();return;
 }
 const panel=displayOverlay('② 移動する患者を検索');
 panel.appendChild(element('div','ux18-destination','移動先：'+destination));
 const back=element('button','btn secondary','← 移動先を選び直す');
 back.type='button';back.onclick=showDestinationFirst;panel.appendChild(back);
 panel.appendChild(element('label','ux18-label','患者の氏名・フリガナ・現在のベッド・IDで検索'));
 const input=element('input','ux18-input');
 input.type='search';input.autocomplete='off';input.placeholder='氏名などを入力';
 input.setAttribute('aria-label','移動する患者を検索');
 panel.appendChild(input);
 const help=element('p','ux18-help','患者を検索してから選んでね。');panel.appendChild(help);
 const list=element('div','ux18-list patients');panel.appendChild(list);
 function update(){
   const q=norm(input.value);list.replaceChildren();
   if(!q){help.textContent='患者名などを入力すると候補が表示されます。';return}
   const matching=(state?.patients||[]).filter(p=>!p.dischargeDate&&
     bedNorm(p.data?.['ベッド番号'])!==bedNorm(destination)&&
     (patientMatches(p,q)||norm(p.data?.['ＩＤ']).includes(q)));
   help.textContent=matching.length?matching.length+'人が該当します':'該当する患者がいません';
   for(const p of matching.slice(0,30)){
     const name=String(p.data?.['氏名']||'氏名未入力');
     const choice=button(name,()=>{
       // The overlay is closed BEFORE existing UX10 requestMove runs.
       // UX10 then reconfirms identity, actual destination occupancy and
       // encrypts/saves or rolls back exactly as the prior drag workflow.
       if(!viewActive()||typeof window.__MSW_UX10_REQUEST_MOVE__!=='function')return;
       closeOverlay();
       window.__MSW_UX10_REQUEST_MOVE__(p.id,destination);
     });
     choice.appendChild(element('small','',
       '患者ID：'+(p.data?.['ＩＤ']||'未登録')+
       ' ／ 現在：'+(p.data?.['ベッド番号']||'その他・未配置')));
     list.appendChild(choice);
   }
 }
 input.addEventListener('input',update);
 input.focus({preventScroll:true});
}

window.drawPatientList=function(...args){
 const result=priorDraw.apply(this,args);
 attachLauncher();
 compactTray();
 return result;
};
requestAnimationFrame(attachLauncher);
})();