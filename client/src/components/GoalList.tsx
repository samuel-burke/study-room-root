import { LIMITS, type GoalDto } from "@studyroom/core";
import { useId, useState, type FormEvent } from "react";
import { CloseIcon, PlusIcon } from "./Icons";

interface GoalListProps {
  goals: GoalDto[];
  busy: boolean;
  onToggle(goalId: string, done: boolean): void;
  onDelete(goalId: string): void;
  onAdd(text: string): Promise<boolean>;
}

export function GoalList({ goals, busy, onToggle, onDelete, onAdd }: GoalListProps) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const inputId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    if (await onAdd(text)) {
      setText("");
      setAdding(false);
    }
  }

  return (
    <>
      {goals.length > 0 ? (
        <ul className="goal-list">
          {goals.map((goal) => (
            <li key={goal.id} className="goal" data-done={goal.done}>
              <label>
                <input
                  type="checkbox"
                  checked={goal.done}
                  disabled={busy}
                  onChange={(e) => onToggle(goal.id, e.target.checked)}
                />
                <span className="text">{goal.text}</span>
              </label>
              <button
                type="button"
                className="remove"
                aria-label={`Remove goal: ${goal.text}`}
                disabled={busy}
                onClick={() => onDelete(goal.id)}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="small dim">
          No goals yet. Add one so the room knows what you're working on.
        </div>
      )}
      {adding ? (
        <form className="add-goal" onSubmit={submit}>
          <label htmlFor={inputId} className="visually-hidden">
            New goal
          </label>
          <input
            id={inputId}
            className="input"
            value={text}
            maxLength={LIMITS.goalTextMaxLength}
            placeholder="e.g. Finish chapter 4 notes"
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
            Add
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-dashed" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add a goal
        </button>
      )}
    </>
  );
}
