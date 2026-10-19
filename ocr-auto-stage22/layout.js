/* MSW Ver.1.0.21 stage22 — perspective correction + privacy-safe ICU/ward layout resembling the photographed template (synthetic ONLY).
   It is NOT validated for any original hospital sheet or identifiable patient.
   Geometry must be registered separately for real (de-identified) layouts.
   An unknown sheet fails closed rather than inventing rows. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.MSWJournalLayout=api;})(typeof window==='object'?window:null,function(){
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 function runs(hits,gap=3){let out=[];for(const p of hits){let q=out[out.length-1];if(q&&p-q.max<=gap)q.max=p;else out.push({min:p,max:p});}return out.map(q=>Math.round((q.min+q.max)/2));}
 function canvasOf(image,width,angle=0){const w=Math.round(width),h=Math.round(w*image.height/image.width),c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.fillStyle='#fff';g.fillRect(0,0,w,h);g.translate(w/2,h/2);g.rotate(angle*Math.PI/180);g.drawImage(image,-w/2,-h/2,w,h);g.setTransform(1,0,0,1,0,0);return c;}
 function mono(c){const data=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data,a=new Uint8Array(c.width*c.height);for(let i=0,j=0;i<data.length;i+=4,j++)a[j]=(data[i]*.299+data[i+1]*.587+data[i+2]*.114)<165?1:0;return a;}
 function horizontals(a,w,h,low=.43,high=.985){const x1=Math.round(w*.075),x2=Math.round(w*.94),ys=[];for(let y=Math.round(h*low);y<Math.round(h*high);y++){let dark=0,n=0;for(let x=x1;x<x2;x+=3){dark+=a[y*w+x];n++;}if(dark/n>.52)ys.push(y);}return runs(ys,3);}
 function deskew(image){
  if(image.width<900||image.height<1200)throw Error('画像が小さすぎます。A4の四隅が入るように鮮明に撮影してください。');
  const ratio=image.height/image.width;if(ratio<1.24||ratio>1.70)throw Error('A4縦向きの書式を検出できません。四隅を入れて撮影してください。');
  let scores=[];for(let angle=-3;angle<=3.01;angle+=.5){const c=canvasOf(image,640,angle),a=mono(c);const lines=horizontals(a,c.width,c.height);let score=lines.length;scores.push({angle,score});}
  scores.sort((a,b)=>b.score-a.score||Math.abs(a.angle)-Math.abs(b.angle));
  if(scores[0].score<3)throw Error('架空日誌の罫線を見つけられません。');
  const canvas=canvasOf(image,Math.min(image.width,1800),scores[0].angle);
  return {canvas,angle:scores[0].angle,lineScore:scores[0].score};
 }
 function vertical(a,w,h,top,bottom){const xhits=[];for(let x=Math.round(w*.05);x<Math.round(w*.96);x++){let dark=0,n=0;for(let y=top;y<bottom;y+=3){dark+=a[y*w+x];n++;}if(dark/n>.76)xhits.push(x);}return runs(xhits,3);}
 function findLine(ys,target,tol){const candidates=ys.filter(y=>Math.abs(y-target)<=tol);if(!candidates.length)throw Error('入院欄または退院欄の位置を特定できません。');return candidates.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0];}
 function rows(a,w,h,ys,top,bottom,name){
  const lines=ys.filter(y=>y>=top-3&&y<=bottom+3);const step=(bottom-top)/10;
  const ys10=[top];for(let i=1;i<=10;i++){
   const expected=top+i*step;const nearest=lines.slice().sort((x,y)=>Math.abs(x-expected)-Math.abs(y-expected))[0];
   if(nearest===undefined||Math.abs(nearest-expected)>Math.max(5,step*.25))throw Error('氏名欄の横罫線が不足しています。写真の下端や傾きを確認してください。');
   ys10.push(nearest);
  }
  let cells=[];
  for(let i=0;i<10;i++){
   const y1=ys10[i]+3,y2=ys10[i+1]-3;
   const x1=name.left+9,x2=name.right-9;let dark=0,n=0;
   for(let y=y1;y<y2;y+=2)for(let x=x1;x<x2;x+=2){dark+=a[y*w+x];n++;}
   const inkRatio=dark/Math.max(1,n);
   cells.push({row:i+1,rect:{x:x1,y:y1,w:x2-x1,h:y2-y1},inkRatio,likelyWritten:inkRatio>.009});
  }
  return {all:cells,written:cells.filter(v=>v.likelyWritten)};
 }
 function inspectAligned(image){
  const {canvas,angle,lineScore}=deskew(image),w=canvas.width,h=canvas.height,a=mono(canvas),lines=horizontals(a,w,h);
  if(lines.length<20)throw Error('模擬日誌の入退院表を検出できません。');
  // Anchors are bounded near the printed patient-table regions of this synthetic form.
  const aTop=findLine(lines,h*.467,h*.018),aEnd=findLine(lines,h*.726,h*.018);
  const dTop=aEnd,dEnd=findLine(lines,h*.978,h*.019);
  if(!(aTop<aEnd&&aEnd===dTop&&dTop<dEnd))throw Error('表の上下関係が一致しません。');
  const xs=vertical(a,w,h,aTop+Math.round(h*.023),aTop+Math.round(h*.180));
  if(xs.length<7)throw Error('氏名列の罫線を検出できません。');
  const targetL=w*.26625,targetR=w*.425;
  const left=xs.slice().sort((x,y)=>Math.abs(x-targetL)-Math.abs(y-targetL))[0];
  const right=xs.slice().sort((x,y)=>Math.abs(x-targetR)-Math.abs(y-targetR))[0];
  if(Math.abs(left-targetL)>w*.020||Math.abs(right-targetR)>w*.020||right-left<w*.12)throw Error('既知の架空日誌の氏名列とは異なります。');
  const name={left,right};
  const admission=rows(a,w,h,lines,aTop,aEnd,name),discharge=rows(a,w,h,lines,dTop,dEnd,name);
  const dateRect={x:Math.round(w*.103),y:Math.round(h*.076),w:Math.round(w*.34),h:Math.round(h*.023)};
  const warnings=['今回の認識位置は架空のICU・病棟共通模擬書式専用。実物の記録では未検証です。','見出しの印字人数、患者10枠超過、すべての氏名と日付を原本照合してください。'];
  if(Math.abs(angle)>=2.5)warnings.push('傾きが大きいため、原本との照合を厳重にしてください。');
  return {canvas,angle,lineScore,columns:xs,dateRect,admission,discharge,warnings};
 }
 // Stage22: align an A4-like synthetic table using intersections of its ruled lines.
 // Four table corners are measured from image pixels; no browser library or server needed.
 // This is deliberately bounded to the known SYNTHETIC fixture geometry.
 function locateRule(a,w,h,axis,center,along,span,search){
   let best=null;
   for(let shift=-search;shift<=search;shift++){
     const position=Math.round(center+shift);
     if(position<4||(axis==='x'?position>=w-4:position>=h-4))continue;
     let count=0,score=0;
     for(let delta=-span;delta<=span;delta++){
       let x=axis==='x'?position:Math.round(along+delta),y=axis==='x'?Math.round(along+delta):position;
       if(x<2||x>=w-2||y<2||y>=h-2)continue;
       // Include small anti-alias/bending tolerance; distant nearby text cannot dominate.
       const ix=y*w+x;
       const dark=a[ix]||a[ix-1]||a[ix+1]||(axis==='x'?(a[ix-w]||a[ix+w]):0);
       score+=dark?1:0;count++;
     }
     const occupancy=score/Math.max(1,count);
     const value=occupancy-.001*Math.abs(shift);
     if(!best||value>best.value)best={position,occupancy,value};
   }
   if(!best||best.occupancy<.60)throw Error('斜め写真の基準罫線を十分に検出できません。撮り直しをお願いします。');
   return best.position;
 }
 function crossing(A,B){
   // A horizontal y=m*x+b, B vertical x=m*y+b.
   const den=1-A.m*B.m;
   if(Math.abs(den)<.08)throw Error('罫線の交点を推定できません。');
   const x=(B.m*A.b+B.b)/den;
   return {x,y:A.m*x+A.b};
 }
 function lineThrough(p,q,axis){
   if(axis==='horizontal'){const m=(q.y-p.y)/(q.x-p.x);return {m,b:p.y-m*p.x};}
   const m=(q.x-p.x)/(q.y-p.y);return {m,b:p.x-m*p.y};
 }
 function solve8(a,b){
   const m=a.map((row,i)=>[...row,b[i]]);
   for(let col=0;col<8;col++){
     let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(m[row][col])>Math.abs(m[pivot][col]))pivot=row;
     if(Math.abs(m[pivot][col])<1e-9)throw Error('遠近補正の座標計算に失敗しました。');
     [m[col],m[pivot]]=[m[pivot],m[col]];
     const inv=1/m[col][col];for(let j=col;j<=8;j++)m[col][j]*=inv;
     for(let i=0;i<8;i++)if(i!==col){const q=m[i][col];for(let j=col;j<=8;j++)m[i][j]-=q*m[col][j];}
   }
   return m.map(row=>row[8]);
 }
 function homography(ideal,measured){
   const M=[],v=[];
   for(let i=0;i<4;i++){
     const {x,y}=ideal[i],{x:u,y:t}=measured[i];
     M.push([x,y,1,0,0,0,-u*x,-u*y]);v.push(u);
     M.push([0,0,0,x,y,1,-t*x,-t*y]);v.push(t);
   }
   return solve8(M,v);
 }
 function warpPerspectiveCanvas(source,ideal,measured){
   const w=source.width,h=source.height,coef=homography(ideal,measured);
   const src=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
   const result=document.createElement('canvas');result.width=w;result.height=h;
   const output=result.getContext('2d',{willReadFrequently:true});const pixels=output.createImageData(w,h),dst=pixels.data;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const den=coef[6]*x+coef[7]*y+1;
     const sx=(coef[0]*x+coef[1]*y+coef[2])/den;
     const sy=(coef[3]*x+coef[4]*y+coef[5])/den;
     const j=(y*w+x)*4;
     if(sx<0||sy<0||sx>=w-1||sy>=h-1){dst[j]=dst[j+1]=dst[j+2]=dst[j+3]=255;continue;}
     const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
     const p=(iy*w+ix)*4,q=p+w*4;
     for(let k=0;k<3;k++)dst[j+k]=Math.round(src[p+k]*(1-fx)*(1-fy)+src[p+4+k]*fx*(1-fy)+src[q+k]*(1-fx)*fy+src[q+4+k]*fx*fy);
     dst[j+3]=255;
   }
   output.putImageData(pixels,0,0);return result;
 }
 function correctPerspective(image){
   if(image.width<900||image.height<1200)throw Error('画像の解像度が不足しています。');
   const ratio=image.height/image.width;if(ratio<1.24||ratio>1.7)throw Error('A4全体が入った縦向き画像を使ってください。');
   const c=canvasOf(image,Math.min(image.width,1600)),w=c.width,h=c.height,a=mono(c),scale=w/1600;
   const xL=84*scale,xR=1570*scale, yA=1056*h/2260,yB=2210*h/2260;
   // Vertical fiducials at two heights each, horizontal fiducials at two columns each.
   const sidePts={};
   for(const [k,x] of [['left',xL],['right',xR]]){
     const y1=Math.round(h*.58),y2=Math.round(h*.84);
     const p=locateRule(a,w,h,'x',x,y1,Math.round(25*h/2260),Math.round(45*scale));
     const q=locateRule(a,w,h,'x',x,y2,Math.round(25*h/2260),Math.round(45*scale));
     sidePts[k]=lineThrough({x:p,y:y1},{x:q,y:y2},'vertical');
   }
   const hlines={};
   for(const [k,y] of [['top',yA],['bottom',yB]]){
     const x1=Math.round(w*.21),x2=Math.round(w*.71);
     const p=locateRule(a,w,h,'y',y,x1,Math.round(22*scale),Math.round(42*h/2260));
     const q=locateRule(a,w,h,'y',y,x2,Math.round(22*scale),Math.round(42*h/2260));
     hlines[k]=lineThrough({x:x1,y:p},{x:x2,y:q},'horizontal');
   }
   const measured=[crossing(hlines.top,sidePts.left),crossing(hlines.top,sidePts.right),crossing(hlines.bottom,sidePts.right),crossing(hlines.bottom,sidePts.left)];
   const ideal=[{x:xL,y:yA},{x:xR,y:yA},{x:xR,y:yB},{x:xL,y:yB}];
   const shifts=ideal.map((p,i)=>Math.hypot(p.x-measured[i].x,p.y-measured[i].y));
   if(shifts.some(s=>s>w*.075))throw Error('台形のゆがみが大きく補正できません。四隅が写るように撮り直してください。');
   const maxShift=Math.max(...shifts);
   if(maxShift<2)return {canvas:c,corrected:false,shift:maxShift};
   return {canvas:warpPerspectiveCanvas(c,ideal,measured),corrected:true,shift:maxShift};
 }
 function inspect(image){
  // Keep stage21's proven rotation path intact; only attempt projective
  // rectification when the original ruled-table detector cannot validate it.
  try {return inspectAligned(image);}catch(originalError){
   let correction;
   try{correction=correctPerspective(image);}catch(e){throw Error('日誌の表を検出できません。'+e.message);}
   if(!correction.corrected)throw originalError;
   const plan=inspectAligned(correction.canvas);
   plan.perspectiveCorrected=true;plan.perspectiveShift=correction.shift;
   plan.warnings.unshift('斜め撮影の台形補正を適用しました。必ず原本で全件照合してください。');
   return plan;
  }
 }
 function crop(canvas,rect,margin=0){const c=document.createElement('canvas');const x=clamp(Math.floor(rect.x-margin),0,canvas.width),y=clamp(Math.floor(rect.y-margin),0,canvas.height),r=clamp(Math.ceil(rect.x+rect.w+margin),0,canvas.width),b=clamp(Math.ceil(rect.y+rect.h+margin),0,canvas.height);c.width=Math.max(1,r-x);c.height=Math.max(1,b-y);c.getContext('2d').drawImage(canvas,x,y,c.width,c.height,0,0,c.width,c.height);return c;}
 return {inspect,crop,deskew,correctPerspective};
});
