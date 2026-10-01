import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { type Snapshot } from '../../shared/model.ts';
import { request, ApiError } from './api.ts';

export function useLive(base: string, token: string, session?: string, onRevoked?: () => void) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!token && !session) return;
    let alive = true;
    const update = (s: Snapshot) => {
      if (alive) {
        setSnapshot(s);
        setError('');
      }
    };
    const refresh = () =>
      request<Snapshot>(
        base,
        token ? '/api/state' : `/api/public/state?session=${encodeURIComponent(session || '')}`,
        token,
      )
        .then(update)
        .catch((e: unknown) => {
          if (!alive) return;
          if (e instanceof ApiError && e.status === 401) onRevoked?.();
          setError(e instanceof Error ? e.message : 'Connexion impossible.');
        });
    const socket = io(base || undefined, {
      auth: token ? { token } : { public: true, sessionId: session },
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 8000,
    });
    socket.on('snapshot', update);
    socket.on('connect', () => {
      setConnected(true);
      void refresh();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => {
      setConnected(false);
      void refresh();
    });
    socket.on('revoked', () => onRevoked?.());
    void refresh();
    // Periodic reconciliation also handles phone background/sleep and expired credentials.
    const timer = setInterval(() => void refresh(), 10_000);
    const visible = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        socket.connect();
      }
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive = false;
      socket.disconnect();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [base, token, session, onRevoked]);
  return { snapshot, connected, error };
}
