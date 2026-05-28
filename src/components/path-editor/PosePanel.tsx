"use client";

import { MIN_ARC_RADIUS_IN } from "@/lib/editor/path-editor-constants";
import { isEndpoint } from "@/lib/editor/path-editor-geometry";
import type { EditorPath, EditorPose } from "@/lib/editor/path-editor-types";
import { NumberInput } from "@/components/path-editor/EditorControls";

// Left sidebar for reusable pose metadata and direct coordinate editing.
export function PosePanel({
  paths,
  activePathId,
  selectedPoseId,
  showPoseLabels,
  onToggleLabels,
  onSelectPose,
  onRename,
  onPatchPose,
  onArcShortcutHint,
}: {
  paths: EditorPath[];
  activePathId: string;
  selectedPoseId: string;
  showPoseLabels: boolean;
  onToggleLabels: () => void;
  onSelectPose: (pathId: string, poseId: string) => void;
  onRename: (pathId: string, poseId: string, name: string) => void;
  onPatchPose: (pathId: string, poseId: string, patch: Partial<EditorPose>) => void;
  onArcShortcutHint: () => void;
}) {
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
          {paths.map((path) => (
            <section key={path.id} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-slate-500">{path.name}</h3>
              {path.poses.map((pose, index) => {
                const selected = path.id === activePathId && pose.id === selectedPoseId;
                const canBeArc = !isEndpoint(index, path.poses.length);

                return (
                  <button
                    key={pose.id}
                    type="button"
                    className="rounded border p-2 text-left"
                    style={{
                      backgroundColor: selected
                        ? "var(--editor-panel-raised)"
                        : "var(--editor-panel-inset)",
                      borderColor: selected ? "var(--editor-selected)" : "var(--editor-border)",
                    }}
                    onClick={() => onSelectPose(path.id, pose.id)}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <input
                        className="min-w-0 flex-1 rounded border border-[var(--editor-border-strong)] bg-[var(--editor-input-background)] px-2 py-1.5 text-sm font-medium text-slate-100 outline-none"
                        value={pose.name}
                        onChange={(event) => onRename(path.id, pose.id, event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <span>
                        {pose.x.toFixed(1)}, {pose.y.toFixed(1)}
                      </span>
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
                    <details
                      className="mt-2"
                      open={selected}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <summary className="cursor-pointer text-xs text-slate-500">Parameters</summary>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <NumberInput
                          label="X"
                          value={pose.x}
                          onChange={(x) => onPatchPose(path.id, pose.id, { x })}
                        />
                        <NumberInput
                          label="Y"
                          value={pose.y}
                          onChange={(y) => onPatchPose(path.id, pose.id, { y })}
                        />
                        {isEndpoint(index, path.poses.length) ? (
                          <NumberInput
                            label="Heading"
                            value={pose.headingDeg ?? 0}
                            onChange={(headingDeg) =>
                              onPatchPose(path.id, pose.id, { headingDeg })
                            }
                          />
                        ) : null}
                        <NumberInput
                          label="Radius"
                          value={pose.radius}
                          disabled={pose.kind !== "arc"}
                          onChange={(radius) =>
                            onPatchPose(path.id, pose.id, {
                              radius: Math.max(MIN_ARC_RADIUS_IN, radius),
                            })
                          }
                        />
                      </div>
                    </details>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
