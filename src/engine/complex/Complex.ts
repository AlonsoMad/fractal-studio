/**
 * Complex number class for CPU-side calculations.
 * GPU-side uses vec2<f32> directly in WGSL.
 */
export class Complex {
  public re: number;
  public im: number;

  constructor(
    re: number = 0,
    im: number = 0
  ) {
    this.re = re;
    this.im = im;
  }

  static fromPolar(r: number, theta: number): Complex {
    return new Complex(r * Math.cos(theta), r * Math.sin(theta));
  }

  clone(): Complex {
    return new Complex(this.re, this.im);
  }

  // ─── Arithmetic ────────────────────────────────────────────

  add(other: Complex): Complex {
    return new Complex(this.re + other.re, this.im + other.im);
  }

  sub(other: Complex): Complex {
    return new Complex(this.re - other.re, this.im - other.im);
  }

  mul(other: Complex): Complex {
    return new Complex(
      this.re * other.re - this.im * other.im,
      this.re * other.im + this.im * other.re
    );
  }

  div(other: Complex): Complex {
    const denom = other.re * other.re + other.im * other.im;
    if (denom === 0) return new Complex(Infinity, Infinity);
    return new Complex(
      (this.re * other.re + this.im * other.im) / denom,
      (this.im * other.re - this.re * other.im) / denom
    );
  }

  // ─── Transcendental Functions ──────────────────────────────

  sin(): Complex {
    return new Complex(
      Math.sin(this.re) * Math.cosh(this.im),
      Math.cos(this.re) * Math.sinh(this.im)
    );
  }

  cos(): Complex {
    return new Complex(
      Math.cos(this.re) * Math.cosh(this.im),
      -Math.sin(this.re) * Math.sinh(this.im)
    );
  }

  tan(): Complex {
    return this.sin().div(this.cos());
  }

  exp(): Complex {
    const ea = Math.exp(this.re);
    return new Complex(ea * Math.cos(this.im), ea * Math.sin(this.im));
  }

  log(): Complex {
    return new Complex(
      Math.log(this.abs()),
      this.arg()
    );
  }

  sqrt(): Complex {
    const r = this.abs();
    const theta = this.arg();
    return Complex.fromPolar(Math.sqrt(r), theta / 2);
  }

  pow(exponent: Complex): Complex {
    if (this.re === 0 && this.im === 0) return new Complex(0, 0);
    // z^w = exp(w * log(z))
    return this.log().mul(exponent).exp();
  }

  powReal(n: number): Complex {
    const r = this.abs();
    const theta = this.arg();
    return Complex.fromPolar(Math.pow(r, n), theta * n);
  }

  // ─── Utilities ─────────────────────────────────────────────

  abs(): number {
    return Math.sqrt(this.re * this.re + this.im * this.im);
  }

  abs2(): number {
    return this.re * this.re + this.im * this.im;
  }

  arg(): number {
    return Math.atan2(this.im, this.re);
  }

  conjugate(): Complex {
    return new Complex(this.re, -this.im);
  }

  neg(): Complex {
    return new Complex(-this.re, -this.im);
  }

  toString(): string {
    if (this.im === 0) return `${this.re}`;
    if (this.re === 0) return `${this.im}i`;
    const sign = this.im >= 0 ? '+' : '-';
    return `${this.re}${sign}${Math.abs(this.im)}i`;
  }
}
