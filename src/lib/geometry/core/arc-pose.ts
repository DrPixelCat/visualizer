import { Pose } from "./pose";

export class ArcPose extends Pose {
  public readonly radius: number;

  public constructor(x: number, y: number, radius: number, heading = Number.POSITIVE_INFINITY) {
    super(x, y, heading);
    this.radius = radius;
  }
}
