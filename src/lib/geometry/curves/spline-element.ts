import { BSpline } from "./b-spline";
import { sampleParametricSegment, SplineSample } from "./sampling";
import { Translation2d, Vector2d } from "../core/vector";

export type BSplineElement = {
  kind: "b-spline";
  controlPoints: readonly Vector2d[];
  spline: BSpline;
  samples: readonly SplineSample[];
};

export function createBSplineElement(
  controlPoints: readonly Translation2d[],
  sampleCount = 100,
): BSplineElement {
  const spline = new BSpline(controlPoints);

  return {
    kind: "b-spline",
    controlPoints: controlPoints.map(Vector2d.from),
    spline,
    samples: sampleParametricSegment(spline, sampleCount),
  };
}
