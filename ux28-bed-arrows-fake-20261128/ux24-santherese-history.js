/* UX24: San Therese meeting list grouped by room, with append-only dated notes.
 * Reuses existing p.notes and encrypted save(); never replaces patient records,
 * changes storage formats, touches drug/photo/PIN data, or affects other lists.
 */
(function(){
  'use strict';
  if(window.__MSW_UX24_SAN_THERESE_INSTALLED__)return;
  if(typeof window.drawPatientList!=='function'||typeof window.openPatient!=='function'||
     typeof window.activePatients!=='function'||typeof window.save!=='function')return;
  window.__MSW_UX24_SAN_THERESE_INSTALLED__=true;

  const NOTE_TYPE='サン・テレーズ検討会';
  const MAX_NOTE_LENGTH=600;
  const original=window.drawPatientList;
  const clean=s=>String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const dateOf=at=>{
    const d=new Date(at);
    return Number.isNaN(d.getTime())?'日時不明':
      d.toLocaleDateString('ja-JP',{year:'numeric',month:'numeric',day:'numeric'});
  };
  const notesOf=p=>(Array.isArray(p?.notes)?p.notes:[])
    .filter(n=>n&&n.type===NOTE_TYPE&&typeof n.text==='string')
    .sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  const roomOf=p=>{
    const bed=normalizeBed(p?.data?.['ベッド番号']);
    if(!isMappedBed(bed))return'その他・未配置';
    for(const room of [...BED_LAYOUT,...ICU_LAYOUT]){
      const prefix=normalizeBed(room.room);
      if(bed===prefix||bed.startsWith(prefix+'-'))return room.room;
    }
    return'その他・未配置';
  };
  const roomRank=room=>{
    const rooms=[...BED_LAYOUT,...ICU_LAYOUT].map(r=>r.room);
    const idx=rooms.indexOf(room);
    return idx>=0?idx:rooms.length;
  };
  const admission=v=>{
    const s=String(v??'').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.replace(/-/g,'/'):s||'—';
  };
  const noteHtml=n=>'<div class="ux24-note"><time>'+clean(dateOf(n.at))+
    '</time><span>'+clean(n.text).replace(/\n/g,'<br>')+'</span></div>';
  let writing=false;

  function renderMeeting(){
    const root=document.getElementById('patientList');
    const tab=document.getElementById('showSanTherese');
    if(!root||tab?.getAttribute('aria-pressed')!=='true'||!state)return;
    const q=(document.getElementById('q')?.value||'').trim().toLowerCase();
    const ward=document.getElementById('ward')?.value||'';
    const patients=activePatients()
      .filter(p=>p.sanThereseMeeting===true&&patientMatches(p,q)&&
        (!ward||wardForBed(p.data?.['ベッド番号'])===ward))
      .sort((a,b)=>normalizeBed(a.data?.['ベッド番号'])
        .localeCompare(normalizeBed(b.data?.['ベッド番号']),'ja',{numeric:true}));
    if(!patients.length){
      root.innerHTML='<section class="santherese-list ux24-list"><h2>サン・テレーズ検討会 対象者一覧　0人</h2><div class="empty">対象者はいません。患者の「基本」タブで検討会にチェックを入れてください。</div></section>';
      return;
    }
    const byRoom=new Map();
    for(const p of patients){
      const room=roomOf(p);
      if(!byRoom.has(room))byRoom.set(room,[]);
      byRoom.get(room).push(p);
    }
    const rows=[...byRoom.entries()].sort((a,b)=>roomRank(a[0])-roomRank(b[0]))
      .map(([room,members])=>{
        const title=room==='その他・未配置'?room:room.startsWith('ICU')?room:room+'号室';
        const body=members.map(p=>{
          const d=p.data||{}, name=d['氏名']||'氏名未入力', pid=clean(p.id);
          const history=notesOf(p).map(noteHtml).join('');
          return '<tr class="ux24-patient-row"><td class="ux24-bed">'+clean(d['ベッド番号']||'未配置')+
            '</td><td class="ux24-name"><button type="button" class="ux24-open" data-id="'+pid+
            '">'+clean(name)+'</button></td><td class="ux24-date">'+clean(admission(d['入院日']))+
            '</td><td class="ux24-doctor">'+clean(d['主治医']||'—')+
            '</td><td class="ux24-disease">'+clean(d['病名']||'—')+
            '</td><td class="ux24-remarks"><div class="ux24-history" aria-label="過去の検討履歴">'+history+
            '</div><div class="ux24-entry"><textarea maxlength="'+MAX_NOTE_LENGTH+
            '" rows="2" aria-label="'+clean(name)+'の検討会備考" placeholder="見送り理由などを追記"></textarea>'+
            '<button type="button" class="btn secondary ux24-add" data-id="'+pid+'">追記</button></div>'+
            '<div class="ux24-status" role="status"></div></td></tr>';
        }).join('');
        return '<tbody class="ux24-room"><tr class="ux24-room-heading"><th colspan="6">'+
          clean(title)+'　'+members.length+'名</th></tr>'+body+'</tbody>';
      }).join('');
    root.innerHTML='<section class="santherese-list ux24-list"><h2>サン・テレーズ検討会 対象者一覧 <span class="count">'+
      patients.length+'人</span></h2><p class="notice">氏名をタップすると患者情報へ移動できます。備考は日付付きで追記され、過去の検討履歴も残ります。</p>'+
      '<div class="ux24-scroll"><table class="ux24-table"><colgroup>'+
      '<col class="ux24-col-bed"><col class="ux24-col-name"><col class="ux24-col-date">'+
      '<col class="ux24-col-doctor"><col class="ux24-col-disease"><col class="ux24-col-remarks">'+
      '</colgroup><thead><tr><th>ベッド</th><th>氏名</th><th>入院日</th><th>主治医</th><th>病名</th>'+
      '<th>備考（検討履歴）</th></tr></thead>'+rows+'</table></div></section>';
    root.querySelectorAll('.ux24-open').forEach(button=>{
      button.addEventListener('click',()=>{
        const patient=state?.patients?.find(p=>p.id===button.dataset.id&&!p.dischargeDate);
        if(patient)openPatient(patient);
      });
    });
    root.querySelectorAll('.ux24-add').forEach(button=>{
      button.addEventListener('click',()=>addRemark(button));
    });
  }

  async function addRemark(button){
    if(writing||!button?.isConnected)return;
    const row=button.closest('.ux24-patient-row');
    const field=row?.querySelector('textarea');
    const status=row?.querySelector('.ux24-status');
    const text=field?.value.trim();
    if(!field||!status||!text){field?.focus();return;}
    if(text.length>MAX_NOTE_LENGTH){
      status.textContent='備考は600文字以内で入力してください。';return;
    }
    const patient=state?.patients?.find(p=>p.id===button.dataset.id);
    if(!patient||patient._new||patient.dischargeDate||patient.sanThereseMeeting!==true||
       !key||!state){
      status.textContent='患者の状態が変わったため、保存していません。';return;
    }
    writing=true;button.disabled=true;
    status.textContent='暗号化して保存しています…';
    const note={id:uid(),type:NOTE_TYPE,at:nowISO(),text};
    const wasArray=Array.isArray(patient.notes);
    patient.notes=[...(wasArray?patient.notes:[]),note];
    try{
      await save();
      if(!key||!state||!row.isConnected)return;
      const history=row.querySelector('.ux24-history');
      if(history){
        const box=document.createElement('div');box.className='ux24-note';
        const time=document.createElement('time');time.textContent=dateOf(note.at);
        const content=document.createElement('span');content.textContent=note.text;
        box.append(time,content);
        history.prepend(box);
      }
      field.value='';
      status.textContent='日付付きで保存しました。';
    }catch(error){
      patient.notes=(Array.isArray(patient.notes)?patient.notes:[])
        .filter(n=>n!==note);
      if(!wasArray&&patient.notes.length===0)delete patient.notes;
      if(status.isConnected)status.textContent='保存できませんでした。入力は残しています。';
      alert('検討会の備考を保存できませんでした：'+String(error?.message||error));
    }finally{
      writing=false;
      if(button.isConnected)button.disabled=false;
    }
  }

  window.drawPatientList=function(...args){
    const result=original.apply(this,args);
    if(typeof sanThereseOnly!=='undefined'&&sanThereseOnly)renderMeeting();
    return result;
  };
  window.UX24MeetingReadOnly=Object.freeze({noteType:NOTE_TYPE,roomOf,notesOf,dateOf});
})();
