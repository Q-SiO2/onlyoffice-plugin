import { createRoot } from 'react-dom/client';
import { Display } from '../../participant-app/src/Display.tsx';
import '../../participant-app/src/styles.css';
const params=new URLSearchParams(location.search);
let mounted=false;
Asc.plugin.init=()=>{if(mounted)return;mounted=true;createRoot(document.getElementById('root')!).render(<Display base={params.get('backend') || ''} session={params.get('session') || ''} mode={params.get('mode') || 'results'}/>);};
Asc.plugin.button=()=>Asc.plugin.executeCommand('close','');
