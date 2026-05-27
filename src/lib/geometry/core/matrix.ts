// Minimal immutable matrix helper for spline coefficient generation.
export class Matrix {
  private readonly data: readonly (readonly number[])[];
  private readonly rows: number;
  private readonly cols: number;

  public constructor(data: readonly (readonly number[])[]) {
    if (data.length === 0 || data[0].length === 0) {
      throw new Error("Matrix data must contain at least one row and one column.");
    }

    const cols = data[0].length;
    if (data.some((row) => row.length !== cols)) {
      throw new Error("Matrix rows must all have the same length.");
    }

    this.rows = data.length;
    this.cols = cols;
    this.data = data.map((row) => [...row]);
  }

  public multiplyVector(vector: readonly number[]): number[] {
    if (vector.length !== this.cols) {
      throw new Error(
        `Matrix columns (${this.cols}) must match vector length (${vector.length}).`,
      );
    }

    const result = new Array<number>(this.rows);
    for (let i = 0; i < this.rows; i++) {
      let sum = 0;
      for (let j = 0; j < this.cols; j++) {
        sum += this.data[i][j] * vector[j];
      }
      result[i] = sum;
    }

    return result;
  }

  public multiplyMatrix(matrix: Matrix): Matrix {
    if (this.cols !== matrix.rows) {
      throw new Error(
        `Cannot multiply: this matrix is ${this.rows}x${this.cols} but other matrix is ${matrix.rows}x${matrix.cols}. Inner dimensions must match.`,
      );
    }

    const result: number[][] = Array.from({ length: this.rows }, () =>
      new Array<number>(matrix.cols).fill(0),
    );

    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < matrix.cols; j++) {
        let sum = 0;
        for (let k = 0; k < this.cols; k++) {
          sum += this.data[i][k] * matrix.data[k][j];
        }
        result[i][j] = sum;
      }
    }

    return new Matrix(result);
  }

  public get(row: number, col: number): number {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      throw new Error("Index out of bounds.");
    }
    return this.data[row][col];
  }

  public getRows(): number {
    return this.rows;
  }

  public getCols(): number {
    return this.cols;
  }
}
