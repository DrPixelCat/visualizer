import { normalizeAngle } from "./vector";

export class Angle {
  private readonly radians: number;

  public constructor(radians = 0) {
    this.radians = radians;
  }

  public static fromRad(radians: number): Angle {
    return new Angle(radians);
  }

  public static fromDeg(degrees: number): Angle {
    return new Angle((degrees * Math.PI) / 180);
  }

  public getRad(): number {
    return this.radians;
  }

  public getDeg(): number {
    return (this.radians * 180) / Math.PI;
  }

  public plus(other: Angle): Angle {
    return new Angle(this.radians + other.radians);
  }

  public minus(other: Angle): Angle {
    return new Angle(this.radians - other.radians);
  }

  public mirror(): Angle {
    return new Angle(normalizeAngle(Math.PI - this.radians));
  }

  public copy(): Angle {
    return new Angle(this.radians);
  }
}
