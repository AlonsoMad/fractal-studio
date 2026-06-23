import { Parser } from '../parser/Parser.ts';
import { WGSLCodegen } from '../codegen/WGSLCodegen.ts';
import { differentiate, simplify } from '../parser/Differentiator.ts';
import type { FormulaCompilationResult, FractalMode, ASTNode } from '../../types/index.ts';

/**
 * Orchestrates the full pipeline: formula text → parsed AST → WGSL shader code.
 */
export class FormulaEngine {
  private parser = new Parser();

  /**
   * Compile a formula string into WGSL code.
   */
  compile(formulaText: string, mode: FractalMode = 'escape_time'): FormulaCompilationResult {
    const { ast, errors, parameters } = this.parser.parse(formulaText);

    if (!ast || errors.length > 0) {
      return {
        wgslCode: '',
        parameters: parameters.map(p => ({
          name: p,
          defaultValue: 0.5,
          min: -2.0,
          max: 2.0,
          step: 0.01,
        })),
        errors,
        ast: null,
      };
    }

    const codegen = new WGSLCodegen(parameters);
    let wgslCode: string;

    if (mode === 'newton') {
      wgslCode = this.compileNewton(ast, parameters, codegen);
    } else {
      wgslCode = codegen.generateFunction(ast, 'user_formula');
    }

    return {
      wgslCode,
      parameters: parameters.map(p => ({
        name: p,
        defaultValue: 0.5,
        min: -2.0,
        max: 2.0,
        step: 0.01,
      })),
      errors: [],
      ast,
    };
  }

  /**
   * Compile for Newton fractal mode.
   * Generates: z_next = z - g(z) / g'(z)
   */
  private compileNewton(ast: ASTNode, params: string[], codegen: WGSLCodegen): string {
    // Generate g(z) function
    const gCode = codegen.generateFunction(ast, 'newton_g');

    // Differentiate symbolically
    const dAst = simplify(differentiate(ast, 'z'));
    const dgCodegen = new WGSLCodegen(params);
    const dgCode = dgCodegen.generateFunction(dAst, 'newton_dg');

    // Generate the Newton iteration function
    const paramArgs = params.length > 0
      ? ', ' + params.map(p => `param_${p}: f32`).join(', ')
      : '';
    const paramFwd = params.length > 0
      ? ', ' + params.map(p => `param_${p}`).join(', ')
      : '';

    const newtonFn = `
${gCode}

${dgCode}

fn user_formula(z: vec2<f32>, c: vec2<f32>${paramArgs}) -> vec2<f32> {
    let gz = newton_g(z, c${paramFwd});
    let dgz = newton_dg(z, c${paramFwd});
    return complex_sub(z, complex_div(gz, dgz));
}`;

    return newtonFn;
  }
}
