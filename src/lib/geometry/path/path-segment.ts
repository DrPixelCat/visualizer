import { Translation2d, Vector2d } from "../core/vector";
import { ParametricSegment } from "../curves/parametric-segment";
import { PathPoint } from "./path-point";

const POINTS_PER_INCH = 0.5;

// Adds arc-length lookup and closest-point projection around a parametric curve.
export class PathSegment {
  public readonly segment: ParametricSegment;
  public readonly length: number;
  public readonly lutPoints: readonly PathPoint[];

  public constructor(segment: ParametricSegment) {
    this.segment = segment;
    const coarseLength = this.calculateCoarseLength();
    const calculatedPoints = Math.trunc(coarseLength * POINTS_PER_INCH);
    const numPoints = Math.max(2, calculatedPoints);
    const lutPoints = new Array<PathPoint>(numPoints);

    let distFromEnd = 0;
    let lastPoint: Vector2d | null = null;

    for (let i = numPoints - 1; i >= 0; i--) {
      const t = i / (numPoints - 1);
      const location = segment.getPosition(t);

      if (lastPoint !== null) {
        distFromEnd += lastPoint.subtract(location).getMagnitude();
      }

      lastPoint = location;
      lutPoints[i] = new PathPoint(t, distFromEnd, location);
    }

    this.length = distFromEnd;
    this.lutPoints = lutPoints;
  }

  public getBestT(location: Translation2d): number {
    const target = Vector2d.from(location);
    let bestT = 0;
    let minDistSq = Number.MAX_VALUE;

    for (const point of this.lutPoints) {
      const distSq = point.getLocation().subtract(target).getMagnitudeSquared();

      if (distSq < minDistSq) {
        minDistSq = distSq;
        bestT = point.getT();
      }
    }

    // Refine the LUT pick with a few Newton-Raphson iterations.
    for (let i = 0; i < 5; i++) {
      const b = this.segment.getPosition(bestT);
      const d1 = this.segment.getFirstDerivative(bestT);
      const diff = b.subtract(target);
      const numerator = diff.dotProduct(d1);

      if (Math.abs(numerator) < 1e-6 && bestT > 0 && bestT < 1) {
        break;
      }

      const d2 = this.segment.getSecondDerivative(bestT);
      const denominator = d1.dotProduct(d1) + diff.dotProduct(d2);

      if (denominator <= 0) {
        break;
      }

      const previousT = bestT;
      bestT = Math.max(0, Math.min(1, bestT - numerator / denominator));

      if (Math.abs(bestT - previousT) < 1e-6) {
        break;
      }
    }

    return bestT;
  }

  public getPosition(t: number): Vector2d {
    return this.segment.getPosition(t);
  }

  public getFirstDerivative(t: number): Vector2d {
    return this.segment.getFirstDerivative(t);
  }

  public getSecondDerivative(t: number): Vector2d {
    return this.segment.getSecondDerivative(t);
  }

  public getDistanceToEndIn(closestPointOnCurve: Translation2d, t: number): number {
    const closestPoint = Vector2d.from(closestPointOnCurve);

    if (t >= 1) return 0;

    if (t <= 0) {
      const mag = closestPoint.subtract(this.lutPoints[0].getLocation()).getMagnitude();
      return mag + this.lutPoints[0].getDistanceToEndIn();
    }

    const lastIndex = this.lutPoints.length - 1;
    const nextIndex = Math.max(0, Math.min(Math.ceil(t * lastIndex), lastIndex));
    const nextPoint = this.lutPoints[nextIndex];
    const mag = closestPoint.subtract(nextPoint.getLocation()).getMagnitude();

    return mag + nextPoint.getDistanceToEndIn();
  }

  public getLengthIn(): number {
    return this.length;
  }

  private calculateCoarseLength(): number {
    const samples = 8;
    let roughLength = 0;
    let prev = this.segment.getPosition(0);

    for (let i = 1; i <= samples; i++) {
      const curr = this.segment.getPosition(i / samples);
      roughLength += curr.subtract(prev).getMagnitude();
      prev = curr;
    }

    return roughLength;
  }
}
