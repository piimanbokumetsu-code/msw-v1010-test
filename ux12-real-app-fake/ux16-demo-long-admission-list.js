/* UX16 fake-test helper: show 25 EXTRA mock admission rows in the DOM.
 * These are purely visual and are NEVER saved as patient records.
 * This helper exists only in the isolated fake environment, not production.
 */
(function(){
  'use strict';
  if(window.__MSW_UX16_FAKE_LONG_LIST_INSTALLED__)return;
  if(typeof window.renderJournalPreview!=='function')return;
  window.__MSW_UX16_FAKE_LONG_LIST_INSTALLED__=true;
  let visible=false;

  function refreshDemoRows(){
    const tbody=document.querySelector('#main .journal-bed-btn')?.closest('table')?.querySelector('tbody')
      ||document.querySelector('#main #journalEntryToggle')?.closest('.panel')?.querySelector('table.journal-table tbody');
    if(!tbody)return;
    tbody.querySelectorAll('tr[data-ux16-sample]').forEach(row=>row.remove());
    const empty=tbody.querySelector('td[colspan]')?.closest('tr');
    if(empty)empty.style.display=visible?'none':'';
    if(!visible)return;
    for(let n=1;n<=25;n++){
      const row=document.createElement('tr');
      row.dataset.ux16Sample='1';
      for(const text of ['架空表示 '+String(n).padStart(2,'0'),'2026-11-18','未配置','表示のみ']){
        const cell=document.createElement('td');
        cell.textContent=text;
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
  }

  function attachDemoButton(){
    if(typeof screen==='undefined'||screen!=='journal')return;
    const toggle=document.getElementById('journalEntryToggle');
    const table=toggle?.closest('.panel')?.querySelector('.journal-table-wrap');
    if(!toggle||!table)return;
    const button=document.createElement('button');
    button.type='button';
    button.id='ux16DemoRowsToggle';
    button.className='btn secondary';
    button.style.cssText='margin:6px 0 10px;width:100%;background:#fff7db;border:1px solid #c48b31;color:#6b4000';
    button.textContent=visible?'表示用25行を消す（保存なし）':'テスト用に架空入院患者25名分を表示（保存なし）';
    button.onclick=()=>{
      visible=!visible;
      refreshDemoRows();
      button.textContent=visible?'表示用25行を消す（保存なし）':'テスト用に架空入院患者25名分を表示（保存なし）';
    };
    table.before(button);
    refreshDemoRows();
  }

  const prior=window.renderJournalPreview;
  window.renderJournalPreview=function(...args){
    const result=prior.apply(this,args);
    attachDemoButton();
    return result;
  };
})();
