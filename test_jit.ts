import { compileFormula } from './src/engine/ambient/ASTEvaluator.ts';
import { Parser } from './src/engine/parser/Parser.ts';

const p = new Parser();
const { ast } = p.parse("z^2 + c");
const fn = compileFormula(ast);
console.log(fn.toString());
