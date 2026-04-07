import React from 'react';
import { ListTodo } from 'lucide-react';
import './TasksIndicator.css';

export default function TasksIndicator({ unreadCount, onClick }) {
  return (
    <button className="tasks-indicator" onClick={onClick} title="Tasks">
      <ListTodo size={15} />
      {unreadCount > 0 && (
        <span className="tasks-indicator-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
    </button>
  );
}
