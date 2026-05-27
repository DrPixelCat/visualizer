export type Translation2d = {
  x: number;
  y: number;
};

const EPSILON = 1e-9;

// Immutable 2D vector math used by both the editor and spline port.
export class Vector2d implements Translation2d {
  public readonly x: number;
  public readonly y: number;

  public constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  public static from(point: Translation2d): Vector2d {
    return point instanceof Vector2d ? point : new Vector2d(point.x, point.y);
  }

  public getX(): number {
    return this.x;
  }

  public getY(): number {
    return this.y;
  }

  public getMagnitude(): number {
    return Math.hypot(this.x, this.y);
  }

  public getMagnitudeSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  public getTheta(): number {
    return Math.atan2(this.y, this.x);
  }

  public dotProduct(other: Translation2d): number {
    return this.x * other.x + this.y * other.y;
  }

  public crossProduct(other: Translation2d): number {
    return this.x * other.y - this.y * other.x;
  }

  public add(other: Translation2d): Vector2d {
    return new Vector2d(this.x + other.x, this.y + other.y);
  }

  public subtract(other: Translation2d): Vector2d {
    return new Vector2d(this.x - other.x, this.y - other.y);
  }

  public multiply(scalar: number): Vector2d {
    return new Vector2d(this.x * scalar, this.y * scalar);
  }

  public div(scalar: number): Vector2d {
    return new Vector2d(this.x / scalar, this.y / scalar);
  }

  public negate(): Vector2d {
    return this.multiply(-1);
  }

  public rotate(angleRadians: number): Vector2d {
    const cosA = Math.cos(angleRadians);
    const sinA = Math.sin(angleRadians);

    return new Vector2d(
      this.x * cosA - this.y * sinA,
      this.x * sinA + this.y * cosA,
    );
  }

  public rotated(angleRadians: number): Vector2d {
    return this.rotate(normalizeAngle(angleRadians));
  }

  public normalize(): Vector2d {
    const magnitude = this.getMagnitude();
    return magnitude > EPSILON ? this.div(magnitude) : new Vector2d(0, 0);
  }

  public reflect(across: Translation2d): Vector2d {
    return Vector2d.from(across).add(this.subtract(across).multiply(-1));
  }

  public copy(): Vector2d {
    return new Vector2d(this.x, this.y);
  }

  public toString(): string {
    return `Vector(x: ${this.x.toFixed(3)} inches, y: ${this.y.toFixed(3)} inches)`;
  }

  public debug(): string {
    return `Vector <x: ${this.x.toFixed(3)}, y: ${this.y.toFixed(3)}>, <magnitude: ${this.getMagnitude().toFixed(3)}, theta: ${this.getTheta().toFixed(3)}>`;
  }
}

export function normalizeAngle(angleRadians: number): number {
  let angle = angleRadians;
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}
