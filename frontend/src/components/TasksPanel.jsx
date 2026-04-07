import React, { useEffect, useRef } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import './TasksPanel.css';

function relativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function StatusIcon({ status }) {
  switch (status) {
    case 'PENDING':
    case 'STARTED':
      return <Loader2 size={16} className="tasks-panel-spinner spin" />;
    case 'COMPLETED':
      return <CheckCircle2 size={16} className="tasks-panel-icon-success" />;
    case 'FAILED':
      return <XCircle size={16} className="tasks-panel-icon-error" />;
    default:
      return null;
  }
}

export default function TasksPanel({ tasks, onDismiss, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        // Check if the click was on the indicator button itself
        const indicator = e.target.closest('.tasks-indicator');
        if (!indicator) {
          onClose();
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div className="tasks-panel" ref={panelRef}>
      <div className="tasks-panel-header">
        <span className="tasks-panel-title">Tasks</span>
        {tasks.length > 0 && (
          <button className="tasks-panel-dismiss" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>

      <div className="tasks-panel-list">
        {tasks.length === 0 ? (
          <div className="tasks-panel-empty">No recent tasks</div>
        ) : (
          tasks.map(task => {
            const name = task.result?.filename || task.task_id.slice(0, 8) + '...';
            return (
              <div key={task.task_id} className="tasks-panel-row">
                <StatusIcon status={task.status} />
                <div className="tasks-panel-info">
                  <div className="tasks-panel-name" title={name}>{name}</div>
                  {task.status === 'FAILED' && task.error && (
                    <div className="tasks-panel-error">{task.error}</div>
                  )}
                </div>
                <span className="tasks-panel-time">{relativeTime(task.created)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
