"use client";

import { PathEditorCanvas } from "@/components/path-editor/PathEditorCanvas";
import { PathPanel } from "@/components/path-editor/PathPanel";
import { PosePanel } from "@/components/path-editor/PosePanel";
import { useResizablePathPanel } from "@/components/path-editor/useResizablePathPanel";
import { usePathEditorState } from "@/components/path-editor/usePathEditorState";
import { editorColorVars } from "@/lib/editor/colors";

export default function PathEditorClient() {
  const editor = usePathEditorState();
  const pathPanel = useResizablePathPanel();

  return (
    <div
      ref={pathPanel.workspaceRef}
      className="flex min-h-0 flex-1 overflow-hidden"
      style={editorColorVars}
    >
      <aside className="w-64 shrink-0 overflow-hidden border-r border-[var(--editor-border)] bg-[var(--editor-panel)]">
        <PosePanel
          paths={editor.state.paths}
          activePathId={editor.state.activePathId}
          selectedPoseId={editor.selectedPoseId}
          showPoseLabels={editor.state.showPoseLabels}
          onToggleLabels={() =>
            editor.commit((current) => ({
              ...current,
              showPoseLabels: !current.showPoseLabels,
            }))
          }
          onSelectPose={editor.selectPose}
          onRename={(pathId, poseId, name) => editor.patchPose(pathId, poseId, { name })}
          onPatchPose={(pathId, poseId, patch) => editor.patchPose(pathId, poseId, patch)}
          onArcShortcutHint={editor.showArcShortcutHint}
        />
      </aside>

      <section className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--editor-app-background)] py-2 pl-2 pr-3">
        <div className="field-frame min-h-0 max-h-full max-w-full">
          <div
            aria-label="Robot field"
            className="field-surface h-full w-full overflow-hidden border border-[var(--editor-border-strong)] bg-[var(--editor-field-background)] shadow-2xl"
          >
            <div ref={editor.containerRef} className="field-overlay">
              {editor.arcShortcutHintVisible ? (
                <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded border border-[var(--editor-border-strong)] bg-[var(--editor-panel)] px-3 py-1.5 text-xs text-slate-200 shadow-lg">
                  Press A to make the selected pose an arc pose.
                </div>
              ) : null}
              <PathEditorCanvas
                builtPaths={editor.builtPaths}
                activePathId={editor.state.activePathId}
                selectedPoseId={editor.selectedPoseId}
                selectedPathId={
                  editor.state.selection?.type === "path" ? editor.state.selection.pathId : ""
                }
                selectedActionId={editor.selectedActionId}
                pendingHeadingPoseId={editor.pendingHeadingPoseId}
                showPoseLabels={editor.state.showPoseLabels}
                canvasSize={editor.canvasSize}
                scale={editor.scale}
                onFieldClick={editor.handleFieldClick}
                onFieldDoubleClick={editor.handleFieldDoubleClick}
                onSelectPose={editor.selectPose}
                onSelectAction={editor.selectAction}
                onBeginDrag={editor.beginDrag}
                onBeginPathDrag={editor.beginPathDrag}
                onPathDrag={editor.handlePathDrag}
                onPathDragEnd={editor.handlePathDragEnd}
                onPoseDrag={editor.handlePoseDrag}
                onPoseDragEnd={editor.handlePoseDragEnd}
                onGhostDrag={editor.handleGhostDrag}
                onGhostDragEnd={editor.handleGhostDragEnd}
                onCallbackDrag={editor.handleCallbackDrag}
                onCallbackDragEnd={editor.handleCallbackDragEnd}
                onCallbackDelete={editor.removeAction}
                onHeadingDrag={editor.handleHeadingDrag}
                onHeadingDragEnd={editor.handleHeadingDragEnd}
              />
            </div>
          </div>
        </div>
      </section>

      <div
        aria-label="Resize paths panel"
        role="separator"
        aria-orientation="vertical"
        className="group grid w-2 shrink-0 cursor-col-resize place-items-center border-l border-r border-[var(--editor-border)] bg-[var(--editor-panel-inset)]"
        {...pathPanel.pathPanelResizeProps}
      >
        <div
          className="h-12 w-px bg-[var(--editor-border-strong)] group-hover:bg-slate-500"
          style={{ opacity: pathPanel.isDraggingPathPanel ? 1 : undefined }}
        />
      </div>

      <aside
        className="shrink-0 overflow-hidden bg-[var(--editor-panel)]"
        style={{ width: pathPanel.pathPanelWidth }}
      >
        <PathPanel
          paths={editor.state.paths}
          builtPaths={editor.builtPaths}
          activePathId={editor.state.activePathId}
          canUndo={editor.history.past.length > 0}
          canRedo={editor.history.future.length > 0}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onAddPath={editor.addPath}
          onDeletePath={editor.deletePath}
          onMovePath={editor.movePath}
          onActivatePath={editor.selectPath}
          onPatchPath={editor.patchPath}
          onAddAction={editor.addAction}
          onPatchAction={editor.patchAction}
          onRemoveAction={editor.removeAction}
        />
      </aside>
    </div>
  );
}
