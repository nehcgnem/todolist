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

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_ICONS: Record<string, string> = {
  not_started: '\u25cb',
  in_progress: '\u25d4',
  completed: '\u2714',
  archived: '\u2716',
};

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
  const [depSearchQuery, setDepSearchQuery] = useState('');

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

  // Filter by search query
  const filteredDeps = depSearchQuery
    ? availableDeps.filter((t) =>
        t.name.toLowerCase().includes(depSearchQuery.toLowerCase())
      )
    : availableDeps;

  const toggleDep = (id: string) => {
    setDependsOn((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const removeDep = (id: string) => {
    setDependsOn((prev) => prev.filter((d) => d !== id));
  };

  // Resolve selected dependencies to full objects for the "selected" display
  const selectedDeps = dependsOn
    .map((id) => allTodos.find((t) => t.id === id))
    .filter((t): t is Todo => t !== undefined);

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

        {/* Dependency Picker */}
        <div className="form-group">
          <label>Dependencies ({dependsOn.length} selected)</label>

          {/* Selected dependencies as removable chips */}
          {selectedDeps.length > 0 && (
            <div className="dep-picker-selected">
              {selectedDeps.map((dep) => (
                <span
                  key={dep.id}
                  className={`dep-picker-chip ${dep.status === TodoStatus.COMPLETED ? 'dep-picker-chip-done' : ''}`}
                >
                  <span className="dep-picker-chip-icon">{STATUS_ICONS[dep.status]}</span>
                  {dep.name.length > 35 ? dep.name.slice(0, 35) + '...' : dep.name}
                  <button
                    type="button"
                    className="dep-picker-chip-remove"
                    onClick={() => removeDep(dep.id)}
                    aria-label={`Remove ${dep.name}`}
                  >
                    {'\u00d7'}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search + checkbox list */}
          {availableDeps.length > 0 && (
            <div className="dep-picker-dropdown">
              <input
                type="text"
                className="dep-picker-search"
                placeholder="Search tasks to add as dependency..."
                value={depSearchQuery}
                onChange={(e) => setDepSearchQuery(e.target.value)}
              />
              <div className="dep-picker-list">
                {filteredDeps.length === 0 && (
                  <div className="dep-picker-empty">No matching tasks found</div>
                )}
                {filteredDeps.map((t) => {
                  const isSelected = dependsOn.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`dep-picker-option ${isSelected ? 'dep-picker-option-selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleDep(t.id)}
                      />
                      <span className={`dep-picker-status dep-picker-status-${t.status}`}>
                        {STATUS_ICONS[t.status]}
                      </span>
                      <span className="dep-picker-option-name">
                        {t.name.length > 50 ? t.name.slice(0, 50) + '...' : t.name}
                      </span>
                      <span className="dep-picker-option-badge">
                        {STATUS_LABELS[t.status]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {availableDeps.length === 0 && (
            <div className="dep-picker-empty">No other tasks available to add as dependencies</div>
          )}
        </div>

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
