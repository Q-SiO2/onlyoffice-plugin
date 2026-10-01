import { createRoot } from 'react-dom/client';
import { AssetTray } from './AssetTray.tsx';
import { createAssetBridge } from './asset-bridge.ts';
import '../../participant-app/src/styles.css';
let initialized = false;
const bridge = createAssetBridge();
Asc.plugin.init = () => {
  if (initialized) return;
  initialized = true;
  createRoot(document.getElementById('root')!).render(<AssetTray bridge={bridge} />);
};
Asc.plugin.button = (_id, windowId) => {
  if (windowId) Asc.plugin.executeMethod('CloseWindow', [windowId]);
  else Asc.plugin.executeCommand('close', '');
};
