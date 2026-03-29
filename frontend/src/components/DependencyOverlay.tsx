import type { Todo } from '../types/todo';

interface DependencyOverlayProps {
  todos: Todo[];
}

export function DependencyOverlay({ todos }: DependencyOverlayProps) {
  // Show a simple list of dependency relationships
  const dependencies: { from: string; to: string; fromName: string; toName: string }[] = [];

  for (const todo of todos) {
    for (const depId of todo.dependsOn) {
      const dep = todos.find((t) => t.id === depId);
      if (dep) {
        dependencies.push({
          from: todo.id,
          to: dep.id,
          fromName: todo.name,
          toName: dep.name,
        });
      }
    }
  }

  if (dependencies.length === 0) return null;

  return (
    <div className="dependency-list">
      <h4 className="dependency-list-title">Dependencies</h4>
      <div className="dependency-list-items">
        {dependencies.map((dep, i) => (
          <div key={`${dep.from}-${dep.to}-${i}`} className="dependency-list-item">
            <span className="dep-from" title={dep.fromName}>
              {dep.fromName.length > 25 ? dep.fromName.slice(0, 25) + '...' : dep.fromName}
            </span>
            <span className="dep-arrow">depends on</span>
            <span className="dep-to" title={dep.toName}>
              {dep.toName.length > 25 ? dep.toName.slice(0, 25) + '...' : dep.toName}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
