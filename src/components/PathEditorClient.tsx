"use client";

import { PathEditorCanvas } from "@/components/path-editor/PathEditorCanvas";
import { PathPanel } from "@/components/path-editor/PathPanel";
import { PosePanel } from "@/components/path-editor/PosePanel";
import { usePathEditorState } from "@/components/path-editor/usePathEditorState";

export default function PathEditorClient() {
  const editor = usePathEditorState();

  return (
    <>
      <aside className="w-64 shrink-0 overflow-hidden border-r border-[#242832] bg-[#13151a]">
        <PosePanel
          paths={editor.state.paths}
          activePathId={editor.state.activePathId}
          selectedPoseId={editor.state.selectedPoseId}
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
        />
      </aside>

      <section className="flex min-h-0 flex-1 items-center justify-start overflow-hidden bg-[#0d0f12] py-2 pl-2 pr-3">
        <div className="field-frame">
          <div
            aria-label="Robot field"
            className="field-surface h-full w-full overflow-hidden border border-[#303541] bg-[#181a20] shadow-2xl"
          >
            <div ref={editor.containerRef} className="field-overlay">
              <PathEditorCanvas
                builtPaths={editor.builtPaths}
                activePathId={editor.state.activePathId}
                selectedPoseId={editor.state.selectedPoseId}
                showPoseLabels={editor.state.showPoseLabels}
                canvasSize={editor.canvasSize}
                scale={editor.scale}
                onFieldDoubleClick={editor.handleFieldDoubleClick}
                onSelectPath={editor.selectPath}
                onSelectPose={editor.selectPose}
                onBeginDrag={editor.beginDrag}
                onPoseDrag={editor.handlePoseDrag}
                onPoseDragEnd={editor.handlePoseDragEnd}
                onPoseDelete={editor.deletePose}
                onGhostDrag={editor.handleGhostDrag}
                onGhostDragEnd={editor.handleGhostDragEnd}
                onCallbackDrag={editor.handleCallbackDrag}
                onCallbackDragEnd={editor.handleCallbackDragEnd}
              />
            </div>
          </div>
        </div>
      </section>

      <aside className="w-[765px] shrink-0 overflow-hidden border-l border-[#242832] bg-[#13151a]">
        <PathPanel
          paths={editor.state.paths}
          builtPaths={editor.builtPaths}
          activePathId={editor.state.activePathId}
          canUndo={editor.history.past.length > 0}
          canRedo={editor.history.future.length > 0}
          editingPathId={editor.editingPathId}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onAddPath={editor.addPath}
          onDeletePath={editor.deletePath}
          onMovePath={editor.movePath}
          onActivatePath={editor.selectPath}
          onPatchPath={editor.patchPath}
          onStartRename={editor.setEditingPathId}
          onStopRename={() => editor.setEditingPathId(null)}
          onAddAction={editor.addAction}
          onPatchAction={editor.patchAction}
          onRemoveAction={editor.removeAction}
        />
      </aside>
    </>
  );
}
