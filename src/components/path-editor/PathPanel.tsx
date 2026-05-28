"use client";

import { useMemo, useState } from "react";
import { InterpolationStyle } from "@/lib/geometry";
import { buildAllApiPreview, formatStyle } from "@/lib/editor/path-editor-api";
import { INTERPOLATION_OPTIONS } from "@/lib/editor/path-editor-constants";
import type { BuiltPath, EditorPath, PathAction } from "@/lib/editor/path-editor-types";
import { ActionButton, IconButton, NumberInput } from "@/components/path-editor/EditorControls";

// Right sidebar for path-level configuration and export preview.
export function PathPanel({
  paths,
  builtPaths,
  activePathId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAddPath,
  onDeletePath,
  onMovePath,
  onActivatePath,
  onPatchPath,
  onAddAction,
  onPatchAction,
  onRemoveAction,
}: {
  paths: EditorPath[];
  builtPaths: BuiltPath[];
  activePathId: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAddPath: () => void;
  onDeletePath: (pathId: string) => void;
  onMovePath: (pathId: string, direction: -1 | 1) => void;
  onActivatePath: (pathId: string) => void;
  onPatchPath: (pathId: string, patch: Partial<EditorPath>) => void;
  onAddAction: (pathId: string, type: PathAction["type"]) => void;
  onPatchAction: (pathId: string, actionId: string, patch: Partial<PathAction>) => void;
  onRemoveAction: (pathId: string, actionId: string) => void;
}) {
  const apiPreview = useMemo(() => buildAllApiPreview(paths, builtPaths), [paths, builtPaths]);
  const [copied, setCopied] = useState(false);

  async function copyApiPreview() {
    await navigator.clipboard.writeText(apiPreview);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--editor-border)] p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Paths</h2>
          <p className="text-xs text-slate-500">Undo, build, and export path chains</p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
            <path d="M9 7H4v5" />
            <path d="M4 12c2-5 11-6 15 0 1.4 2.2 1.3 4.6-.2 6.6" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}>
            <path d="M15 7h5v5" />
            <path d="M20 12c-2-5-11-6-15 0-1.4 2.2-1.3 4.6.2 6.6" />
          </IconButton>
          <button
            type="button"
            className="rounded border border-[var(--editor-border-strong)] bg-[var(--editor-button-background)] px-3 py-1.5 text-xs text-slate-200"
            onClick={onAddPath}
          >
            Add path
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
        <div className="min-h-[240px] overflow-y-auto pr-1">
          <div className="flex flex-col gap-3">
            {paths.map((path, index) => {
              const built = builtPaths.find((item) => item.path.id === path.id);
              return (
                <PathCard
                  key={path.id}
                  path={path}
                  built={built}
                  active={path.id === activePathId}
                  canDelete={paths.length > 1}
                  canMoveUp={index > 0}
                  canMoveDown={index < paths.length - 1}
                  onActivate={() => onActivatePath(path.id)}
                  onPatch={(patch) => onPatchPath(path.id, patch)}
                  onDelete={() => onDeletePath(path.id)}
                  onMoveUp={() => onMovePath(path.id, -1)}
                  onMoveDown={() => onMovePath(path.id, 1)}
                  onAddAction={(type) => onAddAction(path.id, type)}
                  onPatchAction={(actionId, patch) => onPatchAction(path.id, actionId, patch)}
                  onRemoveAction={(actionId) => onRemoveAction(path.id, actionId)}
                />
              );
            })}
          </div>
        </div>

        <section className="flex min-h-[260px] flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase text-slate-500">Generated API</h3>
            <IconButton label={copied ? "Copied" : "Copy API"} onClick={copyApiPreview}>
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </IconButton>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto rounded border border-[var(--editor-border)] bg-[var(--editor-code-background)] p-3 text-xs leading-5 text-slate-300">
            <code>{apiPreview}</code>
          </pre>
        </section>
      </div>
    </div>
  );
}

