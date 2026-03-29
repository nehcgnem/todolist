import { useState, useEffect, type FormEvent } from 'react';
import { todoApi, authApi } from '../api/todoApi';
import { ShareRole } from '../types/todo';
import type { Todo, TodoShare, User } from '../types/todo';

interface ShareDialogProps {
  todo: Todo;
  onClose: () => void;
  onChanged: () => void;
}

export function ShareDialog({ todo, onClose, onChanged }: ShareDialogProps) {
  const [shares, setShares] = useState<TodoShare[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>(ShareRole.VIEWER);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadShares();
  }, [todo.id]);

  const loadShares = async () => {
    try {
      const data = await todoApi.getShares(todo.id);
      setShares(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSearch = async (query: string) => {
    setEmail(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const users = await authApi.searchUsers(query);
      setSearchResults(users);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleShare = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await todoApi.shareTodo(todo.id, { sharedWithEmail: email, role });
      setEmail('');
      setSearchResults([]);
      await loadShares();
      onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    if (!confirm('Remove this share?')) return;
    try {
      await todoApi.removeShare(todo.id, shareId);
      await loadShares();
      onChanged();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateRole = async (shareId: string, newRole: string) => {
    try {
      await todoApi.updateShare(todo.id, shareId, { role: newRole });
      await loadShares();
      onChanged();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const isOwner = todo.shareRole === 'owner';

  return (
    <div className="todo-form-overlay">
      <div className="todo-form share-dialog">
        <h2>Share "{todo.name}"</h2>

        {error && <div className="error-banner">{error}</div>}

        {isOwner && (
          <form onSubmit={handleShare} className="share-form">
            <div className="share-input-row">
              <div className="form-group" style={{ flex: 2, position: 'relative' }}>
                <label>User email or username</label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search by email or username..."
                  required
                />
                {searchResults.length > 0 && (
                  <div className="search-dropdown">
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className="search-dropdown-item"
                        onClick={() => {
                          setEmail(user.email);
                          setSearchResults([]);
                        }}
                      >
                        <strong>{user.username}</strong>
                        <span className="search-dropdown-email">{user.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searching && <div className="search-loading">Searching...</div>}
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value={ShareRole.VIEWER}>Viewer</option>
                  <option value={ShareRole.EDITOR}>Editor</option>
                </select>
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-share-add"
                disabled={loading || !email}
              >
                Share
              </button>
            </div>
          </form>
        )}

        <div className="share-list">
          <h3>Shared with</h3>
          {shares.length === 0 ? (
            <p className="share-empty">Not shared with anyone yet.</p>
          ) : (
            shares.map((share) => (
              <div key={share.id} className="share-item">
                <div className="share-item-info">
                  <strong>{share.sharedWithUsername}</strong>
                  <span className="share-item-email">{share.sharedWithEmail}</span>
                </div>
                <div className="share-item-actions">
                  {isOwner ? (
                    <>
                      <select
                        value={share.role}
                        onChange={(e) => handleUpdateRole(share.id, e.target.value)}
                        className="share-role-select"
                      >
                        <option value={ShareRole.VIEWER}>Viewer</option>
                        <option value={ShareRole.EDITOR}>Editor</option>
                      </select>
                      <button
                        className="btn btn-small btn-delete"
                        onClick={() => handleRemoveShare(share.id)}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="share-role-badge">{share.role}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
