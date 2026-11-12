/* UX11 development: scroll-first native long press with no arrow handles.
 * UX10 save/confirmation/rollback retained. Test-only until separate production approval.
 */
(function(){
'use strict';
if(window.__MSW_UX10_INSTALLED__)return;
if(typeof window.drawPatientList!=='function'||typeof window.save!=='function')return;
const priorDraw=window.drawPatientList;
let folded=false,selected=null,drag=null,hover=null,ghost=null,confirming=false,saving=false,ignoreClick=0,ignoreClickSource=null,toastSeq=0;
const patient=id=>state?.patients?.find(p=>String(p.id)===String(id)&&!p.dischargeDate)||null;
const mapped=bed=>typeof isMappedBed==='function'&&isMappedBed(bed);
const active=()=>!!(typeof key!=='undefined'&&key&&state&&screen==='patients'&&
 document.getElementById('patientList')&&
 document.querySelector('#showAllPatients[aria-pressed="true"]'));
const editing=()=>!!document.querySelector('#modal,#duplicateModal,#groupedBedPicker,#dischargeFlow,#ux10Confirm');
const unplaced=()=>active()?state.patients.filter(p=>!p.dischargeDate&&!mapped(p.data?.['ベッド番号'])):[];
const bedText=bed=>bed||'その他・未配置';
function toast(message){
 let el=document.getElementById('ux10Notice');
 if(!el){el=document.createElement('div');el.id='ux10Notice';el.setAttribute('role','status');document.body.appendChild(el)}
 el.textContent=message;const n=++toastSeq;
 setTimeout(()=>{if(n===toastSeq)el.remove()},2500);
}
function select(id){
 if(!active()||editing()||saving)return;
 selected=selected===id?null:id;
 document.querySelectorAll('.ux10-selected').forEach(x=>x.classList.remove('ux10-selected'));
 if(selected){
   document.querySelectorAll('[data-ux11-id]').forEach(x=>{
     if(x.dataset.ux11Id===selected)x.classList.add('ux10-selected');
   });
   toast((patient(selected)?.data?.['氏名']||'患者')+'を選択。移動先をタップしてください');
 }else toast('移動する患者の選択を解除しました');
}
function paintTray(){
 const tray=document.getElementById('ux10Tray');if(!tray||!active())return;
 const persons=unplaced(),row=tray.querySelector('.ux10-row');
 tray.querySelector('.ux10-count').textContent=persons.length+'人';
 tray.querySelector('.ux10-toggle').textContent=folded?'開く ▴':'閉じる ▾';
 tray.classList.toggle('ux10-folded',folded);
 row.hidden=folded;row.replaceChildren();
 if(folded)return;
 if(!persons.length){
   const empty=document.createElement('span');empty.className='ux10-none';
   empty.textContent='未配置の患者はいません';row.appendChild(empty);
 }
 for(const p of persons){
   const card=document.createElement('div');card.className='ux10-person';
   const name=document.createElement('strong');name.textContent=p.data?.['氏名']||'氏名未入力';
   const note=document.createElement('small');
   note.textContent=p.ux10PendingFromBed?'元 '+p.ux10PendingFromBed+' ／ 移動先確認中':'未配置（新規入院等）';
   card.append(name,note);row.appendChild(card);bindLongPress(card,p.id,true);
 }
}
function sync(){
 const old=document.getElementById('ux10Tray');
 if(!active()){
   old?.remove();document.body.classList.remove('ux10-active');selected=null;return;
 }
 document.body.classList.add('ux10-active');
 if(!old){
   const tray=document.createElement('aside');tray.id='ux10Tray';
   tray.setAttribute('aria-label','その他・未配置：ベッド移動用の固定トレー');
   tray.innerHTML='<div class="ux10-head"><strong>その他・未配置</strong><span class="ux10-count"></span><span class="ux10-sub">一時退避・新規入院</span><button type="button" class="ux10-toggle"></button></div><div class="ux10-row"></div>';
   document.body.appendChild(tray);
   tray.querySelector('.ux10-toggle').addEventListener('click',()=>{folded=!folded;paintTray()});
 }
 paintTray();
 document.querySelectorAll('#patientList .occupied-bed[data-id]:not(.duplicate-bed)').forEach(el=>{
   bindLongPress(el,el.dataset.id);
 });
}
window.drawPatientList=function(...args){
 const value=priorDraw.apply(this,args);sync();return value;
};
function dropTarget(element){
 if(!element)return null;
 const tray=element.closest('#ux10Tray');if(tray)return {to:'',node:tray};
 const card=element.closest('#patientList .bed-slot');if(!card)return null;
 if(card.classList.contains('duplicate-bed'))return {to:card.dataset.bed,node:card};
 if(card.classList.contains('empty-bed'))return {to:card.dataset.newBed,node:card};
 const current=patient(card.dataset.id);
 if(current&&mapped(current.data?.['ベッド番号']))return {to:current.data['ベッド番号'],node:card};
 return null;
}
function highlight(next){
 if(hover?.node===next?.node)return;
 hover?.node?.classList.remove('ux10-drop-hover');
 hover=next;hover?.node?.classList.add('ux10-drop-hover');
}
/* UX11: native scrolling wins until an unmoving 600 ms long press.
 * Touch events are intentionally passive on start; preventDefault is used
 * only after the long-press has fired, never during normal scrolling. */
const HOLD_MS=600, MOVE_CANCEL_PX=12;
function bindLongPress(node,id,fromTray=false){
 if(node.dataset.ux11Ready==='1')return;
 node.dataset.ux11Ready='1';node.dataset.ux11Id=id;
 node.classList.add('ux11-movable');
 let gesture=null,timer=null;
 const clearTimer=()=>{if(timer!==null){clearTimeout(timer);timer=null}};
 function cleanup(){
   clearTimer();gesture=null;drag=null;
   ghost?.remove();ghost=null;highlight(null);
   node.classList.remove('ux11-holding');
 }
 function arm(x,y,kind,token){
   if(saving||confirming||!active()||editing()||!patient(id))return;
   cleanup();gesture={x,y,lastX:x,lastY:y,kind,token,armed:false};
   timer=setTimeout(()=>{
     timer=null;
     if(!gesture||gesture.armed||saving||confirming||!active()||editing()||!patient(id))return;
     gesture.armed=true;drag={id};
     selected=null;
     document.querySelectorAll('.ux10-selected').forEach(x=>x.classList.remove('ux10-selected'));
     node.classList.add('ux11-holding');
     const p=patient(id);
     ghost=document.createElement('div');ghost.id='ux10Ghost';
     ghost.textContent='移動：'+(p?.data?.['氏名']||'氏名未入力');
     document.body.appendChild(ghost);
     ghost.style.left=gesture.lastX+'px';ghost.style.top=gesture.lastY+'px';
   },HOLD_MS);
 }
 function move(x,y,event){
   if(!gesture)return;
   const dist=Math.hypot(x-gesture.x,y-gesture.y);
   if(!gesture.armed){
     if(dist>MOVE_CANCEL_PX)cleanup(); // native vertical/horizontal scroll continues
     return;
   }
   if(event.cancelable)event.preventDefault();
   event.stopPropagation();
   gesture.lastX=x;gesture.lastY=y;
   if(ghost){ghost.style.left=x+'px';ghost.style.top=y+'px'}
   highlight(dropTarget(document.elementFromPoint(x,y)));
 }
 function finish(x,y,event){
   if(!gesture)return;
   const held=gesture.armed;
   if(!held){cleanup();return}
   if(event.cancelable)event.preventDefault();
   event.stopPropagation();
   ignoreClick=Date.now()+900;ignoreClickSource=node;
   const dest=dropTarget(document.elementFromPoint(x,y));
   cleanup();
   const from=patient(id)?.data?.['ベッド番号']||'';
   if(dest&&normalizeBed(dest.to)!==normalizeBed(from)){
     requestMove(id,dest.to); // always opens confirmation before encrypted save
   }else{
     select(id); // release on same bed => tap destination; no data change
     toast('移動する患者を選びました。移動先のベッドか「その他・未配置」をタップ');
   }
 }
 node.addEventListener('touchstart',e=>{
   if(e.touches.length!==1)return;
   const t=e.changedTouches[0];
   arm(t.clientX,t.clientY,'touch',t.identifier);
 },{passive:true});
 node.addEventListener('touchmove',e=>{
   if(!gesture||gesture.kind!=='touch')return;
   const t=[...e.changedTouches].find(t=>t.identifier===gesture.token);
   if(t)move(t.clientX,t.clientY,e);
 },{passive:false});
 node.addEventListener('touchend',e=>{
   if(!gesture||gesture.kind!=='touch')return;
   const t=[...e.changedTouches].find(t=>t.identifier===gesture.token);
   if(t)finish(t.clientX,t.clientY,e);
 },{passive:false});
 node.addEventListener('touchcancel',()=>{if(gesture?.kind==='touch')cleanup()});
 node.addEventListener('pointerdown',e=>{
   if(e.pointerType==='touch'||e.button!==0)return;
   arm(e.clientX,e.clientY,'pointer',e.pointerId);
   if(gesture){try{node.setPointerCapture(e.pointerId)}catch(_){}}
 });
 node.addEventListener('pointermove',e=>{
   if(gesture?.kind==='pointer'&&e.pointerId===gesture.token)move(e.clientX,e.clientY,e);
 });
 node.addEventListener('pointerup',e=>{
   if(gesture?.kind==='pointer'&&e.pointerId===gesture.token)finish(e.clientX,e.clientY,e);
 });
 node.addEventListener('pointercancel',()=>{if(gesture?.kind==='pointer')cleanup()});
 node.addEventListener('lostpointercapture',()=>{if(gesture?.kind==='pointer')cleanup()});
 node.addEventListener('contextmenu',e=>{e.preventDefault()});
 if(fromTray){
   node.addEventListener('click',()=>{
     if(saving||confirming||!active()||editing()||selected)return;
     const p=patient(id);
     if(p&&typeof openPatient==='function')openPatient(p);
   });
 }
}
document.addEventListener('click',e=>{
 if(Date.now()<ignoreClick&&ignoreClickSource?.contains(e.target)){
   e.preventDefault();e.stopImmediatePropagation();return;
 }
 if(!selected||confirming||saving||!active())return;
 if(e.target.closest('.ux10-toggle,#ux10Confirm'))return;
 const target=dropTarget(e.target);if(!target)return;
 e.preventDefault();e.stopImmediatePropagation();requestMove(selected,target.to);
},true);
function getScroll(){
 return {top:Math.max(0,Number(window.scrollY||0)),
 horiz:[...document.querySelectorAll('#patientList .compact-room-scroll')].map(n=>n.scrollLeft)};
}
function putScroll(snapshot){
 function apply(){
   if(!active())return;
   const sc=document.scrollingElement||document.documentElement;
   window.scrollTo(0,Math.min(snapshot.top,Math.max(0,sc.scrollHeight-window.innerHeight)));
   document.querySelectorAll('#patientList .compact-room-scroll').forEach((n,i)=>{n.scrollLeft=snapshot.horiz[i]||0});
 }
 requestAnimationFrame(()=>{apply();requestAnimationFrame(apply)});
}
function info(panel,labelText,valueText){
 const row=document.createElement('div');row.className='ux10-row-info';
 const labelEl=document.createElement('span');labelEl.textContent=labelText;
 const valueEl=document.createElement('b');valueEl.textContent=valueText;
 row.append(labelEl,valueEl);panel.appendChild(row);
}
function requestMove(id,to){
 if(!active()||editing()||saving)return;
 const p=patient(id),from=p?.data?.['ベッド番号']||'';
 if(!p)return;
 if(to!==''&&!mapped(to)){toast('移動先のベッド番号が不正です');return}
 if(normalizeBed(from)===normalizeBed(to)){selected=null;toast('同じベッドへの移動はできません');return}
 const occupants=to?state.patients.filter(q=>q.id!==p.id&&!q.dischargeDate&&normalizeBed(q.data?.['ベッド番号'])===normalizeBed(to)):[];
 selected=null;confirming=true;
 const overlay=document.createElement('div');overlay.id='ux10Confirm';
 const panel=document.createElement('section');panel.className='ux10-dialog';
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 const title=document.createElement('h2');title.textContent='ベッド移動を確認';panel.appendChild(title);
 info(panel,'患者名',p.data?.['氏名']||'氏名未入力');
 info(panel,'患者ID',p.data?.['ＩＤ']||'未登録');
 info(panel,'移動元',bedText(from));info(panel,'移動先',bedText(to));
 const warning=document.createElement('p');
 if(occupants.length){
   warning.className='ux10-warning';
   warning.textContent='⚠ 移動先にはすでに'+occupants.length+'名います（'+occupants.map(x=>x.data?.['氏名']||'氏名未入力').join('、')+'）。確定すると「'+(occupants.length+1)+'名重複あり」と表示します。既存患者は上書きしません。';
 }else warning.textContent='確定するまで変更されません。未配置への移動も退院にはなりません。';
 panel.appendChild(warning);
 const actions=document.createElement('div');actions.className='ux10-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='やめる';
 const ok=document.createElement('button');ok.type='button';ok.className='ux10-ok';ok.textContent='移動を確定';
 actions.append(cancel,ok);panel.appendChild(actions);overlay.appendChild(panel);document.body.appendChild(overlay);
 const close=()=>{overlay.remove();confirming=false};
 cancel.onclick=()=>{if(!saving)close()};
 overlay.addEventListener('click',e=>{if(e.target===overlay&&!saving)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'&&!saving){e.preventDefault();close()}});
 cancel.focus({preventScroll:true});
 ok.onclick=async()=>{
   if(saving||!active()||!key||!state)return;
   if(typeof maintenanceBusyReason==='function'){
     const reason=maintenanceBusyReason();if(reason){toast(reason);return}
   }
   if(patient(id)!==p||normalizeBed(p.data?.['ベッド番号'])!==normalizeBed(from)){
     close();toast('患者情報が更新されたため中止しました');return;
   }
   saving=true;cancel.disabled=true;ok.disabled=true;ok.textContent='保存中…';
   const previous={bed:from,updated:p.updatedAt,pending:p.ux10PendingFromBed,
     history:p.ux10BedMoveHistory,admission:p.journalAdmissionPending};
   const scroll=getScroll();
   try{
     p.data['ベッド番号']=to;p.updatedAt=nowISO();
     p.ux10PendingFromBed=to?null:(mapped(from)?from:(p.ux10PendingFromBed||null));
     p.ux10BedMoveHistory=[...(Array.isArray(p.ux10BedMoveHistory)?p.ux10BedMoveHistory:[]),
       {from,to,at:nowISO()}].slice(-30);
     if(p.journalAdmissionPending===true&&mapped(to))p.journalAdmissionPending=false;
     await save();close();
     if(active()){window.drawPatientList();putScroll(scroll)}
     toast('保存完了：'+(p.data?.['氏名']||'患者')+' '+bedText(from)+' → '+bedText(to));
   }catch(e){
     p.data['ベッド番号']=previous.bed;p.updatedAt=previous.updated;
     if(previous.pending===undefined)delete p.ux10PendingFromBed;else p.ux10PendingFromBed=previous.pending;
     if(previous.history===undefined)delete p.ux10BedMoveHistory;else p.ux10BedMoveHistory=previous.history;
     if(previous.admission===undefined)delete p.journalAdmissionPending;else p.journalAdmissionPending=previous.admission;
     close();toast('保存に失敗したため元のベッドへ戻しました');
   }finally{saving=false;selected=null}
 };
}
const app=document.getElementById('app');
if(app){
 let queued=false;
 const observer=new MutationObserver(()=>{
   if(queued)return;queued=true;
   requestAnimationFrame(()=>{queued=false;sync()});
 });
 observer.observe(app,{childList:true,subtree:false});
}
window.__MSW_UX10_INSTALLED__=true;
if(active())sync();
})();