import React, { useState } from 'react';
import { TodoStatus, TodoPriority, RecurrencePattern } from '../types/todo';
import type { Todo } from '../types/todo';
import { todoApi } from '../api/todoApi';

interface TodoFormProps {
  todo?: Todo | null;
  allTodos: Todo[];
  onSaved: () => void;
  onCancel: () => void;
}

export function TodoForm({ todo, allTodos, onSaved, onCancel }: TodoFormProps) {
  const isEditing = !!todo;
  const [name, setName] = useState(todo?.name || '');
  const [description, setDescription] = useState(todo?.description || '');
  const [dueDate, setDueDate] = useState(todo?.dueDate ? todo.dueDate.slice(0, 16) : '');
  const [status, setStatus] = useState<TodoStatus>(todo?.status || TodoStatus.NOT_STARTED);
  const [priority, setPriority] = useState<TodoPriority>(todo?.priority || TodoPriority.MEDIUM);
  const [recurrencePattern, setRecurrencePattern] = useState<string>(
    todo?.recurrencePattern || ''
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState<string>(
    todo?.recurrenceInterval?.toString() || ''
  );
  const [dependsOn, setDependsOn] = useState<string[]>(todo?.dependsOn || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload: Record<string, any> = {
        name,
        description,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        priority,
        recurrencePattern: recurrencePattern || null,
        recurrenceInterval: recurrencePattern === RecurrencePattern.CUSTOM && recurrenceInterval
          ? parseInt(recurrenceInterval, 10) : null,
        dependsOn,
      };

      if (isEditing) {
        payload.version = todo.version;
        payload.status = status;
        await todoApi.update(todo.id, payload);
      } else {
        payload.status = status;
        await todoApi.create(payload as any);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Available todos for dependency selection (exclude self and already-deleted)
  const availableDeps = allTodos.filter(
    (t) => t.id !== todo?.id && !t.isDeleted
  );

  return (
    <div className="todo-form-overlay">
      <form className="todo-form" onSubmit={handleSubmit}>
        <h2>{isEditing ? 'Edit TODO' : 'New TODO'}</h2>

        {error && <div className="error-banner">{error}</div>}

        <div className="form-group">
          <label>Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={500}
            placeholder="What needs to be done?"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="Additional details..."
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Due Date</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TodoPriority)}>
              <option value={TodoPriority.LOW}>Low</option>
              <option value={TodoPriority.MEDIUM}>Medium</option>
              <option value={TodoPriority.HIGH}>High</option>
            </select>
          </div>

          {isEditing && (
            <div className="form-group">
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TodoStatus)}>
                <option value={TodoStatus.NOT_STARTED}>Not Started</option>
                <option value={TodoStatus.IN_PROGRESS}>In Progress</option>
                <option value={TodoStatus.COMPLETED}>Completed</option>
                <option value={TodoStatus.ARCHIVED}>Archived</option>
              </select>
            </div>
          )}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Recurrence</label>
            <select
              value={recurrencePattern}
              onChange={(e) => setRecurrencePattern(e.target.value)}
            >
              <option value="">None</option>
              <option value={RecurrencePattern.DAILY}>Daily</option>
              <option value={RecurrencePattern.WEEKLY}>Weekly</option>
              <option value={RecurrencePattern.MONTHLY}>Monthly</option>
              <option value={RecurrencePattern.CUSTOM}>Custom</option>
            </select>
          </div>

          {recurrencePattern === RecurrencePattern.CUSTOM && (
            <div className="form-group">
              <label>Every N days</label>
              <input
                type="number"
                min="1"
                value={recurrenceInterval}
                onChange={(e) => setRecurrenceInterval(e.target.value)}
                placeholder="e.g. 3"
              />
            </div>
          )}
        </div>

        {availableDeps.length > 0 && (
          <div className="form-group">
            <label>Depends On</label>
            <select
              multiple
              value={dependsOn}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                setDependsOn(selected);
              }}
              style={{ height: '100px' }}
            >
              {availableDeps.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.status})
                </option>
              ))}
            </select>
            <small>Hold Ctrl/Cmd to select multiple</small>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
