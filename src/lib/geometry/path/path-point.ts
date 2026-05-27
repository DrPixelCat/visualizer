import { Vector2d } from "../core/vector";

export class PathPoint {
  public readonly t: number;
  public readonly distanceToEnd: number;
  public readonly location: Vector2d;

  public constructor(t: number, distanceToEnd: number, location: Vector2d) {
    this.t = t;
    this.distanceToEnd = distanceToEnd;
    this.location = location;
  }

  public getLocation(): Vector2d {
    return this.location;
  }

  public getT(): number {
    return this.t;
  }

  public getDistanceToEndIn(): number {
    return this.distanceToEnd;
  }
}
