import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { EditorAssets } from '../../shared/model.ts';
import { ApiError, request } from '../../participant-app/src/api.ts';

export type EditorConnection = { base: string; token: string };
export function useEditorAssets(connection: EditorConnection | undefined, onRevoked: () => void) {
  const [assets, setAssets] = useState<EditorAssets>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setAssets(undefined);
    setConnected(false);
    setError('');
    if (!connection) return;
    let alive = true,
      last = '',
      requestNumber = 0,
      applied = 0;
    const update = (next: EditorAssets) => {
      if (!alive) return;
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setAssets(next);
      }
      setError('');
    };
    const refresh = async () => {
      const number = ++requestNumber;
      try {
        const next = await request<EditorAssets>(
          connection.base,
          '/api/editor/assets',
          connection.token,
        );
        if (!alive || number < applied) return;
        applied = number;
        update(next);
      } catch (e) {
        if (!alive || number < applied) return;
        if (e instanceof ApiError && e.status === 401) onRevoked();
        else setError(e instanceof Error ? e.message : 'Connexion impossible.');
      }
    };
    const socket = io(connection.base, {
      auth: { token: connection.token, editor: true },
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 8000,
    });
    socket.on('assets', (next: EditorAssets) => {
      // Ignore an HTTP response initiated before this newer socket snapshot.
      applied = ++requestNumber;
      update(next);
    });
    socket.on('connect', () => {
      if (alive) setConnected(true);
      void refresh();
    });
    socket.on('disconnect', () => {
      if (alive) setConnected(false);
    });
    socket.on('connect_error', () => {
      if (alive) setConnected(false);
      void refresh();
    });
    socket.on('revoked', onRevoked);
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    const reconcile = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        socket.connect();
      }
    };
    window.addEventListener('online', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      alive = false;
      socket.disconnect();
      clearInterval(timer);
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, [connection, onRevoked]);
  return { assets, connected, error };
}
