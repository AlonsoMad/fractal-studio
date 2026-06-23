import type { ASTNode } from '../../types/index.ts';

/**
 * Transpiles an AST node into WGSL code that operates on vec2<f32> complex numbers.
 * 
 * Convention:
 *   vec2<f32>.x = real part
 *   vec2<f32>.y = imaginary part
 */
export class WGSLCodegen {
  private paramNames: string[] = [];

  constructor(params?: string[]) {
    this.paramNames = params ?? [];
  }

  /**
   * Generate a complete WGSL expression from an AST node.
   */
  generate(node: ASTNode): string {
    return this.visit(node);
  }

  /**
   * Generate a full WGSL function that evaluates the formula.
   */
  generateFunction(node: ASTNode, fnName: string = 'user_formula'): string {
    const body = this.visit(node);
    const paramArgs = this.paramNames.length > 0
      ? ', ' + this.paramNames.map(p => `param_${p}: f32`).join(', ')
      : '';

    return `fn ${fnName}(z: vec2<f32>, c: vec2<f32>${paramArgs}) -> vec2<f32> {
    return ${body};
}`;
  }

  private visit(node: ASTNode): string {
    switch (node.type) {
      case 'NumberLiteral':
        return this.visitNumber(node);
      case 'Variable':
        return node.name; // 'z' or 'c'
      case 'Parameter':
        return `vec2<f32>(param_${node.name}, 0.0)`;
      case 'Constant':
        return this.visitConstant(node);
      case 'BinaryOp':
        return this.visitBinaryOp(node);
      case 'UnaryOp':
        return this.visitUnaryOp(node);
      case 'FunctionCall':
        return this.visitFunctionCall(node);
    }
  }

  private visitNumber(node: ASTNode & { type: 'NumberLiteral' }): string {
    const val = this.formatFloat(node.value);
    return `vec2<f32>(${val}, 0.0)`;
  }

  private visitConstant(node: ASTNode & { type: 'Constant' }): string {
    switch (node.name) {
      case 'pi': return 'vec2<f32>(3.14159265358979, 0.0)';
      case 'e':  return 'vec2<f32>(2.71828182845905, 0.0)';
      case 'i':  return 'vec2<f32>(0.0, 1.0)';
    }
  }

  private visitBinaryOp(node: ASTNode & { type: 'BinaryOp' }): string {
    const left = this.visit(node.left);
    const right = this.visit(node.right);

    switch (node.op) {
      case '+': return `complex_add(${left}, ${right})`;
      case '-': return `complex_sub(${left}, ${right})`;
      case '*': return this.visitMultiply(node.left, node.right, left, right);
      case '/': return `complex_div(${left}, ${right})`;
      case '^': return this.visitPower(node.left, node.right, left, right);
    }
  }

  /**
   * Optimize multiplication: if one operand is a real scalar, use scalar mul.
   */
  private visitMultiply(leftNode: ASTNode, rightNode: ASTNode, left: string, right: string): string {
    if (this.isRealScalar(leftNode)) {
      const scalar = this.visitAsScalar(leftNode);
      return `(${right} * ${scalar})`;
    }
    if (this.isRealScalar(rightNode)) {
      const scalar = this.visitAsScalar(rightNode);
      return `(${left} * ${scalar})`;
    }
    return `complex_mul(${left}, ${right})`;
  }

  /**
   * Optimize power: integer exponents use repeated multiplication.
   */
  private visitPower(baseNode: ASTNode, expNode: ASTNode, base: string, exp: string): string {
    // Integer power optimization
    if (expNode.type === 'NumberLiteral' && Number.isInteger(expNode.value) && expNode.value >= 2 && expNode.value <= 8) {
      const n = expNode.value;
      if (n === 2) return `complex_sq(${base})`;
      if (n === 3) return `complex_mul(complex_sq(${base}), ${base})`;
      if (n === 4) return `complex_sq(complex_sq(${base}))`;
      // General integer: use pow_int helper
      return `complex_pow_int(${base}, ${n})`;
    }

    // Real exponent
    if (expNode.type === 'NumberLiteral') {
      const expVal = this.formatFloat(expNode.value);
      return `complex_pow_real(${base}, ${expVal})`;
    }

    // General complex power
    return `complex_pow(${base}, ${exp})`;
  }

  private visitUnaryOp(node: ASTNode & { type: 'UnaryOp' }): string {
    const operand = this.visit(node.operand);
    return `(-${operand})`;
  }

  private visitFunctionCall(node: ASTNode & { type: 'FunctionCall' }): string {
    const args = node.args.map(a => this.visit(a));

    switch (node.name) {
      case 'sin':  return `complex_sin(${args[0]})`;
      case 'cos':  return `complex_cos(${args[0]})`;
      case 'tan':  return `complex_tan(${args[0]})`;
      case 'exp':  return `complex_exp(${args[0]})`;
      case 'log':  return `complex_log(${args[0]})`;
      case 'sqrt': return `complex_sqrt(${args[0]})`;
      case 'abs':  return `vec2<f32>(complex_abs(${args[0]}), 0.0)`;
      case 'conj': return `complex_conj(${args[0]})`;
      case 'arg':  return `vec2<f32>(complex_arg(${args[0]}), 0.0)`;
      case 'sinh': return `complex_sinh(${args[0]})`;
      case 'cosh': return `complex_cosh(${args[0]})`;
      case 'tanh': return `complex_tanh(${args[0]})`;
      default:
        return `complex_${node.name}(${args.join(', ')})`;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  private isRealScalar(node: ASTNode): boolean {
    return (
      node.type === 'NumberLiteral' ||
      node.type === 'Parameter' ||
      (node.type === 'Constant' && node.name !== 'i')
    );
  }

  private visitAsScalar(node: ASTNode): string {
    if (node.type === 'NumberLiteral') {
      return this.formatFloat(node.value);
    }
    if (node.type === 'Parameter') {
      return `param_${node.name}`;
    }
    if (node.type === 'Constant') {
      if (node.name === 'pi') return '3.14159265358979';
      if (node.name === 'e') return '2.71828182845905';
    }
    return '1.0';
  }

  private formatFloat(n: number): string {
    const s = n.toString();
    if (s.includes('.') || s.includes('e') || s.includes('E')) {
      return s;
    }
    return s + '.0';
  }
}
