/* UX20 fake-only patient-medication native share test (2026-11-20).
 * Uses exactly the fake, verified prescription print model from UX19.
 * Does not alter existing print button, patient data, security locks or PWA.
 * No live patient records; no external calls; no persistence.
 */
(function(){
  'use strict';
  if(window.__MSW_UX20_SHARE_PATIENT_TEST__)return;
  const api=window.UX17PrescriptionPrintTest;
  if(!api?.readPatientRows||typeof window.renderPatientMedications!=='function')return;
  window.__MSW_UX20_SHARE_PATIENT_TEST__=true;
  function renderJapaneseA4(patient,entries){
    const W=595.28,H=841.89,scale=2;
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(W*scale);
    canvas.height=Math.round(H*scale);
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('Canvasが利用できません');
    ctx.setTransform(scale,0,0,scale,0,0);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
    ctx.textBaseline='top';
    const jpFont='"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic",sans-serif';
    function font(size,bold){
      ctx.font=(bold?'700 ':'400 ')+size+'px '+jpFont;
    }
    function text(str,x,y,size=12,bold=false,color='#111'){
      font(size,bold);ctx.fillStyle=color;ctx.fillText(str,x,y);
    }
    function line(x1,y1,x2,y2,color='#555'){
      ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=.7;
      ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    }
    function wrapped(str,width,size=12){
      font(size,false);
      const result=[];let cur='';
      for(const ch of Array.from(String(str))){
        if(cur && ctx.measureText(cur+ch).width>width){
          result.push(cur);cur=ch;
        }else cur+=ch;
      }
      if(cur)result.push(cur);
      return result;
    }
    text('架空テスト・実患者には使用不可',42,31,15,true,'#a32929');
    line(42,59,W-42,59,'#a32929');
    text('現在の内服処方一覧（情報提供用）',42,76,18,true);
    text('氏名：'+String(patient.data?.['氏名']||'未記入'),42,118,12,true);
    text('患者ID：'+String(patient.data?.['ＩＤ']||'未記入'),285,118,12);
    text('薬剤数：'+entries.length+'剤（架空データ専用）',42,141,11);
    const cols=[35,166,69,80,161],left=42,tableW=cols.reduce((a,b)=>a+b,0);
    if(tableW>W-left*2+1)throw new Error('表がA4の幅に収まりません');
    const headers=['No.','薬剤名','規格','数量','用法'];
    const rows=entries.map((r,i)=>[
      String(i+1),String(r.name),String(r.strength),String(r.dose),String(r.when)
    ]);
        let y=174;
    ctx.fillStyle='#edf2f2';ctx.fillRect(left,y,tableW,36);
    let xx=left;
    headers.forEach((h,i)=>{text(h,xx+6,y+10,11,true);xx+=cols[i]});
    line(left,y,left+tableW,y);line(left,y+36,left+tableW,y+36);
    y+=36;
    for(const row of rows){
      const lines=row.map((cell,i)=>wrapped(cell,cols[i]-12,11.5));
      const rh=Math.max(45,...lines.map(lines=>lines.length*17+14));
      if(y+rh>H-90)throw new Error('A4の高さを超えました');
      xx=left;
      lines.forEach((strings,i)=>{
        strings.forEach((segment,j)=>text(segment,xx+6,y+8+j*17,11.5));
        xx+=cols[i];
      });
      line(left,y+rh,left+tableW,y+rh);
      y+=rh;
    }
    xx=left;line(left,174,left,y);for(const w of cols){xx+=w;line(xx,174,xx,y);}
    text('この用紙は印刷機能の検証専用です。実際の処方ではありません。',42,Math.min(y+27,H-70),11,true,'#9a3412');
    text('UX20 共有印刷検証・端末内で生成・保存なし',42,H-43,9,false,'#64748b');
    return canvas;
  }
  function japanesePdf(canvas){
    const uri=canvas.toDataURL('image/jpeg',0.9);
    if(!uri.startsWith('data:image/jpeg;base64,'))throw new Error('JPEG生成に失敗しました');
    const binary=atob(uri.slice(uri.indexOf(',')+1));
    const jpg=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)jpg[i]=binary.charCodeAt(i);
    const enc=new TextEncoder();
    const pieces=[];let total=0;
    const offsets=[0];
    function putBytes(bytes){pieces.push(bytes);total+=bytes.byteLength}
    function put(str){putBytes(enc.encode(str))}
    function openObj(id){offsets[id]=total;put(id+' 0 obj\n')}
    function closeObj(){put('\nendobj\n')}
    put('%PDF-1.4\n%FAKE\n');
    openObj(1);put('<< /Type /Catalog /Pages 2 0 R >>');closeObj();
    openObj(2);put('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');closeObj();
    openObj(3);
    put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] '+
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    closeObj();
    openObj(4);
    put('<< /Type /XObject /Subtype /Image /Width '+canvas.width+
      ' /Height '+canvas.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 '+
      '/Filter /DCTDecode /Length '+jpg.byteLength+' >>\nstream\n');
    putBytes(jpg);put('\nendstream');closeObj();
    const content='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
    openObj(5);
    put('<< /Length '+enc.encode(content).byteLength+' >>\nstream\n'+content+'endstream');
    closeObj();
    const xref=total;
    put('xref\n0 6\n0000000000 65535 f \n');
    for(let id=1;id<=5;id++)put(String(offsets[id]).padStart(10,'0')+' 00000 n \n');
    put('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
    return new File(pieces,'FAKE-UX20-JAPANESE-A4.pdf',{type:'application/pdf'});
  }

  let shareBusy=false;
  function nativeShareFakePrescription(){
    if(shareBusy)return;
    if(!navigator.share||typeof File!=='function'){
      alert('このSafariではPDFの共有に対応していません。');return;
    }
    const patient=selectedPatient;
    if(!patient||!key||!state||patient._new){
      alert('架空患者を開き、暗証番号を解除してください。');return;
    }
    const name=String(patient.data?.['氏名']||'').trim();
    // Hard stop when an accidental non-fictional record is selected.
    if(!name.includes('架空')){
      alert('実患者と思われるデータはこの架空テストで印刷できません。');return;
    }
    const data=api.readPatientRows(patient);
    if(!data.total||data.incomplete||!data.entries.length){
      alert('未確認の処方薬があるため、共有印刷を中止しました。');return;
    }
    if(data.entries.length>20){
      alert('架空テストの1ページ上限を超えました。薬剤を省略せず、中止します。');return;
    }
    let canvas=null,file=null;
    try{
      canvas=renderJapaneseA4(patient,data.entries);
      file=japanesePdf(canvas);
    }catch(e){
      alert('架空PDFを生成できませんでした：'+String(e?.message||e));
      return;
    }finally{
      if(canvas){canvas.width=0;canvas.height=0;}
    }
    const payload={files:[file]};
    if(navigator.canShare&&!navigator.canShare(payload)){
      alert('この起動方式ではPDFファイルの共有に対応していません。');return;
    }
    // Important: invoke share within the original click gesture, no awaits.
    const button=document.getElementById('ux20NativeShareFake');
    const status=document.getElementById('ux20ShareStatus');
    shareBusy=true;
    if(button)button.disabled=true;
    if(status)status.textContent='架空処方薬PDFの共有メニューを開きました。';
    try{
      const result=navigator.share(payload);
      Promise.resolve(result).then(
        ()=>{
          if(status&&status.isConnected)status.textContent='共有操作が完了しました。処方薬画面に戻れているか確認してください。';
        },
        e=>{
          if(status&&status.isConnected)status.textContent=e?.name==='AbortError'?
            '共有メニューを閉じました。処方薬画面に戻れたか確認してください。':
            '共有処理エラー：'+String(e?.name||'不明');
        }
      ).finally(()=>{
        shareBusy=false;if(button?.isConnected)button.disabled=false;
        file=null;
      });
    }catch(e){
      shareBusy=false;if(button)button.disabled=false;
      if(status)status.textContent='共有メニュー起動エラー：'+String(e?.name||'不明');
      file=null;
    }
  }
  function addButton(){
    const root=document.querySelector('#tabbody .patient-med-page');
    const toolbar=root?.querySelector('#ux17PrintToolbar');
    if(!toolbar||toolbar.querySelector('#ux20NativeShareFake'))return;
    const b=document.createElement('button');
    b.id='ux20NativeShareFake';b.type='button';b.className='btn secondary';
    b.textContent='A4印刷（共有・戻りテスト）';
    b.addEventListener('click',nativeShareFakePrescription);
    const status=document.createElement('p');
    status.id='ux20ShareStatus';status.className='notice';
    status.textContent='架空患者専用・別タブなし。共有メニューの「プリント」で確認。';
    toolbar.appendChild(b);toolbar.after(status);
  }
  const previous=window.renderPatientMedications;
  window.renderPatientMedications=function(...args){
    const returned=previous.apply(this,args);
    addButton();return returned;
  };
  window.UX20NativeShareFakeTest=Object.freeze({renderJapaneseA4,japanesePdf});
})();
