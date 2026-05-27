"use client";

import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { editorColors } from "@/lib/editor/colors";
import {
  CALLBACK_RADIUS,
  GHOST_RADIUS,
  MIN_ARC_RADIUS_IN,
  POSE_RADIUS,
} from "@/lib/editor/path-editor-constants";
import {
  clampCanvasPosePosition,
  isEndpoint,
  pointAtDistance,
  toCanvas,
  toCanvasPoint,
} from "@/lib/editor/path-editor-geometry";
import type { BuiltPath, EditorPose, PathAction } from "@/lib/editor/path-editor-types";
import type { PathSegment } from "@/lib/geometry";

// Konva-only rendering stays isolated behind PathEditor's ssr:false boundary.
type CanvasDragHandler = (
  pathId: string,
  poseId: string,
  event: KonvaEventObject<DragEvent>,
) => void;

type CallbackDragHandler = (
  pathId: string,
  actionId: string,
  event: KonvaEventObject<DragEvent>,
) => void;

export function PathEditorCanvas({
  builtPaths,
  activePathId,
  selectedPoseId,
  showPoseLabels,
  canvasSize,
  scale,
  onFieldDoubleClick,
  onSelectPath,
  onSelectPose,
  onBeginDrag,
  onPoseDrag,
  onPoseDragEnd,
  onPoseDelete,
  onGhostDrag,
  onGhostDragEnd,
  onCallbackDrag,
  onCallbackDragEnd,
}: {
  builtPaths: BuiltPath[];
  activePathId: string;
  selectedPoseId: string;
  showPoseLabels: boolean;
  canvasSize: number;
  scale: number;
  onFieldDoubleClick: (event: KonvaEventObject<MouseEvent>) => void;
  onSelectPath: (pathId: string) => void;
  onSelectPose: (pathId: string, poseId: string) => void;
  onBeginDrag: (pathId?: string, poseId?: string) => void;
  onPoseDrag: CanvasDragHandler;
  onPoseDragEnd: CanvasDragHandler;
  onPoseDelete: (pathId: string, poseId: string) => void;
  onGhostDrag: CanvasDragHandler;
  onGhostDragEnd: CanvasDragHandler;
  onCallbackDrag: CallbackDragHandler;
  onCallbackDragEnd: CallbackDragHandler;
}) {
  if (canvasSize <= 0) return null;

  return (
    <Stage width={canvasSize} height={canvasSize}>
      <Layer>
        <Rect
          width={canvasSize}
          height={canvasSize}
          fill={editorColors.transparent}
          onDblClick={onFieldDoubleClick}
        />
        {builtPaths.map((built) => (
          <PathCanvasLayer
            key={built.path.id}
            built={built}
            active={built.path.id === activePathId}
            selectedPoseId={selectedPoseId}
            showPoseLabels={showPoseLabels}
            scale={scale}
            onSelectPath={() => onSelectPath(built.path.id)}
            onSelectPose={(poseId) => onSelectPose(built.path.id, poseId)}
            onBeginDrag={onBeginDrag}
            onPoseDrag={onPoseDrag}
            onPoseDragEnd={onPoseDragEnd}
            onPoseDelete={onPoseDelete}
            onGhostDrag={onGhostDrag}
            onGhostDragEnd={onGhostDragEnd}
            onCallbackDrag={onCallbackDrag}
            onCallbackDragEnd={onCallbackDragEnd}
          />
        ))}
      </Layer>
    </Stage>
  );
}

