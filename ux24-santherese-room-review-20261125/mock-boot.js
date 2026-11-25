/* Fake-only navigation and UI controls for UX24 test. */
(function(){
'use strict';
window.drawPatientList();
const root=document.getElementById('patientList');
const check=()=>{
 const rows=root.querySelectorAll('.ux24-patient-row');
 const groups=root.querySelectorAll('.ux24-room-heading');
 const rightmost=root.querySelector('.ux24-table thead th:last-child')?.textContent||'';
 const selected=rows.length===5&&groups.length===4&&rightmost.includes('備考');
 const status=document.getElementById('mock-message');
 if(status)status.textContent=selected
   ?'初期表示の確認合格：架空5名・4グループ・備考は一番右。'
   :'初期表示を確認してください（架空患者数や病室グループが想定と違います）。';
};
check();
document.getElementById('q')?.addEventListener('input',()=>window.drawPatientList());
document.getElementById('ward')?.addEventListener('change',()=>window.drawPatientList());
document.getElementById('mockRedraw')?.addEventListener('click',()=>{
 window.drawPatientList();
 const status=document.getElementById('mock-message');
 if(status)status.textContent='再表示しました。追記済みの履歴が残っているか確認してね。';
});
document.getElementById('mockSimulateFail')?.addEventListener('click',()=>{
 window.UX24MockFailNextSave=true;
 const status=document.getElementById('mock-message');
 if(status)status.textContent='次の「追記」は架空の保存失敗になります。入力が残る動作を確認できるよ。';
});
})();
