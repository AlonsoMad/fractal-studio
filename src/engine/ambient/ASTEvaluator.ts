// ════════════════════════════════════════════════════════════════════
// ASTEvaluator — CPU-side AST interpreter for fractal formula evaluation
//
// Provides two modes:
//  1. JIT-compiled (preferred): compileFormula() walks the AST ONCE at
//     preset-load time and emits a raw JS function operating purely on
//     primitive `re`/`im` Number variables — zero object allocations per
//     frame. Use this for the contour-probe hot path.
//  2. Interpreted Fallback: If `new Function()` is blocked by a strict
//     CSP (e.g. Firefox strict mode/extensions), it gracefully falls back
//     to a tree-walking interpreter.
// ════════════════════════════════════════════════════════════════════

import type { ASTNode } from '../../types/index.ts';
import { Complex } from '../complex/Complex.ts';

// ─── Constants ──────────────────────────────────────────────────

const COMPLEX_PI = new Complex(Math.PI, 0);
const COMPLEX_E = new Complex(Math.E, 0);
const COMPLEX_I = new Complex(0, 1);

// ─── JIT compiler types ──────────────────────────────────────────

/**
 * A JIT-compiled fractal iteration function.
 * Receives the starting point (zRe, zIm), the constant (cRe, cIm),
 * a params object, and iteration limits.
 * Returns the iteration count at which the orbit escaped, or maxIter.
 */
export type CompiledFormula = (
  zRe: number, zIm: number,
  cRe: number, cIm: number,
  params: Record<string, number>,
  maxIter: number,
  escapeR2: number,
) => number;

// ─── Code generator ─────────────────────────────────────────────

let _varCounter = 0;
/** Allocate a fresh variable name prefix (e.g. "v3") for this sub-expression. */
function freshVar(): string {
  return `v${_varCounter++}`;
}

/**
 * Walk the AST and emit JS source lines that compute a complex value.
 * Returns { lines, re, im } where `lines` are the statements to append
 * and `re` / `im` are the variable names holding the real and imaginary parts.
 */
