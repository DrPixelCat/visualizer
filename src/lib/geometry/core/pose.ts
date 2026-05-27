import { Translation2d, Vector2d, normalizeAngle } from "./vector";

export type Pose2d = Translation2d & {
  heading: number;
};

export class Pose implements Pose2d {
  public readonly x: number;
  public readonly y: number;
  public readonly heading: number;

  public constructor(x = 0, y = 0, heading = Number.POSITIVE_INFINITY) {
    this.x = x;
    this.y = y;
    this.heading = heading;
  }

  public static zero(): Pose {
    return new Pose(0, 0, 0);
  }

  public static fromTranslation(point: Translation2d, heading = Number.POSITIVE_INFINITY): Pose {
    return new Pose(point.x, point.y, heading);
  }

  public toVec(): Vector2d {
    return new Vector2d(this.x, this.y);
  }

  public add(other: Pose2d): Pose {
    return new Pose(this.x + other.x, this.y + other.y, this.heading + other.heading);
  }

  public subtract(other: Pose2d): Pose {
    return new Pose(this.x - other.x, this.y - other.y, this.heading - other.heading);
  }

  public multiply(scalar: number): Pose {
    return new Pose(this.x * scalar, this.y * scalar, this.heading * scalar);
  }

  public divide(scalar: number): Pose {
    return new Pose(this.x / scalar, this.y / scalar, this.heading / scalar);
  }

  public distanceTo(other: Translation2d): number {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  public isNear(other: Pose2d, distTolerance: number, angleTolerance: number): boolean {
    return (
      Math.abs(this.x - other.x) < distTolerance &&
      Math.abs(this.y - other.y) < distTolerance &&
      Math.abs(this.heading - other.heading) < angleTolerance
    );
  }

  public mirror(): Pose {
    return new Pose(-this.x, this.y, normalizeAngle(Math.PI - this.heading));
  }

  public copy(): Pose {
    return new Pose(this.x, this.y, this.heading);
  }
}
