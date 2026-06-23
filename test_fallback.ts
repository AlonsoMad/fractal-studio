import { Parser } from './src/engine/parser/Parser.ts';
import { ASTNode } from './src/types/index.ts';
import { Complex } from './src/engine/complex/Complex.ts';
import { evalAST, EvalContext } from './src/engine/ambient/ASTEvaluator.ts';

const p = new Parser();
const { ast } = p.parse("z^2 + c");

function createInterpretedFallback(ast: ASTNode) {
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

const fallbackFn = createInterpretedFallback(ast);
console.log(fallbackFn(0, 0, 0.5, 0.5, {}, 10, 4));
