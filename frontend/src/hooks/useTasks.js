import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const STORAGE_KEY = 'simplyfiles-tasks-dismissed-at';
const RECONNECT_DELAY = 3000;

export function useTasks() {
  const [tasks, setTasks] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [lastDismissedAt, setLastDismissedAt] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || null;
  });
  const eventSourceRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const hasActiveTasks = useMemo(() => {
    return tasks.some(t => t.status === 'PENDING' || t.status === 'STARTED');
  }, [tasks]);

  // SSE connection
  useEffect(() => {
    function connect() {
      const es = new EventSource('/api/documents/tasks/stream');
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setTasks(Array.isArray(data) ? data : []);
        } catch {
          // ignore malformed messages
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        // Auto-reconnect after delay
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
      };
    }

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, []);

  const unreadCount = useMemo(() => {
    if (!lastDismissedAt) return tasks.length;
    const dismissed = new Date(lastDismissedAt).getTime();
    return tasks.filter(t => new Date(t.created).getTime() > dismissed).length;
  }, [tasks, lastDismissedAt]);

  const visibleTasks = useMemo(() => {
    return tasks.filter(t => {
      const isActive = t.status === 'PENDING' || t.status === 'STARTED';
      if (isActive) return true;
      if (!lastDismissedAt) return true;
      return new Date(t.created).getTime() > new Date(lastDismissedAt).getTime();
    });
  }, [tasks, lastDismissedAt]);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const dismissAll = useCallback(() => {
    const now = new Date().toISOString();
    setLastDismissedAt(now);
    localStorage.setItem(STORAGE_KEY, now);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    tasks: visibleTasks,
    allTasks: tasks,
    isOpen,
    unreadCount,
    hasActiveTasks,
    toggle,
    dismissAll,
    close,
  };
}