function emitNode(
  node: ASTNode,
  lines: string[],
): { re: string; im: string } {

  switch (node.type) {
    case 'NumberLiteral': {
      const v = freshVar();
      lines.push(`const ${v}Re = ${node.value};`);
      lines.push(`const ${v}Im = 0;`);
      return { re: `${v}Re`, im: `${v}Im` };
    }

    case 'Variable': {
      // z is mutable (updated each iteration), c is a parameter
      if (node.name === 'z') return { re: 'zRe', im: 'zIm' };
      return { re: 'cRe', im: 'cIm' };
    }

    case 'Parameter': {
      const v = freshVar();
      lines.push(`const ${v}Re = (params["${node.name}"] ?? 0);`);
      lines.push(`const ${v}Im = 0;`);
      return { re: `${v}Re`, im: `${v}Im` };
    }

    case 'Constant': {
      const v = freshVar();
      const val = node.name === 'pi' ? Math.PI
                : node.name === 'e'  ? Math.E
                : 0; // 'i' is imaginary — real=0, im=1
      const imVal = node.name === 'i' ? 1 : 0;
      lines.push(`const ${v}Re = ${val};`);
      lines.push(`const ${v}Im = ${imVal};`);
      return { re: `${v}Re`, im: `${v}Im` };
    }

    case 'UnaryOp': {
      const { re: aRe, im: aIm } = emitNode(node.operand, lines);
      const v = freshVar();
      lines.push(`const ${v}Re = -${aRe};`);
      lines.push(`const ${v}Im = -${aIm};`);
      return { re: `${v}Re`, im: `${v}Im` };
    }

    case 'BinaryOp': {
      const L = emitNode(node.left, lines);
      const R = emitNode(node.right, lines);
      const v = freshVar();
      switch (node.op) {
        case '+':
          lines.push(`const ${v}Re = ${L.re} + ${R.re};`);
          lines.push(`const ${v}Im = ${L.im} + ${R.im};`);
          break;
        case '-':
          lines.push(`const ${v}Re = ${L.re} - ${R.re};`);
          lines.push(`const ${v}Im = ${L.im} - ${R.im};`);
          break;
        case '*':
          lines.push(`const ${v}Re = ${L.re} * ${R.re} - ${L.im} * ${R.im};`);
          lines.push(`const ${v}Im = ${L.re} * ${R.im} + ${L.im} * ${R.re};`);
          break;
        case '/': {
          const dv = freshVar();
          lines.push(`const ${dv}D = ${R.re} * ${R.re} + ${R.im} * ${R.im};`);
          lines.push(`const ${v}Re = ${dv}D === 0 ? Infinity : (${L.re} * ${R.re} + ${L.im} * ${R.im}) / ${dv}D;`);
          lines.push(`const ${v}Im = ${dv}D === 0 ? Infinity : (${L.im} * ${R.re} - ${L.re} * ${R.im}) / ${dv}D;`);
          break;
        }
        case '^': {
          // z^w = exp(w * log(z))   — general complex power
          // log(z): r = sqrt(re²+im²), logRe = log(r), logIm = atan2(im,re)
          const lv = freshVar();
          lines.push(`const ${lv}R = Math.sqrt(${L.re} * ${L.re} + ${L.im} * ${L.im});`);
          lines.push(`const ${lv}LRe = ${lv}R === 0 ? -Infinity : Math.log(${lv}R);`);
          lines.push(`const ${lv}LIm = Math.atan2(${L.im}, ${L.re});`);
          // w * log(z):
          const mv = freshVar();
          lines.push(`const ${mv}Re = ${R.re} * ${lv}LRe - ${R.im} * ${lv}LIm;`);
          lines.push(`const ${mv}Im = ${R.re} * ${lv}LIm + ${R.im} * ${lv}LRe;`);
          // exp(w*log(z)):
          const ev = freshVar();
          lines.push(`const ${ev}E = Math.exp(${mv}Re);`);
          lines.push(`const ${v}Re = ${ev}E * Math.cos(${mv}Im);`);
          lines.push(`const ${v}Im = ${ev}E * Math.sin(${mv}Im);`);
          break;
        }
      }
      return { re: `${v}Re`, im: `${v}Im` };
    }

    case 'FunctionCall': {
      const args = node.args.map(a => emitNode(a, lines));
      const a0 = args[0] ?? { re: '0', im: '0' };
      const v = freshVar();

      switch (node.name) {
        case 'sin':
          lines.push(`const ${v}Re = Math.sin(${a0.re}) * Math.cosh(${a0.im});`);
          lines.push(`const ${v}Im = Math.cos(${a0.re}) * Math.sinh(${a0.im});`);
          break;
        case 'cos':
          lines.push(`const ${v}Re = Math.cos(${a0.re}) * Math.cosh(${a0.im});`);
          lines.push(`const ${v}Im = -Math.sin(${a0.re}) * Math.sinh(${a0.im});`);
          break;
        case 'tan': {
          const sv = freshVar(), cv2 = freshVar(), dv = freshVar();
          lines.push(`const ${sv}Re = Math.sin(${a0.re}) * Math.cosh(${a0.im});`);
          lines.push(`const ${sv}Im = Math.cos(${a0.re}) * Math.sinh(${a0.im});`);
          lines.push(`const ${cv2}Re = Math.cos(${a0.re}) * Math.cosh(${a0.im});`);
          lines.push(`const ${cv2}Im = -Math.sin(${a0.re}) * Math.sinh(${a0.im});`);
          lines.push(`const ${dv}D = ${cv2}Re * ${cv2}Re + ${cv2}Im * ${cv2}Im;`);
          lines.push(`const ${v}Re = ${dv}D === 0 ? Infinity : (${sv}Re * ${cv2}Re + ${sv}Im * ${cv2}Im) / ${dv}D;`);
          lines.push(`const ${v}Im = ${dv}D === 0 ? Infinity : (${sv}Im * ${cv2}Re - ${sv}Re * ${cv2}Im) / ${dv}D;`);
          break;
        }
        case 'exp': {
          const ev = freshVar();
          lines.push(`const ${ev}E = Math.exp(${a0.re});`);
          lines.push(`const ${v}Re = ${ev}E * Math.cos(${a0.im});`);
          lines.push(`const ${v}Im = ${ev}E * Math.sin(${a0.im});`);
          break;
        }
        case 'log': {
          const rv = freshVar();
          lines.push(`const ${rv}R = Math.sqrt(${a0.re} * ${a0.re} + ${a0.im} * ${a0.im});`);
          lines.push(`const ${v}Re = ${rv}R === 0 ? -Infinity : Math.log(${rv}R);`);
          lines.push(`const ${v}Im = Math.atan2(${a0.im}, ${a0.re});`);
          break;
        }
        case 'sqrt': {
          const rv = freshVar();
          lines.push(`const ${rv}R = Math.sqrt(${a0.re} * ${a0.re} + ${a0.im} * ${a0.im});`);
          lines.push(`const ${rv}Sq = Math.sqrt(${rv}R);`);
          lines.push(`const ${rv}Th = Math.atan2(${a0.im}, ${a0.re});`);
          lines.push(`const ${v}Re = ${rv}Sq * Math.cos(${rv}Th / 2);`);
          lines.push(`const ${v}Im = ${rv}Sq * Math.sin(${rv}Th / 2);`);
          break;
        }
        case 'abs': {
          lines.push(`const ${v}Re = Math.sqrt(${a0.re} * ${a0.re} + ${a0.im} * ${a0.im});`);
          lines.push(`const ${v}Im = 0;`);
          break;
        }
        case 'conj':
          lines.push(`const ${v}Re = ${a0.re};`);
          lines.push(`const ${v}Im = -(${a0.im});`);
          break;
        case 'arg':
          lines.push(`const ${v}Re = Math.atan2(${a0.im}, ${a0.re});`);
          lines.push(`const ${v}Im = 0;`);
          break;
        case 'sinh':
          lines.push(`const ${v}Re = Math.sinh(${a0.re}) * Math.cos(${a0.im});`);
          lines.push(`const ${v}Im = Math.cosh(${a0.re}) * Math.sin(${a0.im});`);
          break;
        case 'cosh':
          lines.push(`const ${v}Re = Math.cosh(${a0.re}) * Math.cos(${a0.im});`);
          lines.push(`const ${v}Im = Math.sinh(${a0.re}) * Math.sin(${a0.im});`);
          break;
        case 'tanh': {
          // tanh = sinh/cosh
          const shv = freshVar(), chv = freshVar(), dv = freshVar();
          lines.push(`const ${shv}Re = Math.sinh(${a0.re}) * Math.cos(${a0.im});`);
          lines.push(`const ${shv}Im = Math.cosh(${a0.re}) * Math.sin(${a0.im});`);
          lines.push(`const ${chv}Re = Math.cosh(${a0.re}) * Math.cos(${a0.im});`);
          lines.push(`const ${chv}Im = Math.sinh(${a0.re}) * Math.sin(${a0.im});`);
          lines.push(`const ${dv}D = ${chv}Re * ${chv}Re + ${chv}Im * ${chv}Im;`);
          lines.push(`const ${v}Re = ${dv}D === 0 ? Infinity : (${shv}Re * ${chv}Re + ${shv}Im * ${chv}Im) / ${dv}D;`);
          lines.push(`const ${v}Im = ${dv}D === 0 ? Infinity : (${shv}Im * ${chv}Re - ${shv}Re * ${chv}Im) / ${dv}D;`);
          break;
        }
        default:
          // Unknown function — identity passthrough
          lines.push(`const ${v}Re = ${a0.re};`);
          lines.push(`const ${v}Im = ${a0.im};`);
          break;
      }
      return { re: `${v}Re`, im: `${v}Im` };
    }
  }
}

