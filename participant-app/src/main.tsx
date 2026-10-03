import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { Participant } from './Participant.tsx';
import './styles.css';
const Presenter = lazy(() =>
  import('./DashboardPresenter.tsx').then((module) => ({ default: module.DashboardPresenter })),
);
const LegacyPresenter = lazy(() =>
  import('./Presenter.tsx').then((module) => ({ default: module.Presenter })),
);
const Display = lazy(() => import('./Display.tsx').then((module) => ({ default: module.Display })));
const session = new URLSearchParams(location.search).get('session') || '';
createRoot(document.getElementById('root')!).render(
  <Suspense
    fallback={
      <div className="notice" role="status">
        Chargement de la présentation…
      </div>
    }
  >
    {location.pathname === '/presenter' ? (
      new URLSearchParams(location.search).has('legacy') ? (
        <LegacyPresenter />
      ) : (
        <Presenter />
      )
    ) : location.pathname === '/display' ? (
      <Display session={session} />
    ) : (
      <Participant />
    )}
  </Suspense>,
);
