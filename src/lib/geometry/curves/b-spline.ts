import { Matrix } from "../core/matrix";
import {
  ParametricSegment,
  getCurvature,
  getNormalVector,
  getTangentVector,
} from "./parametric-segment";
import { Translation2d, Vector2d } from "../core/vector";

const MAX_T_EXCLUSIVE = 0.999999;

const BLEND_MATRIX = new Matrix([
  [-1 / 6, 3 / 6, -3 / 6, 1 / 6],
  [3 / 6, -6 / 6, 3 / 6, 0],
  [-3 / 6, 0, 3 / 6, 0],
  [1 / 6, 4 / 6, 1 / 6, 0],
]);

export class BSpline implements ParametricSegment {
  public readonly numSegments: number;

  private readonly cx: readonly number[][];
  private readonly cy: readonly number[][];

  public constructor(inputPoints: readonly Translation2d[]) {
    if (inputPoints.length < 2) {
      throw new Error("You can't make a B-Spline curve with fewer than 2 points.");
    }

    const points = inputPoints.map(Vector2d.from);
    const paddedPoints: Vector2d[] = new Array(points.length + 2);
    paddedPoints[0] = points[1].reflect(points[0]);
    paddedPoints[paddedPoints.length - 1] = points[points.length - 2].reflect(
      points[points.length - 1],
    );

    for (let i = 0; i < points.length; i++) {
      paddedPoints[i + 1] = points[i];
    }

    this.numSegments = paddedPoints.length - 3;
    const cx = new Array<number[]>(this.numSegments);
    const cy = new Array<number[]>(this.numSegments);

    for (let i = 0; i < this.numSegments; i++) {
      const p0 = paddedPoints[i];
      const p1 = paddedPoints[i + 1];
      const p2 = paddedPoints[i + 2];
      const p3 = paddedPoints[i + 3];

      cx[i] = BLEND_MATRIX.multiplyVector([p0.x, p1.x, p2.x, p3.x]);
      cy[i] = BLEND_MATRIX.multiplyVector([p0.y, p1.y, p2.y, p3.y]);
    }

    this.cx = cx;
    this.cy = cy;
  }

  public getPosition(t: number): Vector2d {
    const { segment, localT } = this.getSegmentParameter(t);
    const cX = this.cx[segment];
    const cY = this.cy[segment];

    const x = ((cX[0] * localT + cX[1]) * localT + cX[2]) * localT + cX[3];
    const y = ((cY[0] * localT + cY[1]) * localT + cY[2]) * localT + cY[3];

    return new Vector2d(x, y);
  }

  public getFirstDerivative(t: number): Vector2d {
    const { segment, localT } = this.getSegmentParameter(t);
    const cX = this.cx[segment];
    const cY = this.cy[segment];

    const dx = (3 * cX[0] * localT + 2 * cX[1]) * localT + cX[2];
    const dy = (3 * cY[0] * localT + 2 * cY[1]) * localT + cY[2];

    return new Vector2d(dx, dy).multiply(this.numSegments);
  }

  public getSecondDerivative(t: number): Vector2d {
    const { segment, localT } = this.getSegmentParameter(t);
    const cX = this.cx[segment];
    const cY = this.cy[segment];

    const ddx = 6 * cX[0] * localT + 2 * cX[1];
    const ddy = 6 * cY[0] * localT + 2 * cY[1];

    return new Vector2d(ddx, ddy).multiply(this.numSegments * this.numSegments);
  }

  public getTangentVector(t: number): Vector2d {
    return getTangentVector(this, t);
  }

  public getNormalVector(t: number): Vector2d {
    return getNormalVector(this, t);
  }

  public getCurvature(t: number): number {
    return getCurvature(this, t);
  }

  private getSegmentParameter(t: number): { segment: number; localT: number } {
    const clampedT = clampSplineParameter(t);
    const continuousIndex = clampedT * this.numSegments;
    const segment = Math.trunc(continuousIndex);

    return {
      segment,
      localT: continuousIndex - segment,
    };
  }
}

export function clampSplineParameter(t: number): number {
  if (t >= 1) return MAX_T_EXCLUSIVE;
  if (t < 0) return 0;
  return t;
}
