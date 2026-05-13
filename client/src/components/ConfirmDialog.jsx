import './ConfirmDialog.css';

function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isBusy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="confirm-dialog" role="dialog" aria-modal="true">
      <div className="confirm-dialog__panel">
        <h2 className="confirm-dialog__title">{title}</h2>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__button" onClick={onCancel} disabled={isBusy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--danger"
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
