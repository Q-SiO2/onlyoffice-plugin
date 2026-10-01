import type { Aggregate } from '../../shared/model.ts';
const palette=['#6650cb','#177f79','#bd4b37'];
function wrap(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,lineHeight:number,maxLines=3) {
  const lines:string[]=[];let line='';
  for(const word of text.split(' ')) {const next=line ? `${line} ${word}` : word;if(ctx.measureText(next).width>width && line){lines.push(line);line=word;}else line=next;}
  lines.push(line);
  lines.slice(0,maxLines).forEach((s,i)=>ctx.fillText(i===maxLines-1 && lines.length>maxLines ? s+'…' : s,x,y+i*lineHeight));
  return Math.min(lines.length,maxLines)*lineHeight;
}
export function resultsPng(results:Aggregate,title:string,kind:'poll'|'words') {
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#f8f6ef';ctx.fillRect(0,0,1600,900);
  ctx.fillStyle='#6650cb';ctx.fillRect(70,58,12,42);ctx.fillStyle='#242744';ctx.font='bold 26px Arial';ctx.fillText('PALO ALTO LIVE',105,88);
  ctx.textAlign='right';ctx.font='24px Arial';ctx.fillText(`${results.total} participations`,1530,88);ctx.textAlign='left';
  ctx.font='bold 40px Arial';const headerHeight=wrap(ctx,title,70,160,1460,48,3);
  if(kind==='poll') {
    const top=180+headerHeight;const rowHeight=Math.min(130,(820-top)/Math.max(1,results.poll.length));
    results.poll.forEach((p,i)=>{
      const y=top+i*rowHeight;ctx.fillStyle='#242744';ctx.font='bold 25px Arial';
      wrap(ctx,p.label,70,y,1000,27,1);ctx.textAlign='right';ctx.font='24px Arial';ctx.fillText(`${p.count} votes · ${p.percentage} %`,1530,y);ctx.textAlign='left';
      ctx.fillStyle='#e7e4ef';ctx.fillRect(70,y+12,1460,Math.min(32,rowHeight-34));
      ctx.fillStyle=palette[i%3];ctx.fillRect(70,y+12,1460*p.percentage/100,Math.min(32,rowHeight-34));
    });
  } else {
    const max=Math.max(1,...results.words.map(w=>w.count));let x=85,y=260+headerHeight,lineHeight=0;
    // Greedy rows reserve bounding boxes; every word remains legible without overlap.
    results.words.forEach((w,i)=>{
      const size=Math.min(72,28+44*Math.sqrt(w.count/max));ctx.font=`bold ${size}px Arial`;
      const label=`${w.word} (${w.count})`;const width=ctx.measureText(label).width+42;
      if(x+width>1515){x=85;y+=lineHeight+28;lineHeight=0;}
      ctx.fillStyle=palette[i%3];ctx.fillText(label,x,y);x+=width;lineHeight=Math.max(lineHeight,size);
    });
    if(!results.words.length){ctx.font='32px Arial';ctx.fillStyle='#62627b';ctx.fillText('Aucun mot sélectionné.',85,360);}
  }
  return canvas.toDataURL('image/png');
}
