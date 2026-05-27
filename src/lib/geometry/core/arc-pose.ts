import { Pose } from "./pose";

// Pose marker that asks the path builder to insert rounded-corner controls.
export class ArcPose extends Pose {
  public readonly radius: number;

  public constructor(x: number, y: number, radius: number, heading = Number.POSITIVE_INFINITY) {
    super(x, y, heading);
    this.radius = radius;
  }
}