/**
 * Compile an AST into a zero-allocation iteration-counting function.
 * Call once per preset change; cache the result and reuse every frame.
 *
 * The returned function is ~5-10x faster than the interpreted path because:
 *  - All intermediate values are local primitive `number` variables.
 *  - No heap allocation occurs during iteration.
 *  - V8 can fully JIT the inner loop to machine code.
 */
export function compileFormula(ast: ASTNode): CompiledFormula {
  _varCounter = 0; // reset per compilation

  const bodyLines: string[] = [];
  bodyLines.push('let zRe = startZRe;');
  bodyLines.push('let zIm = startZIm;');
  bodyLines.push('for (let i = 0; i < maxIter; i++) {');

  const iterLines: string[] = [];
  const result = emitNode(ast, iterLines);

  // Indent iteration body
  for (const l of iterLines) bodyLines.push('  ' + l);

  // Update z for next iteration
  bodyLines.push(`  zRe = ${result.re};`);
  bodyLines.push(`  zIm = ${result.im};`);

  // Escape / guard checks
  bodyLines.push('  if (!isFinite(zRe) || !isFinite(zIm)) return i;');
  bodyLines.push('  if (zRe * zRe + zIm * zIm > escapeR2) return i;');
  bodyLines.push('}');
  bodyLines.push('return maxIter;');

  const src = bodyLines.join('\n');

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'startZRe', 'startZIm',
      'cRe', 'cIm',
      'params',
      'maxIter',
      'escapeR2',
      src,
    ) as CompiledFormula;
    console.debug('[ASTEvaluator] Successfully JIT-compiled CPU formula function (fast path).');
    return fn;
  } catch (err) {
    console.warn('[ASTEvaluator] JIT Compiler blocked (e.g. strict CSP / extension). Falling back to tree-walking interpreter (safe path).', err);
    return createInterpretedFallback(ast);
  }
}

