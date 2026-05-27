import { Vector2d } from "../core/vector";

const EPSILON = 1e-9;

export interface ParametricSegment {
  getPosition(t: number): Vector2d;
  getFirstDerivative(t: number): Vector2d;
  getSecondDerivative(t: number): Vector2d;
}

export function getTangentVector(segment: ParametricSegment, t: number): Vector2d {
  const d1 = segment.getFirstDerivative(t);
  return d1.getMagnitudeSquared() < EPSILON ? new Vector2d(0, 0) : d1.normalize();
}

export function getNormalVector(segment: ParametricSegment, t: number): Vector2d {
  return getTangentVector(segment, t).rotated(Math.PI / 2);
}

export function getCurvature(segment: ParametricSegment, t: number): number {
  const d1 = segment.getFirstDerivative(t);
  const d2 = segment.getSecondDerivative(t);
  const magSq = d1.getMagnitudeSquared();

  if (magSq <= EPSILON) {
    return 0;
  }

  return d1.crossProduct(d2) / Math.pow(magSq, 1.5);
}
