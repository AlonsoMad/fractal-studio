// ════════════════════════════════════════════════════════════════════
// Complex number arithmetic library for WGSL
// Convention: vec2<f32> where .x = real, .y = imaginary
// ════════════════════════════════════════════════════════════════════

// ─── Basic Arithmetic ────────────────────────────────────────────

fn complex_add(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return a + b;
}

fn complex_sub(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return a - b;
}

fn complex_mul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(
        a.x * b.x - a.y * b.y,
        a.x * b.y + a.y * b.x
    );
}

fn complex_sq(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(
        z.x * z.x - z.y * z.y,
        2.0 * z.x * z.y
    );
}

fn complex_div(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    let denom = b.x * b.x + b.y * b.y;
    if (denom < 1e-30) {
        return vec2<f32>(1e10, 1e10);
    }
    return vec2<f32>(
        (a.x * b.x + a.y * b.y) / denom,
        (a.y * b.x - a.x * b.y) / denom
    );
}

fn complex_conj(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(z.x, -z.y);
}

// ─── Magnitude & Argument ────────────────────────────────────────

fn complex_abs(z: vec2<f32>) -> f32 {
    return length(z);
}

fn complex_abs2(z: vec2<f32>) -> f32 {
    return dot(z, z);
}

fn complex_arg(z: vec2<f32>) -> f32 {
    return atan2(z.y, z.x);
}

// ─── Exponential & Logarithmic ───────────────────────────────────

fn complex_exp(z: vec2<f32>) -> vec2<f32> {
    let ea = exp(z.x);
    return vec2<f32>(ea * cos(z.y), ea * sin(z.y));
}

fn complex_log(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(log(length(z)), atan2(z.y, z.x));
}

// ─── Trigonometric ───────────────────────────────────────────────

fn complex_sin(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(
        sin(z.x) * cosh(z.y),
        cos(z.x) * sinh(z.y)
    );
}

fn complex_cos(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(
        cos(z.x) * cosh(z.y),
        -sin(z.x) * sinh(z.y)
    );
}

fn complex_tan(z: vec2<f32>) -> vec2<f32> {
    return complex_div(complex_sin(z), complex_cos(z));
}

// ─── Hyperbolic ──────────────────────────────────────────────────

fn complex_sinh(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(
        sinh(z.x) * cos(z.y),
        cosh(z.x) * sin(z.y)
    );
}

fn complex_cosh(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(
        cosh(z.x) * cos(z.y),
        sinh(z.x) * sin(z.y)
    );
}

fn complex_tanh(z: vec2<f32>) -> vec2<f32> {
    return complex_div(complex_sinh(z), complex_cosh(z));
}

// ─── Power & Root ────────────────────────────────────────────────

fn complex_sqrt(z: vec2<f32>) -> vec2<f32> {
    let r = length(z);
    let theta = atan2(z.y, z.x);
    let sr = sqrt(r);
    return vec2<f32>(sr * cos(theta * 0.5), sr * sin(theta * 0.5));
}

fn complex_pow_real(z: vec2<f32>, n: f32) -> vec2<f32> {
    let r = length(z);
    if (r < 1e-30) {
        return vec2<f32>(0.0, 0.0);
    }
    let theta = atan2(z.y, z.x);
    let rn = pow(r, n);
    return vec2<f32>(rn * cos(n * theta), rn * sin(n * theta));
}

fn complex_pow(base: vec2<f32>, exponent: vec2<f32>) -> vec2<f32> {
    if (base.x == 0.0 && base.y == 0.0) {
        return vec2<f32>(0.0, 0.0);
    }
    return complex_exp(complex_mul(exponent, complex_log(base)));
}

fn complex_pow_int(z: vec2<f32>, n: i32) -> vec2<f32> {
    var result = vec2<f32>(1.0, 0.0);
    var base = z;
    var exp_val = n;
    if (exp_val < 0) {
        base = complex_div(vec2<f32>(1.0, 0.0), z);
        exp_val = -exp_val;
    }
    for (var i = 0; i < exp_val; i = i + 1) {
        result = complex_mul(result, base);
    }
    return result;
}
