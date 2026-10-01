import { createRoot } from 'react-dom/client';
import { Participant } from './Participant.tsx';
import { Presenter } from './Presenter.tsx';
import { Display } from './Display.tsx';
import './styles.css';
const session=new URLSearchParams(location.search).get('session') || '';
createRoot(document.getElementById('root')!).render(location.pathname==='/presenter' ? <Presenter/> : location.pathname==='/display' ? <Display session={session}/> : <Participant/>);