// ─── Interpreted Fallback ───────────────────────────────────────

export interface EvalContext {
  z: Complex;
  c: Complex;
  params: Record<string, number>;
}

export function evalAST(node: ASTNode, ctx: EvalContext): Complex {
  switch (node.type) {
    case 'NumberLiteral':
      return new Complex(node.value, 0);

    case 'Variable':
      return node.name === 'z' ? ctx.z.clone() : ctx.c.clone();

    case 'Parameter': {
      const val = ctx.params[node.name] ?? 0;
      return new Complex(val, 0);
    }

    case 'Constant':
      switch (node.name) {
        case 'pi': return COMPLEX_PI.clone();
        case 'e':  return COMPLEX_E.clone();
        case 'i':  return COMPLEX_I.clone();
      }
      return new Complex(0, 0);

    case 'BinaryOp': {
      const left = evalAST(node.left, ctx);
      const right = evalAST(node.right, ctx);
      switch (node.op) {
        case '+': return left.add(right);
        case '-': return left.sub(right);
        case '*': return left.mul(right);
        case '/': return left.div(right);
        case '^': return left.pow(right);
      }
      return new Complex(0, 0);
    }

    case 'UnaryOp':
      return evalAST(node.operand, ctx).neg();

    case 'FunctionCall': {
      const args = node.args.map(a => evalAST(a, ctx));
      return evalFunction(node.name, args);
    }
  }
}

function evalFunction(name: string, args: Complex[]): Complex {
  const z = args[0] ?? new Complex(0, 0);
  switch (name) {
    case 'sin':  return z.sin();
    case 'cos':  return z.cos();
    case 'tan':  return z.tan();
    case 'exp':  return z.exp();
    case 'log':  return z.log();
    case 'sqrt': return z.sqrt();
    case 'abs':  return new Complex(z.abs(), 0);
    case 'conj': return z.conjugate();
    case 'arg':  return new Complex(z.arg(), 0);
    case 'sinh': return complexSinh(z);
    case 'cosh': return complexCosh(z);
    case 'tanh': return complexSinh(z).div(complexCosh(z));
    default:     return z;
  }
}

function complexSinh(z: Complex): Complex {
  return new Complex(Math.sinh(z.re) * Math.cos(z.im), Math.cosh(z.re) * Math.sin(z.im));
}

function complexCosh(z: Complex): Complex {
  return new Complex(Math.cosh(z.re) * Math.cos(z.im), Math.sinh(z.re) * Math.sin(z.im));
}

function createInterpretedFallback(ast: ASTNode): CompiledFormula {
  return (
    startZRe: number, startZIm: number,
    cRe: number, cIm: number,
    params: Record<string, number>,
    maxIter: number,
    escapeR2: number
  ) => {
    const ctx: EvalContext = {
      z: new Complex(startZRe, startZIm),
      c: new Complex(cRe, cIm),
      params,
    };

    for (let i = 0; i < maxIter; i++) {
      ctx.z = evalAST(ast, ctx);
      if (!isFinite(ctx.z.re) || !isFinite(ctx.z.im)) return i;
      if (ctx.z.abs2() > escapeR2) return i;
    }
    return maxIter;
  };
}

/**
 * Run an escape-time iteration using a JIT-compiled formula function.
 * Allocates ZERO objects.
 */
export function countIterationsCompiled(
  cx: number,
  cy: number,
  compiled: CompiledFormula,
  params: Record<string, number>,
  maxIter: number,
  escapeRadius: number,
  isJulia: boolean,
  juliaCRe: number,
  juliaCIm: number,
): number {
  const escapeR2 = escapeRadius * escapeRadius;
  if (isJulia) {
    return compiled(cx, cy, juliaCRe, juliaCIm, params, maxIter, escapeR2);
  } else {
    return compiled(0, 0, cx, cy, params, maxIter, escapeR2);
  }
}
