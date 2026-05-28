import { useEffect, useState, type ReactNode } from "react";

// Small shared form controls keep the side panels visually consistent.
export function NumberInput({
  label,
  value,
  disabled,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(() => formatInputValue(value));

  useEffect(() => {
    if (!focused) setDisplayValue(formatInputValue(value));
  }, [focused, value]);

  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <input
        className="rounded border border-[var(--editor-border-strong)] bg-[var(--editor-input-background)] px-2 py-1.5 text-sm text-slate-100 outline-none disabled:opacity-35"
        type="number"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setDisplayValue(formatInputValue(value));
        }}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDisplayValue(nextValue);
          if (nextValue === "" || nextValue === "-" || nextValue === "." || nextValue === "-.") {
            return;
          }

          const parsed = Number(nextValue);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </label>
  );
}

function formatInputValue(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

export function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded border border-[var(--editor-border-strong)] bg-[var(--editor-button-background)] px-2 py-1 text-[11px] text-slate-200"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function IconButton({
  label,
  disabled,
  children,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded border border-[var(--editor-border-strong)] bg-[var(--editor-button-background)] text-slate-300 disabled:opacity-35"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        {children}
      </svg>
    </button>
  );
}
