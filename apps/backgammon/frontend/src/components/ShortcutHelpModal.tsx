interface ShortcutHelpModalProps {
  onClose: () => void;
}

function ShortcutHelpModal({ onClose }: ShortcutHelpModalProps) {
  return (
    <div
      className="shortcut-help-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div className="shortcut-help-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Keyboard Shortcuts</h3>
        <table className="shortcut-table">
          <tbody>
            <tr>
              <td><kbd>R</kbd></td>
              <td>Roll dice</td>
            </tr>
            <tr>
              <td><kbd>E</kbd> / <kbd>Enter</kbd></td>
              <td>End / Confirm turn</td>
            </tr>
            <tr>
              <td><kbd>U</kbd> / <kbd>Ctrl+Z</kbd></td>
              <td>Undo move</td>
            </tr>
            <tr>
              <td><kbd>D</kbd></td>
              <td>Offer double</td>
            </tr>
            <tr>
              <td><kbd>Esc</kbd></td>
              <td>Deselect checker</td>
            </tr>
            <tr>
              <td><kbd>M</kbd></td>
              <td>Toggle move history</td>
            </tr>
            <tr>
              <td><kbd>?</kbd></td>
              <td>Show this help</td>
            </tr>
          </tbody>
        </table>
        <button className="shortcut-help-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export default ShortcutHelpModal;
