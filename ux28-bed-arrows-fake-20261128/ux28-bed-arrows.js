/* UX28: optional patient-next/previous navigation in the existing modal.
 * Reuses native bed layout, active-patient list, and safe save-before-navigation.
 * No new storage, patient mutations, data migration or external requests.
 */
(function(){
 'use strict';
 if(window.__MSW_UX28_ARROWS_INSTALLED__)return;
 if(typeof window.renderPatientModal!=='function'||
    typeof window.finishPatientAndNavigate!=='function'||
    typeof window.openPatient!=='function'||
    typeof window.activePatients!=='function'||
    typeof window.officialBeds!=='function'||
    typeof window.normalizeBed!=='function')return;
 window.__MSW_UX28_ARROWS_INSTALLED__=true;
 const originalModal=window.renderPatientModal;
 let busy=false;
 function orderPatients(){
  const people=window.activePatients();
  const buckets=new Map();
  for(const person of people){
   const bed=window.normalizeBed(person?.data?.['ベッド番号']);
   if(!buckets.has(bed))buckets.set(bed,[]);
   buckets.get(bed).push(person);
  }
  const beds=window.officialBeds();
  const mapped=new Set(beds.map(window.normalizeBed));
  const ordered=beds.flatMap(bed=>buckets.get(window.normalizeBed(bed))||[]);
  const extras=people.filter(p=>!mapped.has(window.normalizeBed(p?.data?.['ベッド番号'])));
  // Unmapped patients remain visible at the end in a predictable bed/name order.
  extras.sort((a,b)=>{
   const aBed=window.normalizeBed(a?.data?.['ベッド番号']);
   const bBed=window.normalizeBed(b?.data?.['ベッド番号']);
   return aBed.localeCompare(bBed,'ja',{numeric:true});
  });
  return [...ordered,...extras];
 }
 function position(patient,people){
  return people.findIndex(p=>p===patient||String(p?.id)===String(patient?.id));
 }
 async function move(direction){
  if(busy)return;
  const current=window.selectedPatient,modal=document.getElementById('modal');
  if(!current||current._new||!modal||!window.key||!window.state)return;
  const people=orderPatients(),index=position(current,people),target=people[index+direction];
  if(index<0||!target||target===current)return;
  const stop=document.getElementById('ux27Stop');
  if(stop&&!stop.disabled){
   alert('音声入力を停止してから患者を切り替えてください。');
   return;
  }
  const draft=document.getElementById('ux27Text');
  if(draft?.value.trim()&&!confirm('未保存の回診メモがあります。保存せず次の患者へ移動しますか？'))return;
  busy=true;
  const left=document.getElementById('ux28Prev'),right=document.getElementById('ux28Next');
  if(left)left.disabled=true;
  if(right)right.disabled=true;
  try{
   await window.finishPatientAndNavigate(()=>{
    if(!window.key||!window.state||window.selectedPatient!==current)return;
    // Native patient transition already flushed current form fields, including IME.
    document.getElementById('modal')?.remove();
    window.openPatient(target);
   },{closing:true});
  }catch(_){
   alert('患者を切り替えられませんでした。現在の患者情報を確認してください。');
  }finally{
   busy=false;
   // A failed save leaves the original modal and its buttons intact.
   if(document.getElementById('modal')){
    const ordered=orderPatients(),i=position(window.selectedPatient,ordered);
    const prev=document.getElementById('ux28Prev');
    const next=document.getElementById('ux28Next');
    if(prev)prev.disabled=i<=0;
    if(next)next.disabled=i<0||i>=ordered.length-1;
   }
  }
 }
 function addButtons(){
  const modal=document.getElementById('modal');
  const patient=window.selectedPatient;
  const h2=modal?.querySelector('.sheethead .patient-sheet-title h2');
  if(!h2||!patient||patient._new||modal.querySelector('#ux28Nav'))return;
  const people=orderPatients(),i=position(patient,people);
  if(i<0)return; // Never navigate archived or newly registered patients.
  const nav=document.createElement('span');
  nav.id='ux28Nav';
  nav.className='ux28-arrows';
  nav.setAttribute('role','group');
  nav.setAttribute('aria-label','ベッド配置順で患者を切り替え');
  const prev=document.createElement('button');
  prev.type='button';prev.id='ux28Prev';prev.className='ux28-arrow';
  prev.textContent='←';prev.title='前の患者';
  prev.setAttribute('aria-label','前の患者');
  prev.disabled=i<=0;
  const next=document.createElement('button');
  next.type='button';next.id='ux28Next';next.className='ux28-arrow';
  next.textContent='→';next.title='次の患者';
  next.setAttribute('aria-label','次の患者');
  next.disabled=i>=people.length-1;
  prev.addEventListener('click',()=>void move(-1));
  next.addEventListener('click',()=>void move(1));
  nav.append(prev,next);
  h2.insertAdjacentElement('afterend',nav);
 }
 window.renderPatientModal=function(...args){
  const result=originalModal.apply(this,args);
  try{addButtons()}catch(_){/* This optional UI must never block patient viewing. */}
  return result;
 };
})();
