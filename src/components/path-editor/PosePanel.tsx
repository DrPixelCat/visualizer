"use client";

import { MIN_ARC_RADIUS_IN } from "@/lib/editor/path-editor-constants";
import { isEndpoint } from "@/lib/editor/path-editor-geometry";
import type { EditorPath, EditorPose, EditorTurn } from "@/lib/editor/path-editor-types";
import { NumberInput } from "@/components/path-editor/EditorControls";

// Left sidebar for reusable pose metadata and direct coordinate editing.
export function PosePanel({
  paths,
  turns,
  favoritePoseIds,
  activePathId,
  selectedPoseId,
  selectedTurnId,
  showPoseLabels,
  onToggleLabels,
  onSelectPose,
  onSelectTurn,
  onToggleFavoritePose,
  onUseFavoritePose,
  onRename,
  onPatchPose,
  onPatchTurn,
  onArcShortcutHint,
}: {
  paths: EditorPath[];
  turns: EditorTurn[];
  favoritePoseIds: string[];
  activePathId: string;
  selectedPoseId: string;
  selectedTurnId: string;
  showPoseLabels: boolean;
  onToggleLabels: () => void;
  onSelectPose: (pathId: string, poseId: string) => void;
  onSelectTurn: (turnId: string) => void;
  onToggleFavoritePose: (poseId: string) => void;
  onUseFavoritePose: (poseId: string) => void;
  onRename: (pathId: string, poseId: string, name: string) => void;
  onPatchPose: (pathId: string, poseId: string, patch: Partial<EditorPose>) => void;
  onPatchTurn: (turnId: string, patch: Partial<EditorTurn>) => void;
  onArcShortcutHint: () => void;
}) {
  const favoriteRows = favoritePoseIds
    .map((poseId) => {
      const path = paths.find((item) => item.poses.some((pose) => pose.id === poseId));
      const index = path?.poses.findIndex((pose) => pose.id === poseId) ?? -1;
      const pose = index >= 0 ? path?.poses[index] : undefined;
      return path && pose ? { path, pose, index } : null;
    })
    .filter((row): row is { path: EditorPath; pose: EditorPose; index: number } => Boolean(row));

  function renderPoseCard(path: EditorPath, pose: EditorPose, index: number, favorite: boolean) {
    const selected = path.id === activePathId && pose.id === selectedPoseId;
    const related = path.id === activePathId;
    const canBeArc = !isEndpoint(index, path.poses.length);

    return (
      <div
        key={pose.id}
        role="button"
        tabIndex={0}
        className="rounded border p-2 text-left"
        style={{
          backgroundColor: selected
            ? "var(--editor-panel-raised)"
            : "var(--editor-panel-inset)",
          borderColor: selected
            ? "var(--editor-selected)"
            : related
              ? "var(--editor-canvas-path)"
              : "var(--editor-border)",
        }}
        onClick={() => onSelectPose(path.id, pose.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onSelectPose(path.id, pose.id);
        }}
      >
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <button
            type="button"
            aria-label={favorite ? "Unfavorite pose" : "Favorite pose"}
            title={favorite ? "Unfavorite pose" : "Favorite pose"}
            className="grid h-7 w-7 shrink-0 place-items-center rounded border border-[var(--editor-border-strong)] bg-[var(--editor-button-background)] text-slate-300"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavoritePose(pose.id);
            }}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
            </svg>
          </button>
          <input
            className="min-w-0 flex-1 rounded border border-[var(--editor-border-strong)] bg-[var(--editor-input-background)] px-2 py-1.5 text-sm font-medium text-slate-100 outline-none"
            value={pose.name}
            onChange={(event) => onRename(path.id, pose.id, event.target.value)}
            onClick={(event) => event.stopPropagation()}
          />
          {favorite ? (
            <button
              type="button"
              className="rounded border border-[var(--editor-border-strong)] bg-[var(--editor-button-background)] px-2 py-1.5 text-xs text-slate-200"
              onClick={(event) => {
                event.stopPropagation();
                onUseFavoritePose(pose.id);
              }}
            >
              Use
            </button>
          ) : null}
        </div>
        <div className="mt-2 text-xs text-slate-500">
          {path.name} | {pose.x.toFixed(1)}, {pose.y.toFixed(1)}
        </div>
        {canBeArc ? (
          <label
            className="mt-2 flex items-center gap-2 text-xs text-slate-300"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={pose.kind === "arc"}
              onChange={(event) => {
                if (selected) onArcShortcutHint();
                onPatchPose(path.id, pose.id, {
                  kind: event.target.checked ? "arc" : "pose",
                });
              }}
            />
            Arc pose
          </label>
        ) : null}
        <details className="mt-2" open={selected} onClick={(event) => event.stopPropagation()}>
          <summary className="cursor-pointer text-xs text-slate-500">Parameters</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <NumberInput label="X" value={pose.x} onChange={(x) => onPatchPose(path.id, pose.id, { x })} />
            <NumberInput label="Y" value={pose.y} onChange={(y) => onPatchPose(path.id, pose.id, { y })} />
            {isEndpoint(index, path.poses.length) ? (
              <NumberInput label="Heading" value={pose.headingDeg ?? 0} onChange={(headingDeg) => onPatchPose(path.id, pose.id, { headingDeg })} />
            ) : null}
            <NumberInput
              label="Radius"
              value={pose.radius}
              disabled={pose.kind !== "arc"}
              onChange={(radius) =>
                onPatchPose(path.id, pose.id, { radius: Math.max(MIN_ARC_RADIUS_IN, radius) })
              }
            />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--editor-border)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Poses</h2>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={showPoseLabels} onChange={onToggleLabels} />
            Labels
          </label>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {favoriteRows.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-slate-500">Favorites</h3>
              {favoriteRows.map(({ path, pose, index }) => renderPoseCard(path, pose, index, true))}
            </section>
          ) : null}
          {paths.map((path) => (
            <section key={path.id} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-slate-500">{path.name}</h3>
              {path.poses
                .map((pose, index) => ({ pose, index }))
                .filter(({ pose }) => !favoritePoseIds.includes(pose.id))
                .map(({ pose, index }) => renderPoseCard(path, pose, index, false))}
            </section>
          ))}
          {turns.some((turn) => !turn.sourcePathId) ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-slate-500">Turn poses</h3>
              {turns
                .filter((turn) => !turn.sourcePathId)
                .map((turn) => (
                  <div
                    key={turn.id}
                    role="button"
                    tabIndex={0}
                    className="rounded border p-2 text-left"
                    style={{
                      backgroundColor:
                        turn.id === selectedTurnId
                          ? "var(--editor-panel-raised)"
                          : "var(--editor-panel-inset)",
                      borderColor:
                        turn.id === selectedTurnId ? "var(--editor-selected)" : "var(--editor-border)",
                    }}
                    onClick={() => onSelectTurn(turn.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") onSelectTurn(turn.id);
                    }}
                  >
                    <input
                      className="w-full rounded border border-[var(--editor-border-strong)] bg-[var(--editor-input-background)] px-2 py-1.5 text-sm font-medium text-slate-100 outline-none"
                      value={turn.name}
                      onChange={(event) => onPatchTurn(turn.id, { name: event.target.value })}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <NumberInput label="X" value={turn.x} onChange={(x) => onPatchTurn(turn.id, { x })} />
                      <NumberInput label="Y" value={turn.y} onChange={(y) => onPatchTurn(turn.id, { y })} />
                      <NumberInput
                        label="Heading"
                        value={turn.startHeadingDeg}
                        onChange={(startHeadingDeg) => onPatchTurn(turn.id, { startHeadingDeg })}
                      />
                    </div>
                  </div>
                ))}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
