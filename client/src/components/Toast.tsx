import { CloseIcon } from "./Icons";

export function Toast({ message, onDismiss }: { message: string; onDismiss(): void }) {
  return (
    <div className="toast" role="alert">
      <span>{message}</span>
      <button type="button" className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
