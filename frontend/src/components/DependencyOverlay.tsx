import { TodoStatus } from '../types/todo';
import type { Todo } from '../types/todo';

interface DependencyOverlayProps {
  todos: Todo[];
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

export function DependencyOverlay({ todos }: DependencyOverlayProps) {
  // Build dependency relationships with full context
  const dependencies: {
    from: Todo;
    to: Todo;
    isBlocking: boolean;
  }[] = [];

  for (const todo of todos) {
    for (const depId of todo.dependsOn) {
      const dep = todos.find((t) => t.id === depId);
      if (dep) {
        dependencies.push({
          from: todo,
          to: dep,
          isBlocking: dep.status !== TodoStatus.COMPLETED && !dep.isDeleted,
        });
      }
    }
  }

  if (dependencies.length === 0) return null;

  // Group by blocking vs satisfied
  const blocking = dependencies.filter((d) => d.isBlocking);
  const satisfied = dependencies.filter((d) => !d.isBlocking);

  return (
    <div className="dependency-list">
      <h4 className="dependency-list-title">
        Dependency Graph
        <span className="dep-list-summary">
          {blocking.length > 0 && (
            <span className="dep-summary-blocking">{blocking.length} blocking</span>
          )}
          {satisfied.length > 0 && (
            <span className="dep-summary-satisfied">{satisfied.length} satisfied</span>
          )}
        </span>
      </h4>

      {blocking.length > 0 && (
        <div className="dep-list-section">
          <div className="dep-list-section-header dep-section-blocking">Blocking</div>
          <div className="dependency-list-items">
            {blocking.map((dep, i) => (
              <div key={`${dep.from.id}-${dep.to.id}-${i}`} className="dependency-list-item dep-item-blocking">
                <span className="dep-from" title={dep.from.name}>
                  {dep.from.name.length > 30 ? dep.from.name.slice(0, 30) + '...' : dep.from.name}
                </span>
                <span className="dep-arrow-visual">
                  <span className="dep-arrow-line" />
                  <span className="dep-arrow-label">blocked by</span>
                  <span className="dep-arrow-line" />
                  <span className="dep-arrow-head">{'\u25b6'}</span>
                </span>
                <span className="dep-to" title={dep.to.name}>
                  <span className={`dep-status-dot dep-status-${dep.to.status}`}>
                    {STATUS_ICONS[dep.to.status]}
                  </span>
                  {dep.to.name.length > 30 ? dep.to.name.slice(0, 30) + '...' : dep.to.name}
                  <span className="dep-to-status">{STATUS_LABELS[dep.to.status]}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {satisfied.length > 0 && (
        <div className="dep-list-section">
          <div className="dep-list-section-header dep-section-satisfied">Satisfied</div>
          <div className="dependency-list-items">
            {satisfied.map((dep, i) => (
              <div key={`${dep.from.id}-${dep.to.id}-${i}`} className="dependency-list-item dep-item-satisfied">
                <span className="dep-from" title={dep.from.name}>
                  {dep.from.name.length > 30 ? dep.from.name.slice(0, 30) + '...' : dep.from.name}
                </span>
                <span className="dep-arrow-visual">
                  <span className="dep-arrow-line dep-arrow-line-satisfied" />
                  <span className="dep-arrow-label">depends on</span>
                  <span className="dep-arrow-line dep-arrow-line-satisfied" />
                  <span className="dep-arrow-head dep-arrow-head-satisfied">{'\u25b6'}</span>
                </span>
                <span className="dep-to dep-to-satisfied" title={dep.to.name}>
                  <span className={`dep-status-dot dep-status-${dep.to.status}`}>
                    {STATUS_ICONS[dep.to.status]}
                  </span>
                  {dep.to.name.length > 30 ? dep.to.name.slice(0, 30) + '...' : dep.to.name}
                  <span className="dep-to-status">{STATUS_LABELS[dep.to.status]}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
