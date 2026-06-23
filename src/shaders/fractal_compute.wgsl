// ════════════════════════════════════════════════════════════════════
// Fractal Compute Shader Template
// Injected sections: complex_math library, user_formula function
// ════════════════════════════════════════════════════════════════════

// __COMPLEX_MATH_LIBRARY__

// __USER_FORMULA__

struct Uniforms {
    center: vec2<f32>,       // offset 0
    zoom: f32,               // offset 8
    aspect: f32,             // offset 12
    max_iter: u32,           // offset 16
    escape_radius: f32,      // offset 20
    julia_mode: u32,         // offset 24
    julia_c: vec2<f32>,      // offset 32  (8-byte aligned)
    color_mode: u32,         // offset 40
    width: u32,              // offset 44
    height: u32,             // offset 48
    newton_mode: u32,        // offset 52
    // __USER_PARAM_UNIFORMS__
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var gradient_tex: texture_1d<f32>;

// Orbit trap parameters (for orbit_trap mode)
const TRAP_CENTER: vec2<f32> = vec2<f32>(0.0, 0.0);
const TRAP_RADIUS: f32 = 1.0;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let pixel = vec2<u32>(global_id.x, global_id.y);
    if (pixel.x >= u.width || pixel.y >= u.height) {
        return;
    }

    // ─── Map pixel to complex plane ──────────────────────
    let uv = vec2<f32>(
        (f32(pixel.x) / f32(u.width) - 0.5) * u.aspect,
        (f32(pixel.y) / f32(u.height) - 0.5) * -1.0   // flip Y
    );
    let coord = uv * u.zoom + u.center;

    // ─── Set up z and c based on mode ────────────────────
    var z: vec2<f32>;
    var c: vec2<f32>;

    // Newton mode always starts z at the pixel coordinate (not 0)
    if (u.newton_mode == 1u || u.julia_mode == 1u) {
        z = coord;
        c = u.julia_c;
    } else {
        z = vec2<f32>(0.0, 0.0);
        c = coord;
    }

    // ─── Iteration loop ─────────────────────────────────
    var iter: u32 = 0u;
    var min_trap_dist: f32 = 1e20;
    let escape2 = u.escape_radius * u.escape_radius;
    var z_prev: vec2<f32> = z;

    for (var i: u32 = 0u; i < u.max_iter; i = i + 1u) {
        z_prev = z;
        z = user_formula(z, c);

        let z_mag2 = dot(z, z);

        // Orbit trap tracking
        if (u.color_mode == 2u) {
            let trap_dist = length(z - TRAP_CENTER);
            min_trap_dist = min(min_trap_dist, trap_dist);
        }

        // Escape check
        if (z_mag2 > escape2) {
            break;
        }

        // Newton convergence: stop when step becomes negligible
        if (u.newton_mode == 1u) {
            let dz = z - z_prev;
            if (dot(dz, dz) < 1e-10) { break; }
        }

        iter = i + 1u;
    }

    // ─── Coloring ───────────────────────────────────────
    var color: vec4<f32>;

    // Newton fractal coloring — honours color_mode like other fractals
    if (u.newton_mode == 1u) {
        if (iter >= u.max_iter) {
            // Did not converge: fractal boundary — always black
            color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
        } else {
            let t_conv = f32(iter) / f32(u.max_iter);
            switch (u.color_mode) {
                // Mode 0: convergence speed mapped to gradient
                case 0u: {
                    color = sample_gradient(t_conv);
                }
                // Mode 1: cycling gradient (smooth look)
                case 1u: {
                    color = sample_gradient(fract(t_conv * 4.0));
                }
                // Mode 2: orbit trap — same logic as escape-time fractals
                case 2u: {
                    let t = clamp(min_trap_dist / TRAP_RADIUS, 0.0, 1.0);
                    color = sample_gradient(1.0 - t);
                }
                // Mode 3: domain coloring — hue = basin (root angle), brightness = convergence speed
                case 3u: {
                    let hue = (complex_arg(z) + 3.14159265) / (2.0 * 3.14159265);
                    let brightness = 0.4 + 0.6 * (1.0 - t_conv);
                    color = hsv_to_rgb(hue, 0.9, brightness);
                }
                default: {
                    color = sample_gradient(t_conv);
                }
            }
        }
    } else if (iter >= u.max_iter) {
        // Inside the set — black
        if (u.color_mode == 3u) {
            // Domain coloring for interior
            let hue = (complex_arg(z) + 3.14159265) / (2.0 * 3.14159265);
            let brightness = 1.0 - 1.0 / (1.0 + complex_abs(z) * 0.1);
            color = hsv_to_rgb(hue, 0.8, brightness * 0.5);
        } else {
            color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
        }
    } else {
        switch (u.color_mode) {
            // Mode 0: Simple escape time
            case 0u: {
                let t = f32(iter) / f32(u.max_iter);
                color = sample_gradient(t);
            }
            // Mode 1: Smooth coloring
            case 1u: {
                let z_mag = length(z);
                let smooth_iter = f32(iter) - log2(log2(z_mag)) + 4.0;
                let t = smooth_iter / f32(u.max_iter);
                color = sample_gradient(fract(t * 4.0));
            }
            // Mode 2: Orbit trap
            case 2u: {
                let t = clamp(min_trap_dist / TRAP_RADIUS, 0.0, 1.0);
                color = sample_gradient(1.0 - t);
            }
            // Mode 3: Domain coloring
            case 3u: {
                let hue = (complex_arg(z) + 3.14159265) / (2.0 * 3.14159265);
                let brightness = 1.0 - 1.0 / (1.0 + complex_abs(z) * 0.1);
                let rings = 0.5 + 0.5 * sin(log2(length(z)) * 6.28318);
                color = hsv_to_rgb(hue, 0.7, brightness * (0.5 + 0.5 * rings));
            }
            default: {
                let t = f32(iter) / f32(u.max_iter);
                color = sample_gradient(t);
            }
        }
    }

    textureStore(output_tex, vec2<i32>(pixel), color);
}

// ─── Color Helpers ──────────────────────────────────────────

fn sample_gradient(t: f32) -> vec4<f32> {
    let tc = clamp(t, 0.0, 1.0);
    let dim = textureDimensions(gradient_tex);
    let idx = u32(tc * f32(dim - 1u));
    return textureLoad(gradient_tex, idx, 0);
}

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> vec4<f32> {
    let c = v * s;
    let x = c * (1.0 - abs(fract(h * 6.0) * 2.0 - 1.0));
    let m = v - c;
    var rgb: vec3<f32>;
    let hi = u32(h * 6.0) % 6u;
    switch (hi) {
        case 0u: { rgb = vec3<f32>(c, x, 0.0); }
        case 1u: { rgb = vec3<f32>(x, c, 0.0); }
        case 2u: { rgb = vec3<f32>(0.0, c, x); }
        case 3u: { rgb = vec3<f32>(0.0, x, c); }
        case 4u: { rgb = vec3<f32>(x, 0.0, c); }
        default: { rgb = vec3<f32>(c, 0.0, x); }
    }
    return vec4<f32>(rgb + m, 1.0);
}
