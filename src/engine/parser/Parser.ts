import type { ASTNode, Token, ParseError } from '../../types/index.ts';
import { Lexer } from './Lexer.ts';

/**
 * Recursive descent parser for fractal formulas.
 * 
 * Grammar (EBNF):
 *   expression  = additive
 *   additive    = multiplicative (('+' | '-') multiplicative)*
 *   multiplicative = power (('*' | '/') power)*
 *   power       = unary ('^' unary)*
 *   unary       = '-' unary | postfix
 *   postfix     = primary
 *   primary     = NUMBER | VARIABLE | PARAM | CONSTANT
 *               | FUNCTION '(' expression (',' expression)* ')'
 *               | '(' expression ')'
 * 
 * Implicit multiplication: 2z = 2*z, z(z+1) = z*(z+1), 2sin(z) = 2*sin(z)
 */
export class Parser {
  private tokens: Token[] = [];
  private pos = 0;
  private errors: ParseError[] = [];
  private parameters: Set<string> = new Set();

  parse(source: string): { ast: ASTNode | null; errors: ParseError[]; parameters: string[] } {
    this.errors = [];
    this.parameters = new Set();
    this.pos = 0;

    try {
      const lexer = new Lexer(source);
      this.tokens = lexer.tokenize();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.errors.push({ message: msg, position: 0, length: source.length });
      return { ast: null, errors: this.errors, parameters: [] };
    }

    if (this.tokens.length <= 1) {
      // Only EOF
      this.errors.push({ message: 'Empty formula', position: 0, length: 1 });
      return { ast: null, errors: this.errors, parameters: [] };
    }

    try {
      const ast = this.parseExpression();

      if (this.current().type !== 'EOF') {
        const tok = this.current();
        this.errors.push({
          message: `Unexpected token '${tok.value}'`,
          position: tok.position,
          length: tok.value.length || 1,
        });
      }

      return {
        ast: this.errors.length === 0 ? ast : null,
        errors: this.errors,
        parameters: Array.from(this.parameters),
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (this.errors.length === 0) {
        this.errors.push({ message: msg, position: this.current().position, length: 1 });
      }
      return { ast: null, errors: this.errors, parameters: Array.from(this.parameters) };
    }
  }

  // ─── Token helpers ───────────────────────────────────────

  private current(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF', value: '', position: 0 };
  }

  private peek(): Token {
    return this.tokens[this.pos + 1] ?? { type: 'EOF', value: '', position: 0 };
  }

  private advance(): Token {
    const tok = this.current();
    this.pos++;
    return tok;
  }

  private expect(type: string, value?: string): Token {
    const tok = this.current();
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      const expected = value ? `'${value}'` : type;
      throw new Error(`Expected ${expected} but got '${tok.value}' at position ${tok.position}`);
    }
    return this.advance();
  }

  // ─── Grammar rules ──────────────────────────────────────

  private parseExpression(): ASTNode {
    return this.parseAdditive();
  }

  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative();

    while (this.current().type === 'OPERATOR' && (this.current().value === '+' || this.current().value === '-')) {
      const op = this.advance().value as '+' | '-';
      const right = this.parseMultiplicative();
      left = { type: 'BinaryOp', op, left, right };
    }

    return left;
  }

  private parseMultiplicative(): ASTNode {
    let left = this.parsePower();

    while (true) {
      const cur = this.current();

      // Explicit * or /
      if (cur.type === 'OPERATOR' && (cur.value === '*' || cur.value === '/')) {
        const op = this.advance().value as '*' | '/';
        const right = this.parsePower();
        left = { type: 'BinaryOp', op, left, right };
        continue;
      }

      // Implicit multiplication: 2z, 2(z+1), z(z+1), 2sin(z), etc.
      if (this.canImplicitMultiply(cur)) {
        const right = this.parsePower();
        left = { type: 'BinaryOp', op: '*', left, right };
        continue;
      }

      break;
    }

    return left;
  }

  private canImplicitMultiply(tok: Token): boolean {
    // After a value-like node, if next token is a start-of-value, it's implicit *
    return (
      tok.type === 'NUMBER' ||
      tok.type === 'VARIABLE' ||
      tok.type === 'PARAM' ||
      tok.type === 'CONSTANT' ||
      tok.type === 'FUNCTION' ||
      tok.type === 'LPAREN'
    );
  }

  private parsePower(): ASTNode {
    let base = this.parseUnary();

    // Right-associative: a^b^c = a^(b^c)
    if (this.current().type === 'OPERATOR' && this.current().value === '^') {
      this.advance();
      const exponent = this.parsePower(); // recursive for right-assoc
      base = { type: 'BinaryOp', op: '^', left: base, right: exponent };
    }

    return base;
  }

  private parseUnary(): ASTNode {
    if (this.current().type === 'OPERATOR' && this.current().value === '-') {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'UnaryOp', op: '-', operand };
    }

    // Unary + is a no-op
    if (this.current().type === 'OPERATOR' && this.current().value === '+') {
      this.advance();
      return this.parseUnary();
    }

    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
    const tok = this.current();

    switch (tok.type) {
      case 'NUMBER': {
        this.advance();
        return { type: 'NumberLiteral', value: parseFloat(tok.value) };
      }

      case 'VARIABLE': {
        this.advance();
        return { type: 'Variable', name: tok.value as 'z' | 'c' };
      }

      case 'PARAM': {
        this.advance();
        this.parameters.add(tok.value);
        return { type: 'Parameter', name: tok.value };
      }

      case 'CONSTANT': {
        this.advance();
        return { type: 'Constant', name: tok.value as 'pi' | 'e' | 'i' };
      }

      case 'FUNCTION': {
        const fnName = tok.value;
        this.advance();
        this.expect('LPAREN');
        const args: ASTNode[] = [];

        if (this.current().type !== 'RPAREN') {
          args.push(this.parseExpression());
          while (this.current().type === 'COMMA') {
            this.advance();
            args.push(this.parseExpression());
          }
        }

        this.expect('RPAREN');
        return { type: 'FunctionCall', name: fnName, args };
      }

      case 'LPAREN': {
        this.advance();
        const expr = this.parseExpression();
        this.expect('RPAREN');
        return expr;
      }

      default:
        throw new Error(`Unexpected token '${tok.value}' at position ${tok.position}`);
    }
  }
}
