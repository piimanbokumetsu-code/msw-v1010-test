/* UX20 FAKE-STAGE: optional same-screen PDF share -> AirPrint for FICTIONAL prescriptions.
 * Adds a secondary button; the proven UX19 separate-tab printing remains intact.
 * Patient data is used only to create an in-memory PDF on user request; no DB
 * writes, downloads, external transmissions or permanent saved files.
 * System share destinations are user-selected and may retain their own copies.
 * PIN/background auto-lock policy is untouched.
 */
(function(){
  'use strict';
  if(window.__MSW_UX20_NATIVE_SHARE_PRESCRIPTION__)return;
  // Fake-stage adapter: same production code, bound only to fictional UX19 print records.
  const api=window.UX17PrescriptionPrintTest;
  if(!api?.readPatientRows||typeof window.renderPatientMedications!=='function')return;
  window.__MSW_UX20_NATIVE_SHARE_PRESCRIPTION__=true;
  const WIDTH=595.28,HEIGHT=841.89,SCALE=2,LEFT=42;
  const COLS=[26,148,71,77,188];
  const TABLE_WIDTH=COLS.reduce((a,b)=>a+b,0);
  const MAX_PAGES=12,MAX_PDF_SIZE=12*1024*1024;
  const HEADER_Y=181,TOP_OF_ROWS=215,FOOTER_START=735;
  const JP_FONT='"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic",sans-serif';
  let modal=null,pendingFile=null,busy=false,observer=null,selectedForModal=null;

  function clearModal(){
    if(observer){observer.disconnect();observer=null;}
    if(modal){modal.remove();modal=null;}
    pendingFile=null;selectedForModal=null;
  }
  // Never weaken auto-lock. Dismiss any sensitive transient UI on background.
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')clearModal();
  },true);
  window.addEventListener('pagehide',clearModal,true);

  function checkedRows(patient){
    if(!key||!state||!patient||patient._new)throw new Error('患者情報を開き、ロックを解除してください。');
    const data=api.readPatientRows(patient);
    if(!data.total)throw new Error('処方薬が登録されていません。');
    if(data.incomplete)throw new Error('数量・用法が未確認（旧形式を含む）の薬剤が'+data.incomplete+'件あります。電子カルテと照合し、入力・確認後に印刷してください。');
    if(!data.entries.length)throw new Error('印刷対象の現在の処方薬がありません。');
    for(const row of data.entries){
      if(!row||!['name','strength','dose','when'].every(k=>typeof row[k]==='string'&&row[k].trim()))
        throw new Error('印刷内容に未確認の項目があります。');
    }
    return data.entries;
  }
  function recordFingerprint(patient,rows){
    return JSON.stringify([String(patient.id||''),String(patient.data?.['氏名']||''),
      String(patient.data?.['ＩＤ']||''),rows.map(r=>[r.name,r.strength,r.dose,r.when])]);
  }
  function makeCanvas(){
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(WIDTH*SCALE);
    canvas.height=Math.round(HEIGHT*SCALE);
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('このiPadではPDF用の描画を利用できません。');
    ctx.setTransform(SCALE,0,0,SCALE,0,0);
    ctx.textBaseline='top';
    return {canvas,ctx};
  }
  function applyFont(ctx,size=11,bold=false){
    ctx.font=(bold?'700 ':'400 ')+size+'px '+JP_FONT;
  }
  function linesFor(ctx,str,width,size=11){
    const lines=[];let current='';
    applyFont(ctx,size);
    for(const char of Array.from(String(str??''))){
      // Preserve the data; never truncate words, medication names or directions.
      if(current&&ctx.measureText(current+char).width>width){
        lines.push(current);current=char;
      }else current+=char;
    }
    if(current)lines.push(current);
    return lines.length?lines:[''];
  }
  function rowLayout(ctx,record,n){
    const vals=[String(n),record.name,record.strength,record.dose,record.when];
    const wrapped=vals.map((v,i)=>linesFor(ctx,v,COLS[i]-10,10.3));
    const height=Math.max(38,...wrapped.map(a=>a.length*15.6+14));
    if(!Number.isFinite(height)||height>FOOTER_START-TOP_OF_ROWS)
      throw new Error('長い処方内容がA4の1行に収まりません。省略せず従来方式で印刷してください。');
    return {wrapped,height};
  }
  function buildPages(ctx,rows){
    const pages=[[]];let y=TOP_OF_ROWS;
    for(let i=0;i<rows.length;i++){
      const layout=rowLayout(ctx,rows[i],i+1);
      if(y+layout.height>FOOTER_START){
        if(pages.length>=MAX_PAGES)throw new Error('A4枚数が上限を超えました。省略せず従来方式で印刷してください。');
        pages.push([]);y=TOP_OF_ROWS;
      }
      pages[pages.length-1].push(layout);y+=layout.height;
    }
    return pages;
  }
  function text(ctx,str,x,y,size=11,bold=false,color='#111'){
    applyFont(ctx,size,bold);
    ctx.fillStyle=color;
    ctx.fillText(String(str),x,y);
  }
  function line(ctx,x1,y1,x2,y2,color='#555'){
    ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=.7;
    ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  }
  function renderPage(ctx,page,patient,index,total,quantity,createdAt){
    ctx.fillStyle='#fff';ctx.fillRect(0,0,WIDTH,HEIGHT);
    text(ctx,'現在の内服処方一覧（情報提供用）',LEFT,53,18,true);
    text(ctx,'氏名：'+String(patient.data?.['氏名']||'未記入'),LEFT,94,11.5,true);
    text(ctx,'患者ID：'+String(patient.data?.['ＩＤ']||'未記入'),LEFT,115,11);
    text(ctx,'作成日時：'+createdAt,LEFT,138,10);
    text(ctx,'薬剤数：'+quantity+'剤　'+(index+1)+'／'+total+'ページ',LEFT,157,10.5);
    ctx.fillStyle='#edf2f2';ctx.fillRect(LEFT,HEADER_Y,TABLE_WIDTH,TOP_OF_ROWS-HEADER_Y);
    const cols=['No.','薬剤名','規格','数量','用法'];
    let x=LEFT;
    cols.forEach((name,i)=>{text(ctx,name,x+5,HEADER_Y+10,10.5,true);x+=COLS[i]});
    line(ctx,LEFT,HEADER_Y,LEFT+TABLE_WIDTH,HEADER_Y);
    line(ctx,LEFT,TOP_OF_ROWS,LEFT+TABLE_WIDTH,TOP_OF_ROWS);
    let y=TOP_OF_ROWS;
    for(const record of page){
      x=LEFT;
      record.wrapped.forEach((segments,i)=>{
        segments.forEach((segment,j)=>text(ctx,segment,x+5,y+7+j*15.6,10.3));
        x+=COLS[i];
      });
      y+=record.height;
      line(ctx,LEFT,y,LEFT+TABLE_WIDTH,y);
    }
    x=LEFT;line(ctx,LEFT,HEADER_Y,LEFT,y);
    for(const width of COLS){x+=width;line(ctx,x,HEADER_Y,x,y);}
    text(ctx,'電子カルテの最新処方と照合済みの情報のみ、情報提供用として使用してください。',
      LEFT,HEIGHT-80,9.4);
    text(ctx,'患者情報を含みます。院内承認済みの印刷先のみ使用し、外部送信・保存を避けてください。',
      LEFT,HEIGHT-62,8.6,false,'#9a3412');
    text(ctx,(index+1)+' / '+total,WIDTH-78,HEIGHT-36,9.5);
  }
  function jpegFromCanvas(canvas){
    const src=canvas.toDataURL('image/jpeg',0.88);
    if(!src.startsWith('data:image/jpeg;base64,'))throw new Error('PDF画像の作成に失敗しました。');
    const bytes=atob(src.slice(src.indexOf(',')+1));
    const result=new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++)result[i]=bytes.charCodeAt(i);
    return result;
  }
  function makePdf(images,w,h){
    if(!images.length||images.length>MAX_PAGES)throw new Error('PDFページ数が不正です。');
    const encoder=new TextEncoder(),chunks=[],offsets=[];
    let length=0;
    function addBytes(bytes){chunks.push(bytes);length+=bytes.byteLength;}
    function addString(s){addBytes(encoder.encode(s));}
    function openObject(id){offsets[id]=length;addString(id+' 0 obj\n');}
    function closeObject(){addString('\nendobj\n');}
    const kids=images.map((_,i)=>(3+i*3)+' 0 R').join(' ');
    addString('%PDF-1.4\n%MSW\n');
    openObject(1);addString('<< /Type /Catalog /Pages 2 0 R >>');closeObject();
    openObject(2);addString('<< /Type /Pages /Kids ['+kids+'] /Count '+images.length+' >>');closeObject();
    for(let i=0;i<images.length;i++){
      const pageId=3+i*3,imId=pageId+1,contentId=pageId+2;
      const jpeg=images[i];
      openObject(pageId);
      addString('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+WIDTH+' '+HEIGHT+'] /Resources << /XObject << /Im0 '+imId+' 0 R >> >> /Contents '+contentId+' 0 R >>');
      closeObject();
      openObject(imId);
      addString('<< /Type /XObject /Subtype /Image /Width '+w+' /Height '+h+
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.byteLength+' >>\nstream\n');
      addBytes(jpeg);addString('\nendstream');closeObject();
      const commands='q\n'+WIDTH+' 0 0 '+HEIGHT+' 0 0 cm\n/Im0 Do\nQ\n';
      openObject(contentId);
      addString('<< /Length '+encoder.encode(commands).byteLength+' >>\nstream\n'+commands+'endstream');
      closeObject();
    }
    const xref=length,count=2+images.length*3;
    addString('xref\n0 '+(count+1)+'\n0000000000 65535 f \n');
    for(let n=1;n<=count;n++)
      addString(String(offsets[n]).padStart(10,'0')+' 00000 n \n');
    addString('trailer\n<< /Root 1 0 R /Size '+(count+1)+' >>\nstartxref\n'+xref+'\n%%EOF\n');
    if(length>MAX_PDF_SIZE)throw new Error('PDFが容量上限を超えました。従来方式で印刷してください。');
    return new File(chunks,'MSW-情報提供用-処方一覧.pdf',{type:'application/pdf'});
  }
  function buildPdf(patient,rows){
    // Limit memory use: reuse one canvas; retain only compressed JPEG bytes.
    let canvas=null;const images=[];
    try{
      const obj=makeCanvas();canvas=obj.canvas;
      const pages=buildPages(obj.ctx,rows);
      const date=new Date();
      const createdAt=date.getFullYear()+'/'+String(date.getMonth()+1).padStart(2,'0')+'/'+
        String(date.getDate()).padStart(2,'0')+' '+String(date.getHours()).padStart(2,'0')+':'+
        String(date.getMinutes()).padStart(2,'0');
      for(let i=0;i<pages.length;i++){
        renderPage(obj.ctx,pages[i],patient,i,pages.length,rows.length,createdAt);
        images.push(jpegFromCanvas(canvas));
      }
      return makePdf(images,canvas.width,canvas.height);
    }finally{
      if(canvas){canvas.width=0;canvas.height=0;}
      images.length=0;
    }
  }
  function showModal(){
    if(!navigator.share||typeof File!=='function'){
      alert('このiPadではPDF共有に対応していません。従来のA4印刷ボタンをお使いください。');
      return;
    }
    const patient=selectedPatient;let rows;
    if(!String(patient?.data?.['氏名']||'').includes('架空')){
      alert('架空患者以外の共有印刷はテスト環境では禁止です。');return;
    }
    try{rows=checkedRows(patient);}catch(e){alert(String(e.message||e));return;}
    clearModal();
    selectedForModal=patient;
    const fingerprint=recordFingerprint(patient,rows);
    const root=document.createElement('section');
    root.id='ux20NativeShareConfirm';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label','処方薬PDF共有印刷の確認');
    root.style.cssText='position:fixed;inset:0;z-index:2147483001;box-sizing:border-box;overflow:auto;background:#e7eeee;padding:14px;color:#172c35';
    const panel=document.createElement('div');
    panel.style.cssText='max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:19px;box-sizing:border-box;box-shadow:0 2px 12px #0002;font-size:16px;line-height:1.6';
    const h=document.createElement('h2');h.textContent='A4処方薬・共有印刷';h.style.cssText='font-size:19px;margin:0 0 12px';
    const p=document.createElement('p');
    p.textContent='電子カルテの最新処方と、変更・中止・頓服をすべて照合しましたか？確認済みの場合のみPDFを共有してください。薬価は掲載しません。';
    const privacy=document.createElement('p');
    privacy.textContent='患者情報を含むPDFです。共有先にコピーが残る場合があります。院内で許可されたプリンターへの印刷だけに使用し、外部送信・保存はしないでください。';
    privacy.style.cssText='font-weight:700;color:#9a3412';
    const status=document.createElement('p');status.id='ux20ShareStatus';status.textContent='A4・5列（薬剤名／規格／数量／用法）。既存の別タブ印刷も利用できます。';status.style.cssText='font-size:13px;color:#475569';
    const actions=document.createElement('div');actions.style.cssText='display:flex;gap:10px;flex-wrap:wrap';
    const go=document.createElement('button');
    go.id='ux20ShareGo';go.type='button';go.className='btn';
    go.textContent='照合済み・共有メニューを開く';
    const cancel=document.createElement('button');
    cancel.type='button';cancel.className='btn secondary';cancel.textContent='やめる・処方薬へ戻る';
    cancel.addEventListener('click',clearModal);
    go.addEventListener('click',()=>{
      if(busy)return;
      if(selectedPatient!==patient||selectedForModal!==patient||!key||!state){
        clearModal();alert('患者画面が変更されたため、共有印刷を中止しました。');return;
      }
      let live;
      try{live=checkedRows(patient);}catch(e){clearModal();alert(String(e.message||e));return;}
      if(recordFingerprint(patient,live)!==fingerprint){
        clearModal();alert('処方薬が変更されました。内容を再確認してから印刷してください。');return;
      }
      busy=true;go.disabled=true;status.textContent='印刷用PDFを端末内で準備しています。';
      try{
        // Build synchronously within this direct click gesture to preserve
        // user activation for iPad Web Share API (no await before share).
        pendingFile=buildPdf(patient,live);
        const payload={files:[pendingFile]};
        if(navigator.canShare&&!navigator.canShare(payload))
          throw new Error('PDFファイルの共有が利用できません。従来方式で印刷してください。');
        status.textContent='共有メニューの「プリント」を選んでください。';
        Promise.resolve(navigator.share(payload)).then(
          ()=>{clearModal();},
          e=>{
            if(e?.name==='AbortError')clearModal();
            else if(status.isConnected)status.textContent='PDF共有に失敗：'+String(e?.name||'不明');
          }
        ).finally(()=>{
          busy=false;pendingFile=null;
          if(go.isConnected)go.disabled=false;
        });
      }catch(e){
        busy=false;pendingFile=null;go.disabled=false;
        status.textContent='共有印刷を開始できませんでした：'+String(e?.message||e);
      }
    });
    actions.append(go,cancel);panel.append(h,p,privacy,status,actions);root.appendChild(panel);
    document.body.appendChild(root);modal=root;
    const app=document.getElementById('app');
    if(app&&typeof MutationObserver==='function'){
      observer=new MutationObserver(()=>{
        if(!key||!state||document.body.classList.contains('msw-private'))clearModal();
      });
      observer.observe(app,{childList:true});
    }
  }
  function addButton(){
    const page=document.querySelector('#tabbody .patient-med-page');
    const toolbar=page?.querySelector('#ux17PrintToolbar');
    if(!toolbar||toolbar.querySelector('#ux20NativeShareButton'))return;
    const btn=document.createElement('button');
    btn.id='ux20NativeShareButton';btn.type='button';btn.className='btn secondary';
    btn.textContent='A4共有印刷（新方式・架空確認）';
    btn.addEventListener('click',showModal);
    toolbar.appendChild(btn);
  }
  const previous=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const result=previous.apply(this,args);addButton();return result;
  };
  window.UX20SharePrescriptionCheck=Object.freeze({checkedRows,buildPdf});
})();
