import { Angle } from "../core/angle";
import { ArcPose } from "../core/arc-pose";
import { Pose } from "../core/pose";
import { Vector2d } from "../core/vector";
import { BSpline } from "../curves/b-spline";
import {
  HeadingFunction,
  HeadingInterpolator,
  InterpolationStyle,
} from "../heading/heading-interpolator";
import { Path } from "./path";
import { PathSegment } from "./path-segment";

const DEFAULT_INTERPOLATION = InterpolationStyle.SMOOTH_START_TO_END;

// Fluent builder mirror used for previews and future import/export checks.
export class PathBuilder {
  private readonly path = new Path();
  private lastPose: Pose;
  private currentStyle = DEFAULT_INTERPOLATION;

  public constructor(startPose: Pose) {
    this.lastPose = startPose;
  }

  public addControlPoints(...poses: Pose[]): PathBuilder {
    if (poses.length < 2) {
      throw new Error("A B-Spline must be created with > 1 points.");
    }
    if (poses[0] instanceof ArcPose || poses[poses.length - 1] instanceof ArcPose) {
      throw new Error("Endpoints can't be arcs.");
    }

    const processedPoses: Pose[] = [poses[0]];
    let intermediateWarningSent = false;

    for (let i = 1; i < poses.length - 1; i++) {
      const currentPose = poses[i];

      if (!intermediateWarningSent && Number.isFinite(currentPose.heading)) {
        this.path.addWarning(
          "APEX WARNING: Intermediate B-Spline headings are ignored! Only the final pose heading controls the end heading.",
        );
        intermediateWarningSent = true;
      }

      if (currentPose instanceof ArcPose) {
        // Arc poses are expanded before spline construction so the core curve stays generic.
        processedPoses.push(...expandArcPose(poses[i - 1], currentPose, poses[i + 1]));
      } else {
        processedPoses.push(currentPose);
      }
    }

    processedPoses.push(poses[poses.length - 1]);

    const vectors: Vector2d[] = [this.lastPose.toVec()];
    for (const pose of processedPoses) {
      vectors.push(pose.toVec());
    }

    const endPose = processedPoses[processedPoses.length - 1];
    const curve = new PathSegment(new BSpline(vectors));

    this.path.addSegment(curve, this.buildSafeInterpolator(this.lastPose, endPose));
    this.lastPose = endPose;

    return this;
  }

  public interpolateWith(styleOrFunction: InterpolationStyle | HeadingFunction): PathBuilder {
    if (typeof styleOrFunction === "function") {
      return this.interpolatePreviousSegment(
        HeadingInterpolator.customDistanceFunction(styleOrFunction),
      );
    }

    return this.interpolatePreviousSegment(this.buildInterpolatorForStyle(styleOrFunction));
  }

  public turnTo(targetHeading: Angle): PathBuilder {
    this.path.addTurn(targetHeading);
    this.lastPose = new Pose(this.lastPose.x, this.lastPose.y, targetHeading.getRad());
    return this;
  }

  public holdPose(durationSeconds: number): PathBuilder {
    this.path.addHold(this.lastPose, durationSeconds);
    return this;
  }

  public setInterpolationStyle(style: InterpolationStyle): PathBuilder {
    switch (style) {
      case InterpolationStyle.TANGENT_OPTIMAL:
      case InterpolationStyle.TANGENT_FORWARD:
      case InterpolationStyle.SMOOTH_START_TO_END:
        this.currentStyle = style;
        return this;
      default:
        throw new Error(
          `You need more parameters for: ${style}. You can use this style on specific segments with interpolateWith(<HeadingInterpolator>).`,
        );
    }
  }

  public addCallback(s: number): PathBuilder {
    const clampedS = Math.max(0, Math.min(1, s));
    this.path.addCallbackToLastSegment(clampedS);
    return this;
  }

  public build(): Path {
    return this.path;
  }

  private interpolatePreviousSegment(interpolator: HeadingInterpolator): PathBuilder {
    this.path.overrideLastInterpolator(interpolator);
    return this;
  }

  private buildSafeInterpolator(start: Pose, end: Pose): HeadingInterpolator {
    if (this.currentStyle === InterpolationStyle.TANGENT_FORWARD) {
      return HeadingInterpolator.tangentForward();
    }

    const missingHeading = !Number.isFinite(start.heading) || !Number.isFinite(end.heading);
    if (missingHeading) {
      this.path.addWarning(
        "APEX WARNING: Segment missing start/end heading! Falling back to TANGENT_FORWARD. Use Pose(x, y, heading) to fix this.",
      );
      return HeadingInterpolator.tangentForward();
    }

    return this.buildBoundedInterpolator(this.currentStyle, start.heading, end.heading);
  }

  private buildInterpolatorForStyle(style: InterpolationStyle): HeadingInterpolator {
    if (style === InterpolationStyle.TANGENT_FORWARD) {
      return HeadingInterpolator.tangentForward();
    }

    throw new Error(
      `${style} requires additional parameters in the Java API; use a specific HeadingInterpolator factory for this segment.`,
    );
  }

  private buildBoundedInterpolator(
    style: InterpolationStyle,
    startHeading: number,
    endHeading: number,
  ): HeadingInterpolator {
    const start = new Angle(startHeading);
    const end = new Angle(endHeading);

    switch (style) {
      case InterpolationStyle.SMOOTH_START_TO_END:
        return HeadingInterpolator.smoothStartToEnd(start, end);
      case InterpolationStyle.TANGENT_OPTIMAL:
        return HeadingInterpolator.tangentOptimal(start, end);
      default:
        throw new Error(`Invalid bounded interpolation style: ${style}.`);
    }
  }
}

function expandArcPose(prevPose: Pose, arcPose: ArcPose, nextPose: Pose): [Pose, Pose] {
  const radius = arcPose.radius;
  if (radius < 2) {
    throw new Error("ArcPose radius must be at least 2.0 inches.");
  }

  const arcVector = arcPose.toVec();
  const vecToLast = prevPose.toVec().subtract(arcVector);
  const vecToNext = nextPose.toVec().subtract(arcVector);
  const distToLast = vecToLast.getMagnitude();
  const distToNext = vecToNext.getMagnitude();

  if (radius > distToLast) {
    throw new Error(`ArcPose radius (${radius}) exceeds distance to the last control point.`);
  }
  if (radius > distToNext) {
    throw new Error(`ArcPose radius (${radius}) exceeds distance to the next control point.`);
  }

  const p1Vec = arcVector.add(vecToLast.multiply(radius / distToLast));
  const p2Vec = arcVector.add(vecToNext.multiply(radius / distToNext));

  return [
    new Pose(p1Vec.x, p1Vec.y, arcPose.heading),
    new Pose(p2Vec.x, p2Vec.y, arcPose.heading),
  ];
}
