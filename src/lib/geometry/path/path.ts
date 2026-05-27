import { Angle } from "../core/angle";
import { Pose } from "../core/pose";
import { HeadingInterpolator } from "../heading/heading-interpolator";
import { PathSegment } from "./path-segment";

export type CallbackMarker = {
  s: number;
  triggered: boolean;
};

export enum NodeType {
  DRIVE = "DRIVE",
  TURN = "TURN",
  HOLD = "HOLD",
}

export type DrivePathNode = {
  type: NodeType.DRIVE;
  segment: PathSegment;
  interpolator: HeadingInterpolator;
  callbacks: CallbackMarker[];
};

export type TurnPathNode = {
  type: NodeType.TURN;
  targetHeading: Angle;
};

export type HoldPathNode = {
  type: NodeType.HOLD;
  holdPose: Pose;
  holdDurationSeconds: number;
};

export type PathNode = DrivePathNode | TurnPathNode | HoldPathNode;

export class Path {
  public readonly nodes: PathNode[] = [];
  private currentIndex = 0;
  private readonly buildWarnings: string[] = [];

  public addSegment(segment: PathSegment, interpolator: HeadingInterpolator): void {
    this.nodes.push({
      type: NodeType.DRIVE,
      segment,
      interpolator,
      callbacks: [],
    });
  }

  public overrideLastInterpolator(interpolator: HeadingInterpolator): void {
    const last = this.nodes[this.nodes.length - 1];
    if (last?.type === NodeType.DRIVE) {
      this.nodes[this.nodes.length - 1] = { ...last, interpolator };
    }
  }

  public addTurn(targetHeading: Angle): void {
    this.nodes.push({
      type: NodeType.TURN,
      targetHeading,
    });
  }

  public addHold(holdPose: Pose, durationSeconds: number): void {
    this.nodes.push({
      type: NodeType.HOLD,
      holdPose,
      holdDurationSeconds: durationSeconds,
    });
  }

  public addCallbackToLastSegment(s: number): void {
    const last = this.nodes[this.nodes.length - 1];
    if (last?.type === NodeType.DRIVE) {
      last.callbacks.push({ s, triggered: false });
    }
  }

  public getCurrentNode(): PathNode {
    if (this.nodes.length === 0) {
      throw new Error("Path is empty.");
    }
    return this.nodes[this.currentIndex];
  }

  public advance(): void {
    if (!this.isLastSegment()) {
      this.currentIndex++;
    }
  }

  public addWarning(warning: string): void {
    if (!this.buildWarnings.includes(warning)) {
      this.buildWarnings.push(warning);
    }
  }

  public getWarnings(): readonly string[] {
    return this.buildWarnings;
  }

  public isLastSegment(): boolean {
    return this.currentIndex >= this.nodes.length - 1;
  }

  public reset(): void {
    this.currentIndex = 0;
  }
}