function PathCanvasLayer({
  built,
  active,
  selectedPoseId,
  showPoseLabels,
  scale,
  onSelectPath,
  onSelectPose,
  onBeginDrag,
  onPoseDrag,
  onPoseDragEnd,
  onPoseDelete,
  onGhostDrag,
  onGhostDragEnd,
  onCallbackDrag,
  onCallbackDragEnd,
}: {
  built: BuiltPath;
  active: boolean;
  selectedPoseId: string;
  showPoseLabels: boolean;
  scale: number;
  onSelectPath: () => void;
  onSelectPose: (poseId: string) => void;
  onBeginDrag: (pathId?: string, poseId?: string) => void;
  onPoseDrag: CanvasDragHandler;
  onPoseDragEnd: CanvasDragHandler;
  onPoseDelete: (pathId: string, poseId: string) => void;
  onGhostDrag: CanvasDragHandler;
  onGhostDragEnd: CanvasDragHandler;
  onCallbackDrag: CallbackDragHandler;
  onCallbackDragEnd: CallbackDragHandler;
}) {
  // Render inactive paths dimmed while keeping all geometry available for snapping.
  return (
    <Group opacity={active ? 1 : 0.35} onClick={onSelectPath}>
      <Line
        points={built.controls.flatMap(toCanvasPoint(scale))}
        stroke={editorColors.ghostFill}
        strokeWidth={1}
        dash={[5, 7]}
        opacity={0.55}
      />
      {built.spline ? (
        <Line
          points={built.curve.flatMap(toCanvasPoint(scale))}
          stroke={active ? editorColors.canvasPath : editorColors.canvasPathInactive}
          strokeWidth={active ? 3 : 2}
          lineCap="round"
          lineJoin="round"
          shadowColor={editorColors.canvasPath}
          shadowBlur={active ? 8 : 0}
          shadowOpacity={0.45}
        />
      ) : null}

      {built.path.poses.map((pose, index) =>
        pose.kind === "arc" && !isEndpoint(index, built.path.poses.length) ? (
          <ArcRadiusCircle key={`${pose.id}-radius`} pose={pose} scale={scale} />
        ) : null,
      )}

      {built.controls
        .filter((point) => point.ghost)
        .map((point) => {
          const canvasPoint = toCanvas(point, scale);
          return (
            <Circle
              key={point.id}
              x={canvasPoint.x}
              y={canvasPoint.y}
              radius={GHOST_RADIUS}
              fill={editorColors.ghostFill}
              stroke={editorColors.ghostStroke}
              strokeWidth={1}
              opacity={0.45}
              draggable={active}
              onDragStart={() => onBeginDrag(built.path.id, point.sourcePoseId)}
              onDragMove={(event) => onGhostDrag(built.path.id, point.sourcePoseId, event)}
              onDragEnd={(event) => onGhostDragEnd(built.path.id, point.sourcePoseId, event)}
            />
          );
        })}

      {built.path.actions.map((action) =>
        action.type === "callback" && built.segment ? (
          <CallbackMarker
            key={action.id}
            action={action}
            segment={built.segment}
            scale={scale}
            onDragStart={() => onBeginDrag(built.path.id)}
            onDrag={(event) => onCallbackDrag(built.path.id, action.id, event)}
            onDragEnd={(event) => onCallbackDragEnd(built.path.id, action.id, event)}
          />
        ) : null,
      )}

      {built.path.poses.map((pose) => (
        <PoseNode
          key={pose.id}
          pathId={built.path.id}
          pose={pose}
          active={active}
          selected={active && pose.id === selectedPoseId}
          showPoseLabels={showPoseLabels}
          scale={scale}
          onSelectPose={onSelectPose}
          onBeginDrag={onBeginDrag}
          onPoseDrag={onPoseDrag}
          onPoseDragEnd={onPoseDragEnd}
          onPoseDelete={onPoseDelete}
        />
      ))}
    </Group>
  );
}

function PoseNode({
  pathId,
  pose,
  active,
  selected,
  showPoseLabels,
  scale,
  onSelectPose,
  onBeginDrag,
  onPoseDrag,
  onPoseDragEnd,
  onPoseDelete,
}: {
  pathId: string;
  pose: EditorPose;
  active: boolean;
  selected: boolean;
  showPoseLabels: boolean;
  scale: number;
  onSelectPose: (poseId: string) => void;
  onBeginDrag: (pathId?: string, poseId?: string) => void;
  onPoseDrag: CanvasDragHandler;
  onPoseDragEnd: CanvasDragHandler;
  onPoseDelete: (pathId: string, poseId: string) => void;
}) {
  const canvasPoint = toCanvas(pose, scale);

  return (
    <Group
      x={canvasPoint.x}
      y={canvasPoint.y}
      draggable={active}
      dragBoundFunc={(position) => clampCanvasPosePosition(position, scale)}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelectPose(pose.id);
      }}
      onTap={() => onSelectPose(pose.id)}
      onDblClick={(event) => {
        event.cancelBubble = true;
        onPoseDelete(pathId, pose.id);
      }}
      onDblTap={(event) => {
        event.cancelBubble = true;
        onPoseDelete(pathId, pose.id);
      }}
      onDragStart={() => onBeginDrag(pathId, pose.id)}
      onDragMove={(event) => onPoseDrag(pathId, pose.id, event)}
      onDragEnd={(event) => onPoseDragEnd(pathId, pose.id, event)}
    >
      <Circle
        radius={POSE_RADIUS}
        fill={pose.kind === "arc" ? editorColors.arcPoseFill : editorColors.poseFill}
        stroke={
          selected
            ? editorColors.selected
            : pose.kind === "arc"
              ? editorColors.ghostStroke
              : editorColors.canvasPath
        }
        strokeWidth={selected ? 3 : 2}
      />
      {showPoseLabels ? (
        <Text
          x={8}
          y={-19}
          text={pose.name}
          fontSize={11}
          fontStyle="bold"
          fill={pose.kind === "arc" ? editorColors.ghostStroke : editorColors.poseFill}
        />
      ) : null}
    </Group>
  );
}

function ArcRadiusCircle({ pose, scale }: { pose: EditorPose; scale: number }) {
  const center = toCanvas(pose, scale);
  const radius = Math.max(MIN_ARC_RADIUS_IN, pose.radius) * scale;

  return (
    <Circle
      x={center.x}
      y={center.y}
      radius={radius}
      stroke={editorColors.ghostFill}
      strokeWidth={1.5}
      dash={[5, 7]}
      opacity={0.58}
    />
  );
}

function CallbackMarker({
  action,
  segment,
  scale,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  action: Extract<PathAction, { type: "callback" }>;
  segment: PathSegment;
  scale: number;
  onDragStart: () => void;
  onDrag: (event: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
}) {
  const point = pointAtDistance(segment, action.distanceIn);
  const canvasPoint = toCanvas(point, scale);

  return (
    <Group
      x={canvasPoint.x}
      y={canvasPoint.y}
      draggable
      onDragStart={onDragStart}
      onDragMove={onDrag}
      onDragEnd={onDragEnd}
    >
      <Circle
        radius={CALLBACK_RADIUS}
        fill={editorColors.callback}
        stroke={editorColors.callbackStroke}
        strokeWidth={1.5}
      />
    </Group>
  );
}
