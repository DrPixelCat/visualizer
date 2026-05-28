import { InterpolationStyle } from "@/lib/geometry";

// Field dimensions and interaction tolerances are expressed in real inches.
export const FIELD_SIZE_IN = 141;
export const FIELD_EDGE_MARGIN_IN = 0;
export const MIN_ARC_RADIUS_IN = 2;
export const MIN_ARC_CLEARANCE_IN = 3;
export const POSE_RADIUS = 5;
export const GHOST_RADIUS = 4;
export const CALLBACK_RADIUS = 10;

export const INTERPOLATION_OPTIONS = [
  InterpolationStyle.CONSTANT_START_HEADING,
  InterpolationStyle.CONSTANT_END_HEADING,
  InterpolationStyle.TANGENT_OPTIMAL,
  InterpolationStyle.TANGENT_FORWARD,
  InterpolationStyle.TANGENT_CUSTOM,
  InterpolationStyle.SMOOTH_START_TO_END,
  InterpolationStyle.CUSTOM_DIST_FUNCTION,
] as const;