function PathCard({
  path,
  built,
  active,
  canDelete,
  canMoveUp,
  canMoveDown,
  onActivate,
  onPatch,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddAction,
  onPatchAction,
  onRemoveAction,
}: {
  path: EditorPath;
  built?: BuiltPath;
  active: boolean;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onActivate: () => void;
  onPatch: (patch: Partial<EditorPath>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddAction: (type: PathAction["type"]) => void;
  onPatchAction: (actionId: string, patch: Partial<PathAction>) => void;
  onRemoveAction: (actionId: string) => void;
}) {
  return (
    <section
      className="rounded border bg-[var(--editor-panel-inset)]"
      style={{ borderColor: active ? "var(--editor-selected)" : "var(--editor-border)" }}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
        onClick={onActivate}
      >
        <input
          className="min-w-0 flex-1 rounded border border-[var(--editor-border-strong)] bg-[var(--editor-input-background)] px-2 py-1.5 text-sm font-semibold text-slate-100 outline-none"
          value={path.name}
          onChange={(event) => onPatch({ name: event.target.value })}
          onClick={(event) => event.stopPropagation()}
        />
        <IconButton label="Move up" disabled={!canMoveUp} onClick={onMoveUp}>
          <path d="m18 15-6-6-6 6" />
        </IconButton>
        <IconButton label="Move down" disabled={!canMoveDown} onClick={onMoveDown}>
          <path d="m6 9 6 6 6-6" />
        </IconButton>
        <button
          type="button"
          className="text-xs text-slate-400"
          onClick={(event) => {
            event.stopPropagation();
            onPatch({ collapsed: !path.collapsed });
          }}
        >
          {path.collapsed ? "Expand" : "Collapse"}
        </button>
        <button
          type="button"
          className="text-xs text-red-300 disabled:opacity-30"
          disabled={!canDelete}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </button>
      </button>

      {!path.collapsed ? (
        <div className="flex flex-col gap-4 border-t border-[var(--editor-border)] p-3">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Interpolator
            <select
              className="rounded border border-[var(--editor-border-strong)] bg-[var(--editor-panel)] px-2 py-2 text-sm text-slate-100 outline-none"
              value={path.interpolation}
              onChange={(event) =>
                onPatch({ interpolation: event.target.value as InterpolationStyle })
              }
            >
              {INTERPOLATION_OPTIONS.map((style) => (
                <option key={style} value={style}>
                  {formatStyle(style)}
                </option>
              ))}
            </select>
          </label>

          {path.interpolation === InterpolationStyle.TANGENT_CUSTOM ? (
            <NumberInput
              label="Tangent offset deg"
              value={path.tangentOffsetDeg}
              onChange={(tangentOffsetDeg) => onPatch({ tangentOffsetDeg })}
            />
          ) : null}

          {path.interpolation === InterpolationStyle.CUSTOM_DIST_FUNCTION ? (
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Distance function preview
              <textarea
                className="min-h-20 rounded border border-[var(--editor-border-strong)] bg-[var(--editor-panel)] px-2 py-2 text-xs leading-5 text-slate-100 outline-none"
                value={path.customFunctionSource}
                onChange={(event) => onPatch({ customFunctionSource: event.target.value })}
              />
            </label>
          ) : null}

          <ActionList
            path={path}
            lengthIn={built?.segment?.getLengthIn() ?? 0}
            onAddAction={onAddAction}
            onPatchAction={onPatchAction}
            onRemoveAction={onRemoveAction}
          />
        </div>
      ) : null}
    </section>
  );
}

function ActionList({
  path,
  lengthIn,
  onAddAction,
  onPatchAction,
  onRemoveAction,
}: {
  path: EditorPath;
  lengthIn: number;
  onAddAction: (type: PathAction["type"]) => void;
  onPatchAction: (actionId: string, patch: Partial<PathAction>) => void;
  onRemoveAction: (actionId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-slate-500">Actions</h3>
        <div className="flex gap-1">
          <ActionButton label="Callback" onClick={() => onAddAction("callback")} />
          <ActionButton label="Turn" onClick={() => onAddAction("turn")} />
          <ActionButton label="Hold" onClick={() => onAddAction("hold")} />
        </div>
      </div>
      {path.actions.map((action) => (
        <ActionEditor
          key={action.id}
          action={action}
          lengthIn={lengthIn}
          onChange={(patch) => onPatchAction(action.id, patch)}
          onRemove={() => onRemoveAction(action.id)}
        />
      ))}
    </div>
  );
}

function ActionEditor({
  action,
  lengthIn,
  onChange,
  onRemove,
}: {
  action: PathAction;
  lengthIn: number;
  onChange: (patch: Partial<PathAction>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded border border-[var(--editor-border)] bg-[var(--editor-panel)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-slate-500">{action.type}</span>
        <button type="button" className="text-xs text-slate-400" onClick={onRemove}>
          Remove
        </button>
      </div>
      {action.type === "callback" ? (
        <div className="grid grid-cols-[1fr_82px] gap-2">
          <input
            className="rounded border border-[var(--editor-border-strong)] bg-[var(--editor-input-background)] px-2 py-1.5 text-sm text-slate-100 outline-none"
            value={action.label}
            onChange={(event) => onChange({ label: event.target.value })}
          />
          <NumberInput
            label="Distance"
            value={action.distanceIn}
            min={0}
            max={Math.max(0, lengthIn)}
            step={1}
            onChange={(distanceIn) =>
              onChange({ distanceIn: Math.max(0, Math.min(lengthIn, distanceIn)) })
            }
          />
        </div>
      ) : action.type === "turn" ? (
        <NumberInput
          label="Target heading"
          value={action.headingDeg}
          onChange={(headingDeg) => onChange({ headingDeg })}
        />
      ) : (
        <NumberInput
          label="Duration"
          value={action.durationSeconds}
          onChange={(durationSeconds) => onChange({ durationSeconds })}
        />
      )}
    </div>
  );
}
