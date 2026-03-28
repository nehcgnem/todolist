import { TodoStatus, TodoPriority } from '../types/todo';
import type { TodoFilters } from '../types/todo';

interface FilterBarProps {
  filters: TodoFilters;
  onFilterChange: (filters: Partial<TodoFilters>) => void;
}

export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <input
          type="text"
          placeholder="Search..."
          value={filters.search || ''}
          onChange={(e) => onFilterChange({ search: e.target.value })}
          className="search-input"
        />
      </div>

      <div className="filter-group">
        <select
          value={filters.status || ''}
          onChange={(e) => onFilterChange({ status: e.target.value })}
        >
          <option value="">All Statuses</option>
          <option value={TodoStatus.NOT_STARTED}>Not Started</option>
          <option value={TodoStatus.IN_PROGRESS}>In Progress</option>
          <option value={TodoStatus.COMPLETED}>Completed</option>
          <option value={TodoStatus.ARCHIVED}>Archived</option>
        </select>
      </div>

      <div className="filter-group">
        <select
          value={filters.priority || ''}
          onChange={(e) => onFilterChange({ priority: e.target.value })}
        >
          <option value="">All Priorities</option>
          <option value={TodoPriority.LOW}>Low</option>
          <option value={TodoPriority.MEDIUM}>Medium</option>
          <option value={TodoPriority.HIGH}>High</option>
        </select>
      </div>

      <div className="filter-group">
        <select
          value={filters.dependencyStatus || ''}
          onChange={(e) => onFilterChange({ dependencyStatus: e.target.value })}
        >
          <option value="">All Dependencies</option>
          <option value="blocked">Blocked</option>
          <option value="unblocked">Unblocked</option>
        </select>
      </div>

      <div className="filter-group">
        <select
          value={filters.sortField || ''}
          onChange={(e) => onFilterChange({ sortField: e.target.value })}
        >
          <option value="">Default Sort</option>
          <option value="dueDate">Due Date</option>
          <option value="priority">Priority</option>
          <option value="status">Status</option>
          <option value="name">Name</option>
        </select>
      </div>

      <div className="filter-group">
        <select
          value={filters.sortDirection || 'asc'}
          onChange={(e) => onFilterChange({ sortDirection: e.target.value })}
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>
    </div>
  );
}
