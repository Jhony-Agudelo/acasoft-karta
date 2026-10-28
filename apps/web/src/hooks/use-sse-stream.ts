import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { apiClient } from '../services/api-client';

export interface SseEventMessage {
  type: string;
  data: any;
}

export interface UseSseStreamOptions {
  url: string;
  authMode: 'jwt' | 'public_token';
  enabled?: boolean;
  onMessage?: (message: SseEventMessage) => void;
  onFallbackPoll?: () => void;
}

export function useSseStream({
  url,
  authMode,
  enabled = true,
  onMessage,
  onFallbackPoll,
}: UseSseStreamOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const token = apiClient.getToken();
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onFallbackPollRef = useRef(onFallbackPoll);
  onFallbackPollRef.current = onFallbackPoll;

  // Manejo de conexión persistente SSE
  useEffect(() => {
    if (!enabled || !url) {
      setIsConnected(false);
      return;
    }

    const abortController = new AbortController();

    async function connect() {
      try {
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
        };

        if (authMode === 'jwt' && token) {
          headers.Authorization = `Bearer ${token}`;
        }

        await fetchEventSource(url, {
          method: 'GET',
          headers,
          signal: abortController.signal,
          onopen: async (response) => {
            if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
              setIsConnected(true);
              setConnectionError(null);
            } else if (response.status === 401 || response.status === 403) {
              setConnectionError('Sesión no autorizada para el stream');
              throw new Error(`Unauthorized SSE: ${response.status}`);
            } else if (response.status === 410) {
              setConnectionError('El enlace de seguimiento ha expirado');
              throw new Error('Tracking link expired');
            }
          },
          onmessage: (event) => {
            setLastUpdatedAt(new Date());

            const eventType = event.event || 'message';
            if (eventType === 'ping') {
              // Heartbeat recibido
              setIsConnected(true);
              return;
            }

            let parsedData = event.data;
            try {
              parsedData = JSON.parse(event.data);
            } catch {
              // Dato de texto plano
            }

            if (onMessageRef.current) {
              onMessageRef.current({
                type: eventType,
                data: parsedData,
              });
            }
          },
          onerror: (err) => {
            setIsConnected(false);
            setConnectionError(err?.message || 'Error de conexión');
            // Retornar número para reintentar con backoff, o lanzar para detener
            return 3000;
          },
        });
      } catch (err: any) {
        if (!abortController.signal.aborted) {
          setIsConnected(false);
          setConnectionError(err?.message || 'Error de conexión SSE');
        }
      }
    }

    connect();

    return () => {
      abortController.abort();
      setIsConnected(false);
    };
  }, [url, authMode, token, enabled]);

  // Respaldo de polling cada 12 segundos si se pierde la conexión en modo público
  useEffect(() => {
    if (!enabled || isConnected || !onFallbackPollRef.current) {
      return;
    }

    const interval = setInterval(() => {
      if (onFallbackPollRef.current) {
        onFallbackPollRef.current();
        setLastUpdatedAt(new Date());
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [enabled, isConnected]);

  return {
    isConnected,
    lastUpdatedAt,
    connectionError,
  };
}
