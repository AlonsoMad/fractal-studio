import type { ASTNode } from '../../types/index.ts';

/**
 * Symbolic differentiation of AST with respect to variable 'z'.
 * Used for Newton fractal mode: z_next = z - f(z)/f'(z)
 */
export function differentiate(node: ASTNode, variable: string = 'z'): ASTNode {
  switch (node.type) {
    case 'NumberLiteral':
      return num(0);

    case 'Variable':
      return node.name === variable ? num(1) : num(0);

    case 'Parameter':
      return num(0);

    case 'Constant':
      return num(0);

    case 'UnaryOp':
      if (node.op === '-') {
        return neg(differentiate(node.operand, variable));
      }
      return num(0);

    case 'BinaryOp':
      return differentiateBinaryOp(node, variable);

    case 'FunctionCall':
      return differentiateFunctionCall(node, variable);
  }
}

function differentiateBinaryOp(node: ASTNode & { type: 'BinaryOp' }, v: string): ASTNode {
  const { left, right, op } = node;
  const dl = differentiate(left, v);
  const dr = differentiate(right, v);

  switch (op) {
    case '+':
      return add(dl, dr);
    case '-':
      return sub(dl, dr);
    case '*':
      // Product rule: d(fg) = f'g + fg'
      return add(mul(dl, right), mul(left, dr));
    case '/':
      // Quotient rule: d(f/g) = (f'g - fg')/g^2
      return div(
        sub(mul(dl, right), mul(left, dr)),
        pow(right, num(2))
      );
    case '^':
      // If exponent is a constant integer, use power rule
      if (isConstantNode(right)) {
        // d(f^n) = n * f^(n-1) * f'
        return mul(mul(right, pow(left, sub(right, num(1)))), dl);
      }
      // General case: d(f^g) = f^g * (g' * ln(f) + g * f'/f)
      return mul(
        pow(left, right),
        add(
          mul(dr, fn('log', [left])),
          mul(right, div(dl, left))
        )
      );
    default:
      return num(0);
  }
}

function differentiateFunctionCall(node: ASTNode & { type: 'FunctionCall' }, v: string): ASTNode {
  const arg = node.args[0];
  if (!arg) return num(0);
  const da = differentiate(arg, v);

  // Chain rule: d(f(g(x))) = f'(g(x)) * g'(x)
  switch (node.name) {
    case 'sin':
      return mul(fn('cos', [arg]), da);
    case 'cos':
      return mul(neg(fn('sin', [arg])), da);
    case 'tan':
      // d(tan) = sec^2 = 1/cos^2
      return mul(div(num(1), pow(fn('cos', [arg]), num(2))), da);
    case 'exp':
      return mul(fn('exp', [arg]), da);
    case 'log':
      return mul(div(num(1), arg), da);
    case 'sqrt':
      return mul(div(num(1), mul(num(2), fn('sqrt', [arg]))), da);
    case 'abs':
      // d(|z|) = z / |z| (complex modulus derivative, approximate)
      return mul(div(arg, fn('abs', [arg])), da);
    default:
      return num(0);
  }
}

// ─── Helper functions to check if a node is "constant" ───

function isConstantNode(node: ASTNode): boolean {
  return (
    node.type === 'NumberLiteral' ||
    node.type === 'Constant' ||
    node.type === 'Parameter'
  );
}

// ─── Simplification pass ────────────────────────────────

export function simplify(node: ASTNode): ASTNode {
  switch (node.type) {
    case 'BinaryOp': {
      const left = simplify(node.left);
      const right = simplify(node.right);

      // 0 + x = x, x + 0 = x
      if (node.op === '+') {
        if (isZero(left)) return right;
        if (isZero(right)) return left;
      }
      // x - 0 = x
      if (node.op === '-') {
        if (isZero(right)) return left;
      }
      // 0 * x = 0, x * 0 = 0
      if (node.op === '*') {
        if (isZero(left) || isZero(right)) return num(0);
        if (isOne(left)) return right;
        if (isOne(right)) return left;
      }
      // x / 1 = x
      if (node.op === '/') {
        if (isOne(right)) return left;
      }
      // x ^ 0 = 1, x ^ 1 = x
      if (node.op === '^') {
        if (isZero(right)) return num(1);
        if (isOne(right)) return left;
      }
      // Constant folding
      if (left.type === 'NumberLiteral' && right.type === 'NumberLiteral') {
        switch (node.op) {
          case '+': return num(left.value + right.value);
          case '-': return num(left.value - right.value);
          case '*': return num(left.value * right.value);
          case '/': return right.value !== 0 ? num(left.value / right.value) : { type: 'BinaryOp', op: '/', left, right };
          case '^': return num(Math.pow(left.value, right.value));
        }
      }

      return { type: 'BinaryOp', op: node.op, left, right };
    }

    case 'UnaryOp': {
      const operand = simplify(node.operand);
      if (node.op === '-' && operand.type === 'NumberLiteral') {
        return num(-operand.value);
      }
      if (node.op === '-' && operand.type === 'UnaryOp' && operand.op === '-') {
        return operand.operand;
      }
      return { type: 'UnaryOp', op: node.op, operand };
    }

    case 'FunctionCall':
      return { type: 'FunctionCall', name: node.name, args: node.args.map(a => simplify(a)) };

    default:
      return node;
  }
}

// ─── AST node constructors ──────────────────────────────

function num(value: number): ASTNode {
  return { type: 'NumberLiteral', value };
}

function neg(operand: ASTNode): ASTNode {
  return { type: 'UnaryOp', op: '-', operand };
}

function add(left: ASTNode, right: ASTNode): ASTNode {
  return { type: 'BinaryOp', op: '+', left, right };
}

function sub(left: ASTNode, right: ASTNode): ASTNode {
  return { type: 'BinaryOp', op: '-', left, right };
}

function mul(left: ASTNode, right: ASTNode): ASTNode {
  return { type: 'BinaryOp', op: '*', left, right };
}

function div(left: ASTNode, right: ASTNode): ASTNode {
  return { type: 'BinaryOp', op: '/', left, right };
}

function pow(base: ASTNode, exponent: ASTNode): ASTNode {
  return { type: 'BinaryOp', op: '^', left: base, right: exponent };
}

function fn(name: string, args: ASTNode[]): ASTNode {
  return { type: 'FunctionCall', name, args };
}

function isZero(node: ASTNode): boolean {
  return node.type === 'NumberLiteral' && node.value === 0;
}

function isOne(node: ASTNode): boolean {
  return node.type === 'NumberLiteral' && node.value === 1;
}
