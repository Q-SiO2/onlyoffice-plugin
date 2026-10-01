// Tiny geometric icon generated in code, without external fonts or an image service.
import { writeFile } from 'node:fs/promises';
import { zlibSync } from 'fflate';
function crc(data:Uint8Array) {let c=0xffffffff;for(const b of data){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1) ? 0xedb88320 : 0);}return (c^0xffffffff)>>>0;}
function chunk(type:string,data:Uint8Array){const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length,0);name.copy(out,4);Buffer.from(data).copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),out.length-4);return out;}
for(const size of [28,56]) {
  const pixels=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=x/size,ny=y/size;let color=[36,39,68,255];
    if((nx>.22 && nx<.35 && ny>.2 && ny<.82) || (nx>.34 && nx<.67 && ny>.2 && ny<.33) || (nx>.34 && nx<.67 && ny>.48 && ny<.6) || (nx>.58 && nx<.72 && ny>.28 && ny<.53))color=[255,255,255,255];
    if((nx-.77)**2+(ny-.76)**2<.006)color=[237,199,92,255];
    color.forEach((c,i)=>pixels[y*(size*4+1)+1+x*4+i]=c);
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlibSync(pixels)),chunk('IEND',new Uint8Array())]);
  await writeFile(`onlyoffice-plugin/${size===28 ? 'icon.png' : 'icon@2x.png'}`,png);
}
