import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBoard } from '../../context/BoardContext';
import { Button, Modal, Input } from '../common';
import './Home.css';

export function Home() {
  const navigate = useNavigate();
  const { boards, createBoard, renameBoard, deleteBoard, loading } = useBoard();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameModalBoard, setRenameModalBoard] = useState<{ id: string; name: string } | null>(null);
  const [deleteModalBoard, setDeleteModalBoard] = useState<{ id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredBoards = boards.filter((board) =>
    board.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateBoard = async () => {
    if (newBoardName.trim()) {
      const boardId = await createBoard(newBoardName.trim());
      setNewBoardName('');
      setShowCreateModal(false);
      if (boardId) {
        navigate(`/board/${boardId}`);
      }
    }
  };

  const handleSelectBoard = (boardId: string) => {
    navigate(`/board/${boardId}`);
  };

  const handleRename = async () => {
    if (renameModalBoard && renameName.trim()) {
      await renameBoard(renameModalBoard.id, renameName.trim());
      setRenameModalBoard(null);
      setRenameName('');
    }
  };

  const handleDelete = async () => {
    if (deleteModalBoard) {
      await deleteBoard(deleteModalBoard.id);
      setDeleteModalBoard(null);
    }
  };

  const openRenameModal = (board: { id: string; name: string }) => {
    setRenameName(board.name);
    setRenameModalBoard(board);
    setMenuOpenId(null);
  };

  const openDeleteModal = (board: { id: string; name: string }) => {
    setDeleteModalBoard(board);
    setMenuOpenId(null);
  };

  return (
    <div className="home">
      <div className="home-container">
        <div className="home-header">
          <h1 className="home-title">&gt; Boards</h1>
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            + New Board
          </Button>
        </div>

        <div className="home-search">
          <Input
            placeholder="Search boards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="home-loading">Loading boards...</div>
        ) : filteredBoards.length === 0 ? (
          <div className="home-empty">
            {searchQuery ? (
              <p>No boards matching "{searchQuery}"</p>
            ) : (
              <>
                <p>No boards yet</p>
                <Button variant="ghost" onClick={() => setShowCreateModal(true)}>
                  Create your first board
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="home-boards">
            {filteredBoards.map((board) => (
              <div
                key={board.id}
                className="board-card"
                onClick={() => handleSelectBoard(board.id)}
                ref={menuOpenId === board.id ? menuRef : null}
              >
                <span className="board-card-name">{board.name}</span>
                <div className="board-card-right">
                  <span className="board-card-meta">
                    {new Date(board.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    className="board-card-menu-trigger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === board.id ? null : board.id);
                    }}
                  >
                    ⋯
                  </button>
                </div>
                {menuOpenId === board.id && (
                  <div className="board-card-dropdown">
                    <button onClick={(e) => { e.stopPropagation(); openRenameModal(board); }}>Rename</button>
                    <button className="danger" onClick={(e) => { e.stopPropagation(); openDeleteModal(board); }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Board"
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateBoard();
          }}
        >
          <div className="modal-form">
            <Input
              label="Board Name"
              placeholder="My Project"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Create Board
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Rename Modal */}
      <Modal
        isOpen={!!renameModalBoard}
        onClose={() => setRenameModalBoard(null)}
        title="Rename Board"
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRename();
          }}
        >
          <div className="modal-form">
            <Input
              label="Board Name"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRenameModalBoard(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Rename
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteModalBoard}
        onClose={() => setDeleteModalBoard(null)}
        title="Delete Board"
        width="sm"
      >
        <div className="modal-form">
          <p className="delete-warning">
            Are you sure you want to delete "{deleteModalBoard?.name}"? This action cannot be undone.
          </p>
          <div className="modal-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteModalBoard(null)}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
