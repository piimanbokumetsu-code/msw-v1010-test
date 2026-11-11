
'use strict';
// UX10 FIXED TRAY: fake-only iPad test. No medical or private data and NO storage APIs.
(function(){
  const mapRooms=[
    ['201',6],['202',6],['203',7],['205',6],['206',6],['207',6],
    ['208',2],['210',2],['211',2],['212',4],['213',4]
  ];
  const fixtures=[
    {id:'F001',name:'架空 花子',bed:'201-1'},
    {id:'F002',name:'架空 太郎',bed:'202-1'},
    {id:'F003',name:'架空 次郎',bed:'205-2'},
    {id:'F004',name:'架空 三郎',bed:'205-2'},
    {id:'F005',name:'新規入院 テスト',bed:''},
    {id:'F006',name:'架空 四郎',bed:'207-1'}
  ];
  const patients=fixtures.map(p=>({id:p.id,name:p.name,bed:p.bed,from:p.bed||'',pending:!p.bed,history:[]}));
  const app=document.getElementById('app');
  let selected=null,dragging=null,folded=false,pendingMove=null,modalKind=null,toastTimer=null,ignoreClickUntil=0;
  let currentDrop=null,ghost=null;
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const one=id=>patients.find(p=>p.id===id);
  const inBed=bed=>patients.filter(p=>p.bed===bed);
  const inTray=()=>patients.filter(p=>!p.bed);
  const shownBed=bed=>bed||'その他・未配置';
  const getRoom=code=>mapRooms.find(x=>x[0]===code);
  function renderBed(bed){
    const ps=inBed(bed);
    if(ps.length>1)return '<div class="bed is-duplicate ux10-drop" data-target-bed="'+safe(bed)+'"><span class="bed-name">'+safe(bed)+'</span><button class="softbtn duplicate-open" data-open-duplicate="'+safe(bed)+'" type="button"><span class="duplicate-label">'+ps.length+'名重複あり</span><br><span class="duplicate-help">タップして全員表示</span></button></div>';
    if(ps.length===0)return '<button type="button" class="bed is-empty ux10-drop" data-target-bed="'+safe(bed)+'"><span class="bed-name">'+safe(bed)+'</span><span class="empty-label">空床</span></button>';
    const p=ps[0];
    return '<div class="bed ux10-drop drag-source'+(selected===p.id?' selected':'')+'" data-target-bed="'+safe(bed)+'" data-id="'+safe(p.id)+'"><span class="bed-name">'+safe(bed)+'</span><span class="patient-name">'+safe(p.name)+'</span><span class="bed-note">架空ID '+safe(p.id)+'</span><button type="button" class="drag-handle" data-drag-id="'+safe(p.id)+'" title="長押しして移動" aria-label="'+safe(p.name)+' を移動">↗</button></div>';
  }
  function renderTray(){
    const ps=inTray();
    return '<aside class="tray ux10-drop'+(folded?' collapsed':'')+'" data-tray-drop="1" aria-label="その他・未配置">'+
      '<div class="tray-head" data-tray-drop="1"><b>その他・未配置</b><span class="count">'+ps.length+'人</span>'+
      '<span class="hint">一時退避・新規入院</span><button type="button" class="tray-toggle" data-toggle-tray="1">'+(folded?'開く ▴':'閉じる ▾')+'</button></div>'+
      (folded?'':'<div class="tray-patients" data-tray-drop="1">'+(ps.length?ps.map(p=>
        '<div class="tray-person drag-source'+(selected===p.id?' selected':'')+'" data-pid="'+safe(p.id)+'" data-tray-drop="1"><span class="name">'+safe(p.name)+'</span><span class="source">'+(p.from?'元 '+safe(p.from)+' ／ 移動先確認中':'新規入院・未配置')+'</span><button type="button" class="drag-handle" data-drag-id="'+safe(p.id)+'" aria-label="'+safe(p.name)+' を移動">↗</button></div>'
      ).join(''):'<div class="tray-empty">現在、未配置の患者はいません</div>')+'</div>')+'</aside>';
  }
  function render(opts={}){
    const previousY=window.scrollY||0;
    app.innerHTML='<header class="top"><div class="topline"><h1>UX10 朝のベッド確認・移動テスト</h1><span class="test-flag">架空患者専用</span></div><small>本番データを使用しません／保存機能なし</small></header>'+
    '<main class="container"><section class="intro"><p>病室を順番に確認して、患者カード右上の <b>↗</b> を指で動かします。<br>'+
    '① 202-1の「架空 太郎」を下のトレーへ → ② 206-3までスクロール → ③ トレーから206-3へ移動。<br>'+
    '動かしにくければ、↗を<b>1回タップして選択</b> → 行き先をタップしてもOK。</p>'+
    '<div class="toolbar"><button type="button" class="softbtn" data-jump="202">202へ</button><button type="button" class="softbtn" data-jump="206">206へ</button><button type="button" class="softbtn" data-jump="205">重複の確認</button><button type="button" class="softbtn" id="reset">架空データを初期状態に戻す</button></div>'+
    '<p class="help-tip" id="hint">'+(selected?'移動する患者：'+safe(one(selected)?.name||'')+'。行き先のベッドまたは下のトレーをタップしてね。':'スクロールは普段どおり。↗をタップした場合は移動先をタップ。')+'</p></section>'+
    mapRooms.map(room=>'<section class="room" data-room="'+safe(room[0])+'" id="room'+safe(room[0])+'"><div class="room-head"><strong>'+safe(room[0])+'号室</strong><small>ベッド位置確認用</small></div><div class="beds">'+Array.from({length:room[1]},(_,i)=>renderBed(room[0]+'-'+(i+1))).join('')+'</div></section>').join('')+'</main>'+
    renderTray()+'<nav class="bottomnav" aria-label="架空の下部メニュー"><span>🏥 患者</span><span>📄 日誌</span><span>💊 薬情</span></nav>'+
    '<div id="modalRoot"></div><div id="toastRoot"></div>';
    bind();
    if(!opts.top){requestAnimationFrame(()=>{window.scrollTo(0,previousY)})}
    if(opts.target)requestAnimationFrame(()=>document.getElementById('room'+opts.target)?.scrollIntoView({block:'start'}));
  }
  function toast(message){
    const root=document.getElementById('toastRoot');if(!root)return;
    root.innerHTML='<div class="toast" role="status">'+safe(message)+'</div>';
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>{if(document.getElementById('toastRoot'))document.getElementById('toastRoot').innerHTML=''},2600);
  }
  function initConfirmation(pid,target){
    const p=one(pid);if(!p)return;
    if(p.bed===target){toast('移動前と移動先が同じです');return;}
    const occupants=target?inBed(target).filter(x=>x.id!==pid):[];
    pendingMove={pid,from:p.bed,to:target,occupants};
    modalKind='confirm';selected=null;
    const inner='<h2>ベッド移動を確認</h2><div class="line"><span>患者名</span><strong>'+safe(p.name)+'</strong></div>'+
    '<div class="line"><span>架空ID</span><strong>'+safe(p.id)+'</strong></div>'+
    '<div class="line"><span>移動元</span><strong>'+safe(shownBed(p.bed))+'</strong></div>'+
    '<div class="line"><span>移動先</span><strong>'+safe(shownBed(target))+'</strong></div>'+
    (occupants.length?'<p class="warning">⚠ 移動先にはすでに '+occupants.length+' 名います（'+safe(occupants.map(x=>x.name).join('、'))+'）。確定すると重複になり、従来どおり赤字で「'+(occupants.length+1)+'名重複あり」と表示します。既存患者は上書きしません。</p>':'<p class="normal-hint">「移動を確定」を押すまで変更は行われません。その他・未配置への移動も退院扱いにはなりません。</p>')+
    '<div class="actions"><button type="button" data-cancel="1">やめる</button><button type="button" class="primary" data-confirm="1">移動を確定</button></div>';
    openDialog(inner);
  }
  function openDialog(inner){
    const root=document.getElementById('modalRoot');if(!root)return;
    root.innerHTML='<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-label="ベッド移動確認">'+inner+'</div></div>';
    const cancel=root.querySelector('[data-cancel]');
    if(cancel)cancel.onclick=closeDialog;
    const btn=root.querySelector('[data-confirm]');
    if(btn)btn.onclick=confirmMove;
    const overlay=root.querySelector('.overlay');
    overlay.addEventListener('click',e=>{if(e.target===overlay)closeDialog()});
  }
  function closeDialog(){
    modalKind=null;pendingMove=null;
    const root=document.getElementById('modalRoot');if(root)root.innerHTML='';
  }
  function confirmMove(){
    const move=pendingMove;if(!move||modalKind!=='confirm')return;
    const p=one(move.pid);if(!p||p.bed!==move.from){closeDialog();toast('移動元が変わったため中止しました');return;}
    const snapshot={...p,history:[...p.history]};
    try{
      p.bed=move.to;
      if(move.to===''){
        p.from=move.from||p.from||'';
        p.pending=true;
      }else{
        p.from=move.from||p.from||'';
        p.pending=false;
      }
      p.history.push({from:move.from,to:move.to,time:new Date().toISOString()});
      const newBed=move.to,dup=newBed?inBed(newBed).length:0;
      closeDialog();render();
      toast(p.name+'：'+shownBed(move.from)+' → '+shownBed(newBed)+(dup>1?'（重複警告を表示中）':''));
    }catch(e){
      Object.assign(p,snapshot);closeDialog();render();toast('更新に失敗しました。変更は取り消しました');
    }
  }
  function showDuplicates(bed){
    const ps=inBed(bed);
    if(ps.length<2)return;
    modalKind='duplicate';
    const inner='<h2 class="red">'+safe(bed)+'　'+ps.length+'名重複あり</h2>'+
      '<p class="normal-hint">従来と同じく、重複した全員を表示します。どちらの患者も消えません。</p>'+
      ps.map((p,i)=>'<div class="patient-item"><b>患者 '+(i+1)+'／'+ps.length+'：'+safe(p.name)+'</b><div class="id">架空ID：'+safe(p.id)+' ／ '+safe(bed)+'</div><button data-select-patient="'+safe(p.id)+'" type="button">この患者を移動する</button></div>').join('')+
      '<div class="actions"><button type="button" data-cancel="1">戻る</button></div>';
    openDialog(inner);
    document.querySelectorAll('[data-select-patient]').forEach(el=>el.onclick=()=>{
      selected=el.dataset.selectPatient;closeDialog();render();toast(one(selected).name+'を選択。行き先をタップしてください');
    });
  }
  function bind(){
    document.querySelectorAll('[data-jump]').forEach(el=>el.onclick=()=>{
      const target=document.getElementById('room'+el.dataset.jump);target?.scrollIntoView({block:'start',behavior:'auto'});
    });
    document.getElementById('reset').onclick=()=>{
      fixtures.forEach(f=>{const p=one(f.id);p.bed=f.bed;p.from=f.bed||'';p.pending=!f.bed;p.history=[]});
      selected=null;folded=false;render({top:true});window.scrollTo(0,0);toast('架空患者を初期状態に戻しました');
    };
    document.querySelectorAll('[data-toggle-tray]').forEach(el=>el.onclick=e=>{e.stopPropagation();folded=!folded;render()});
    document.querySelectorAll('[data-open-duplicate]').forEach(el=>el.onclick=e=>{
      e.stopPropagation();if(Date.now()<ignoreClickUntil)return; if(selected)initConfirmation(selected,el.dataset.openDuplicate);else showDuplicates(el.dataset.openDuplicate);
    });
    document.querySelectorAll('[data-target-bed]').forEach(el=>el.addEventListener('click',e=>{
      if(e.target.closest('[data-drag-id], [data-open-duplicate]'))return;
      if(Date.now()<ignoreClickUntil)return;
      const bed=el.dataset.targetBed;
      if(selected){initConfirmation(selected,bed);return;}
      const ps=inBed(bed);if(ps.length>1)showDuplicates(bed);
      else if(ps.length===1)toast('患者を動かすには右上の ↗ をタップまたはドラッグしてね');
      else toast('空床：移動する患者の ↗ をタップして選択してね');
    }));
    document.querySelectorAll('[data-tray-drop]').forEach(el=>el.addEventListener('click',e=>{
      if(e.target.closest('[data-drag-id],[data-toggle-tray]'))return;
      if(Date.now()<ignoreClickUntil)return;
      if(selected){initConfirmation(selected,'');return;}
    }));
    document.querySelectorAll('[data-drag-id]').forEach(handle=>{
      handle.addEventListener('click',e=>{
        e.stopPropagation();
        if(Date.now()<ignoreClickUntil)return;
        selected=selected===handle.dataset.dragId?null:handle.dataset.dragId;
        render();
        if(selected)toast(one(selected).name+'を選択。移動先をタップしてください');
      });
      installDrag(handle);
    });
  }
  function dropAt(x,y){
    const el=document.elementFromPoint(x,y);
    if(!el)return null;
    const target=el.closest('[data-target-bed]');
    if(target)return {bed:target.dataset.targetBed,node:target};
    const tray=el.closest('[data-tray-drop]');
    if(tray)return {bed:'',node:document.querySelector('.tray')};
    return null;
  }
  function paintHover(target){
    if(currentDrop?.node===target?.node)return;
    currentDrop?.node?.classList.remove('is-hover');
    currentDrop=target;
    currentDrop?.node?.classList.add('is-hover');
  }
  function installDrag(handle){
    let down=null,arm=null;
    const threshold=10;
    function begin(ev){
      if(!down||dragging||modalKind)return;
      const p=one(down.pid);if(!p)return;
      dragging={pid:p.id,started:true};
      selected=null;
      ghost=document.createElement('div');
      ghost.className='drag-ghost';
      ghost.textContent='↗ '+p.name;
      document.body.appendChild(ghost);
      ghost.style.left=ev.clientX+'px';ghost.style.top=ev.clientY+'px';
      toast('移動先へドラッグ。下部のその他・未配置にも置けます');
      paintHover(dropAt(ev.clientX,ev.clientY));
    }
    function clean(){
      clearTimeout(arm);arm=null;down=null;dragging=null;
      ghost?.remove();ghost=null;paintHover(null);
    }
    handle.addEventListener('pointerdown',ev=>{
      if(ev.button!==undefined&&ev.button!==0)return;
      if(modalKind||dragging)return;
      const pid=handle.dataset.dragId;
      down={pid,x:ev.clientX,y:ev.clientY,pointerId:ev.pointerId};
      if(handle.setPointerCapture){try{handle.setPointerCapture(ev.pointerId)}catch(e){}}
      arm=setTimeout(()=>{if(down)begin({clientX:down.x,clientY:down.y})},290);
    });
    handle.addEventListener('pointermove',ev=>{
      if(!down||ev.pointerId!==down.pointerId)return;
      const d=Math.hypot(ev.clientX-down.x,ev.clientY-down.y);
      if(!dragging&&d>=threshold){clearTimeout(arm);arm=null;begin(ev)}
      if(dragging){
        ev.preventDefault();
        ghost.style.left=ev.clientX+'px';ghost.style.top=ev.clientY+'px';
        paintHover(dropAt(ev.clientX,ev.clientY));
      }
    });
    handle.addEventListener('pointerup',ev=>{
      if(!down||ev.pointerId!==down.pointerId)return;
      const active=!!dragging, pid=down.pid;
      const target=active?dropAt(ev.clientX,ev.clientY):null;
      clean();
      if(active){
        ignoreClickUntil=Date.now()+550;
        ev.preventDefault();
        if(target)initConfirmation(pid,target.bed);
        else toast('移動先が見つかりません。もう一度ドラッグしてね');
      }
    });
    handle.addEventListener('pointercancel',clean);
    handle.addEventListener('lostpointercapture',()=>{if(down)clean()});
  }
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(modalKind)closeDialog();
      else if(selected){selected=null;render()}
    }
  });
  render({top:true});
})();
