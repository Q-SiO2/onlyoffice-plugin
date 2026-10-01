import { createRoot } from 'react-dom/client';
import { Presenter, type PluginBridge } from '../../participant-app/src/Presenter.tsx';
import '../../participant-app/src/styles.css';
let initialized=false;
const bridge:PluginBridge={
  insert:(dataUrl)=>new Promise<void>((resolve,reject)=>{
    Asc.scope.paloaltoImage=dataUrl;
    // This function is serialized by ONLYOFFICE. Keep it self-contained; use only Api and Asc.scope.
    Asc.plugin.callCommand(function(){
      try {
        const p=Api.GetPresentation(),slide=p.GetCurrentSlide();
        if(!slide)return {ok:false};
        const width=p.GetWidth(),height=p.GetHeight();
        const image=String(Asc.scope.paloaltoImage);
        // QR images are square; results are 16:9. Preserve aspect ratio within a 90% margin.
        const ratio=Number(Asc.scope.paloaltoRatio) || 16/9;
        const w=Math.min(width*.9,height*.9*ratio),h=w/ratio;
        const img=Api.CreateImage(image,w,h);
        img.SetPosition((width-w)/2,(height-h)/2);slide.AddObject(img);
        return {ok:true};
      }catch{return {ok:false};}
    },false,true,result=>{clearTimeout(timeout);if((result as {ok?:boolean})?.ok)resolve();else reject(new Error('Insertion impossible. Revenez au mode édition et sélectionnez une diapositive.'));});
    const timeout=setTimeout(()=>reject(new Error('Insertion non confirmée. Vérifiez la diapositive avant de réessayer.')),15_000);
  }),
  showWindow:(base,session,mode)=>{
    const win=new Asc.PluginWindow();
    const url=new URL('window.html',location.href);
    url.search=new URLSearchParams({backend:base,session,mode}).toString();
    win.show({url:url.href,description:mode==='qr' ? 'Rejoindre la présentation' : 'Résultats Palo Alto Live',type:'window',size:[1100,740],buttons:[{text:'Fermer',primary:false}]});
  },
};
const originalInsert=bridge.insert;
bridge.insert=async(data)=>{
  const img=new Image();img.src=data;
  await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Image non valide.'));});
  Asc.scope.paloaltoRatio=img.width/img.height;
  await originalInsert(data);
};
Asc.plugin.init=()=>{if(initialized)return;initialized=true;createRoot(document.getElementById('root')!).render(<Presenter bridge={bridge}/>);};
Asc.plugin.button=(_id,windowId)=>{if(windowId)Asc.plugin.executeMethod('CloseWindow',[windowId]);else Asc.plugin.executeCommand('close','');};
