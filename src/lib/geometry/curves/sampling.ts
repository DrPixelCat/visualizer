import { ParametricSegment } from "./parametric-segment";
import { Vector2d } from "../core/vector";

export type SplineSample = {
  t: number;
  position: Vector2d;
  firstDerivative: Vector2d;
  secondDerivative: Vector2d;
  curvature: number;
};

export type CurvedPathElement = {
  kind: "b-spline";
  samples: SplineSample[];
};

export function sampleParametricSegment(
  segment: ParametricSegment & { getCurvature?: (t: number) => number },
  sampleCount: number,
): SplineSample[] {
  if (!Number.isInteger(sampleCount) || sampleCount < 2) {
    throw new Error("sampleCount must be an integer greater than or equal to 2.");
  }

  const samples: SplineSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = i / (sampleCount - 1);
    const d1 = segment.getFirstDerivative(t);
    const d2 = segment.getSecondDerivative(t);
    const magSq = d1.getMagnitudeSquared();
    const curvature =
      segment.getCurvature?.(t) ??
      (magSq <= 1e-9 ? 0 : d1.crossProduct(d2) / Math.pow(magSq, 1.5));

    samples.push({
      t,
      position: segment.getPosition(t),
      firstDerivative: d1,
      secondDerivative: d2,
      curvature,
    });
  }

  return samples;
}
