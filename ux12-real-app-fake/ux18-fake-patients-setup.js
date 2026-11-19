/* UX18 FAKE-STAGE-ONLY optional setup. Never include in production.
 * Pressing the button explicitly creates three imaginary patients in the
 * ISOLATED stage database, so no one must hand-enter test patients.
 */
(function(){
'use strict';
if(window.__MSW_UX18_FAKE_SETUP__)return;
window.__MSW_UX18_FAKE_SETUP__=true;
const specs=[
 {marker:'UX18-DEMO-A',name:'仮想A',bed:'',id:'UX18-FAKE-A'},
 {marker:'UX18-DEMO-B',name:'仮想B',bed:'205-2',id:'UX18-FAKE-B'},
 {marker:'UX18-DEMO-C',name:'仮想C',bed:'ICU2-1',id:'UX18-FAKE-C'}
];
let busy=false;
function visible(){
 return typeof screen!=='undefined'&&screen==='patients'&&
   !!document.querySelector('#showAllPatients[aria-pressed="true"]');
}
function label(button){
 if(!state?.patients)return;
 const count=specs.filter(x=>state.patients.some(p=>p.ux18DemoMarker===x.marker)).length;
 button.textContent=count===3?'✅ 架空3人は登録済み':'🧪 UX18テスト用：架空3人を登録';
 button.disabled=busy||count===3;
}
async function add(button){
 if(busy||!visible()||!key||!state?.patients)return;
 const missing=specs.filter(x=>!state.patients.some(p=>p.ux18DemoMarker===x.marker));
 if(!missing.length){label(button);return}
 busy=true;button.disabled=true;
 const created=missing.map(x=>({
   id:uid(),ux18DemoMarker:x.marker,
   data:{'氏名':x.name,'フリガナ':'カソウ','ＩＤ':x.id,'ベッド番号':x.bed},
   status:'未設定',tasks:[],notes:[],medications:[],dischargeDate:null,
   createdAt:nowISO(),updatedAt:nowISO()
 }));
 const prior=[...state.patients];
 try{
   state.patients.push(...created);
   await save();
   const q=document.getElementById('q');
   if(q){q.value='仮想';q.dispatchEvent(new Event('input',{bubbles:true}));}
   window.drawPatientList();
   alert('架空患者3人をテスト環境に登録しました。「仮想」で検索すると、未配置・205-2・ICU2-1の3人を確認できます。');
 }catch(e){
   state.patients=prior;
   alert('架空患者の準備に失敗しました。データは元に戻しました。');
 }finally{busy=false;label(button)}
}
function install(){
 if(!visible())return;
 const bar=document.getElementById('ux18DestinationLauncher');
 if(!bar||bar.querySelector('#ux18FakeSetup'))return;
 const button=document.createElement('button');
 button.id='ux18FakeSetup';button.type='button';button.className='btn secondary';
 button.style.marginLeft='8px';button.style.fontSize='12px';
 button.style.minHeight='42px';button.onclick=()=>void add(button);
 bar.appendChild(button);bar.style.flexWrap='wrap';
 label(button);
}
const observer=new MutationObserver(()=>requestAnimationFrame(install));
observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
requestAnimationFrame(install);
document.addEventListener('click',event=>{
 if(event.target?.id==='showAllPatients')requestAnimationFrame(install);
});
})();