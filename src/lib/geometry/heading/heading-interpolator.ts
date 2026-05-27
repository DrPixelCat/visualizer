import { Angle } from "../core/angle";
import { Vector2d } from "../core/vector";

export enum InterpolationStyle {
  CONSTANT_START_HEADING = "CONSTANT_START_HEADING",
  CONSTANT_END_HEADING = "CONSTANT_END_HEADING",
  TANGENT_OPTIMAL = "TANGENT_OPTIMAL",
  TANGENT_FORWARD = "TANGENT_FORWARD",
  TANGENT_CUSTOM = "TANGENT_CUSTOM",
  SMOOTH_START_TO_END = "SMOOTH_START_TO_END",
  CUSTOM_DIST_FUNCTION = "CUSTOM_DIST_FUNCTION",
}

export type HeadingFunction = (s: number) => Angle;

export class HeadingInterpolator {
  private readonly style: InterpolationStyle;
  private readonly startHeading?: Angle;
  private readonly endHeading?: Angle;
  private readonly customOffset?: Angle;
  private readonly customFunction?: HeadingFunction;

  private constructor(options: {
    style: InterpolationStyle;
    startHeading?: Angle;
    endHeading?: Angle;
    customOffset?: Angle;
    customFunction?: HeadingFunction;
  }) {
    this.style = options.style;
    this.startHeading = options.startHeading?.copy();
    this.endHeading = options.endHeading?.copy();
    this.customOffset = options.customOffset?.copy();
    this.customFunction = options.customFunction;
  }

  public static tangentForward(): HeadingInterpolator {
    return new HeadingInterpolator({ style: InterpolationStyle.TANGENT_FORWARD });
  }

  public static constantStartHeading(startHeading: Angle): HeadingInterpolator {
    return new HeadingInterpolator({
      style: InterpolationStyle.CONSTANT_START_HEADING,
      startHeading,
    });
  }

  public static constantEndHeading(endHeading: Angle): HeadingInterpolator {
    return new HeadingInterpolator({
      style: InterpolationStyle.CONSTANT_END_HEADING,
      endHeading,
    });
  }

  public static tangentCustom(customOffset: Angle): HeadingInterpolator {
    return new HeadingInterpolator({
      style: InterpolationStyle.TANGENT_CUSTOM,
      customOffset,
    });
  }

  public static smoothStartToEnd(startHeading: Angle, endHeading: Angle): HeadingInterpolator {
    return new HeadingInterpolator({
      style: InterpolationStyle.SMOOTH_START_TO_END,
      startHeading,
      endHeading,
    });
  }

  public static tangentOptimal(startHeading: Angle, endHeading: Angle): HeadingInterpolator {
    return new HeadingInterpolator({
      style: InterpolationStyle.TANGENT_OPTIMAL,
      startHeading,
      endHeading,
    });
  }

  public static customDistanceFunction(customFunction: HeadingFunction): HeadingInterpolator {
    return new HeadingInterpolator({
      style: InterpolationStyle.CUSTOM_DIST_FUNCTION,
      customFunction,
    });
  }

  public getStyle(): InterpolationStyle {
    return this.style;
  }

  public getHeading(s: number, pathTangent: Vector2d): Angle {
    switch (this.style) {
      case InterpolationStyle.CONSTANT_START_HEADING:
        return this.requireStartHeading().copy();
      case InterpolationStyle.CONSTANT_END_HEADING:
        return this.requireEndHeading().copy();
      case InterpolationStyle.TANGENT_FORWARD:
        return new Angle(pathTangent.getTheta());
      case InterpolationStyle.TANGENT_CUSTOM:
        return new Angle(pathTangent.getTheta()).plus(this.requireCustomOffset());
      case InterpolationStyle.TANGENT_OPTIMAL:
        return this.calculateOptimalTangent(pathTangent);
      case InterpolationStyle.SMOOTH_START_TO_END:
        return this.calculateShortestPathLerp(s);
      case InterpolationStyle.CUSTOM_DIST_FUNCTION:
        if (!this.customFunction) {
          throw new Error("CUSTOM_DIST_FUNCTION requires a custom function.");
        }
        return this.customFunction(s);
      default:
        throw new Error(`Unhandled heading interpolation style: ${this.style satisfies never}`);
    }
  }

  private calculateOptimalTangent(tangent: Vector2d): Angle {
    const forwardTangent = new Angle(tangent.getTheta());
    const backwardTangent = forwardTangent.plus(new Angle(Math.PI));
    const startHeading = this.requireStartHeading();
    const endHeading = this.requireEndHeading();

    const entryCostFwd = Math.abs(getShortestAngularDifference(startHeading, forwardTangent));
    const exitCostFwd = Math.abs(getShortestAngularDifference(forwardTangent, endHeading));
    const totalCostFwd = entryCostFwd + exitCostFwd;

    const entryCostBwd = Math.abs(getShortestAngularDifference(startHeading, backwardTangent));
    const exitCostBwd = Math.abs(getShortestAngularDifference(backwardTangent, endHeading));
    const totalCostBwd = entryCostBwd + exitCostBwd;

    return totalCostBwd < totalCostFwd ? backwardTangent : forwardTangent;
  }

  private calculateShortestPathLerp(s: number): Angle {
    const clampedS = Math.max(0, Math.min(1, s));
    const profiledS = 3 * clampedS * clampedS - 2 * clampedS * clampedS * clampedS;
    const startHeading = this.requireStartHeading();
    const diffRad = getShortestAngularDifference(startHeading, this.requireEndHeading());

    return new Angle(startHeading.getRad() + diffRad * profiledS);
  }

  private requireStartHeading(): Angle {
    if (!this.startHeading) {
      throw new Error(`${this.style} requires a start heading.`);
    }
    return this.startHeading;
  }

  private requireEndHeading(): Angle {
    if (!this.endHeading) {
      throw new Error(`${this.style} requires an end heading.`);
    }
    return this.endHeading;
  }

  private requireCustomOffset(): Angle {
    if (!this.customOffset) {
      throw new Error(`${this.style} requires a custom offset.`);
    }
    return this.customOffset;
  }
}

export function getShortestAngularDifference(from: Angle, to: Angle): number {
  let diff = ((to.getRad() - from.getRad() + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (diff < -Math.PI) {
    diff += 2 * Math.PI;
  }
  return diff;
}
