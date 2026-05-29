import { InterpolationStyle } from "@/lib/geometry";
import { makePose } from "@/lib/editor/path-editor-geometry";
import type { EditorPath, EditorState } from "@/lib/editor/path-editor-types";

const INITIAL_PATHS: EditorPath[] = [
  {
    id: "path-0",
    name: "path1",
    collapsed: false,
    interpolation: InterpolationStyle.SMOOTH_START_TO_END,
    tangentOffsetDeg: 90,
    customFunctionSource: "s -> Angle.fromDeg(180 + (s * 360.0))",
    poses: [
      makePose("pose1", -54, -36, 0),
      makePose("pose2", -20, 36, null),
      { ...makePose("pose3", 16, 22, null), kind: "arc", radius: 18 },
      makePose("pose4", 54, -38, 45),
    ],
    actions: [{ id: "action-0", type: "distanceCallback", distanceIn: 60, label: "callback" }],
  },
];

export const INITIAL_STATE: EditorState = {
  paths: INITIAL_PATHS,
  turns: [],
  activePathId: INITIAL_PATHS[0].id,
  selection: { type: "pose", pathId: INITIAL_PATHS[0].id, poseId: INITIAL_PATHS[0].poses[0].id },
  showPoseLabels: true,
  favoritePoseIds: [],
};
