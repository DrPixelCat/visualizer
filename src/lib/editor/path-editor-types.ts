import type {
  BSpline,
  InterpolationStyle,
  PathSegment,
  Vector2d,
  Translation2d,
} from "@/lib/geometry";

// Editor-side data keeps UI state separate from the pure geometry classes.
export type PoseKind = "pose" | "arc";
export type GhostRole = "before" | "after";

export type EditorPose = Translation2d & {
  id: string;
  name: string;
  headingDeg: number | null;
  kind: PoseKind;
  radius: number;
};

export type PathAction =
  | { id: string; type: "distanceCallback"; distanceIn: number; label: string }
  | { id: string; type: "angularCallback"; angleDeg: number; label: string };

export type EditorTurn = {
  id: string;
  name: string;
  sourcePathId?: string;
  x: number;
  y: number;
  startHeadingDeg: number;
  targetHeadingDeg: number;
  collapsed: boolean;
};

export type EditorSelection =
  | { type: "pose"; pathId: string; poseId: string }
  | { type: "path"; pathId: string }
  | { type: "turn"; turnId: string }
  | { type: "action"; pathId: string; actionId: string }
  | null;

export type EditorPath = {
  id: string;
  name: string;
  poses: EditorPose[];
  interpolation: InterpolationStyle;
  tangentOffsetDeg: number;
  customFunctionSource: string;
  actions: PathAction[];
  collapsed: boolean;
};

export type EditorState = {
  paths: EditorPath[];
  turns: EditorTurn[];
  activePathId: string;
  selection: EditorSelection;
  showPoseLabels: boolean;
  favoritePoseIds: string[];
};

export type HistoryState = {
  past: EditorState[];
  present: EditorState;
  future: EditorState[];
};

export type ProcessedControlPoint = Translation2d & {
  id: string;
  sourcePoseId: string;
  ghost: boolean;
  ghostRole?: GhostRole;
};

export type BuiltPath = {
  path: EditorPath;
  controls: ProcessedControlPoint[];
  spline: BSpline | null;
  segment: PathSegment | null;
  curve: Vector2d[];
};
