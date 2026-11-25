/* UX24 fictional-only interactive preview.
 * No production patient records; notes live only in this open page and are lost on reload.
 * No network, external resources, IndexedDB, localStorage or sessionStorage.
 */
(function(){
 'use strict';
 const dateLabel=()=>{
   const d=new Date();
   return (d.getMonth()+1)+'/'+d.getDate();
 };
 document.querySelectorAll('.memo-add').forEach(btn=>{
  btn.addEventListener('click',()=>{
   const cell=btn.closest('.memo-cell');
   const field=cell?.querySelector('textarea');
   const history=cell?.querySelector('.memo-history');
   const note=field?.value.trim();
   if(!note){if(field)field.focus();return;}
   const line=document.createElement('div');
   line.className='memo-record';
   const date=document.createElement('b');
   date.textContent=dateLabel()+'　';
   const text=document.createElement('span');text.textContent=note;
   line.append(date,text);
   history.appendChild(line);
   field.value='';
   const status=document.getElementById('preview-status');
   if(status)status.textContent='架空の備考を追記しました。画面を再読み込みすると消えます（本番患者情報には保存されません）。';
  });
 });
})();
