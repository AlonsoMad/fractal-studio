// ─── AST Node Types ──────────────────────────────────────────────

export type ASTNode =
  | NumberLiteral
  | Variable
  | Parameter
  | Constant
  | BinaryOp
  | UnaryOp
  | FunctionCall;

export interface NumberLiteral {
  type: 'NumberLiteral';
  value: number;
}

export interface Variable {
  type: 'Variable';
  name: 'z' | 'c';
}

export interface Parameter {
  type: 'Parameter';
  name: string;
}

export interface Constant {
  type: 'Constant';
  name: 'pi' | 'e' | 'i';
}

export interface BinaryOp {
  type: 'BinaryOp';
  op: '+' | '-' | '*' | '/' | '^';
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOp {
  type: 'UnaryOp';
  op: '-';
  operand: ASTNode;
}

export interface FunctionCall {
  type: 'FunctionCall';
  name: string;
  args: ASTNode[];
}

// ─── Token Types ─────────────────────────────────────────────────

export type TokenType =
  | 'NUMBER'
  | 'VARIABLE'
  | 'PARAM'
  | 'OPERATOR'
  | 'FUNCTION'
  | 'CONSTANT'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// ─── Parse Error ─────────────────────────────────────────────────

export interface ParseError {
  message: string;
  position: number;
  length: number;
}

// ─── Formula Compilation Result ──────────────────────────────────

export interface FormulaCompilationResult {
  wgslCode: string;
  parameters: ParameterInfo[];
  errors: ParseError[];
  ast: ASTNode | null;
}

export interface ParameterInfo {
  name: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
}

// ─── Color Types ─────────────────────────────────────────────────

export interface GradientStop {
  position: number; // 0..1
  color: [number, number, number]; // RGB 0..255
}

export type ColorMode = 'escape_time' | 'smooth' | 'orbit_trap' | 'domain_coloring';

export type OrbitTrapType = 'point' | 'line' | 'circle';

export interface ColorScheme {
  mode: ColorMode;
  gradient: GradientStop[];
  orbitTrapType: OrbitTrapType;
  orbitTrapParams: Record<string, number>;
}

// ─── Viewport / Navigation ──────────────────────────────────────

export interface ViewState {
  centerX: number;
  centerY: number;
  zoom: number;
}

// ─── Preset ──────────────────────────────────────────────────────

export interface Preset {
  id: string;
  name: string;
  formula: string;
  mode: FractalMode;
  parameters: Record<string, number>;
  colorScheme: ColorScheme;
  viewport: ViewState;
  maxIterations: number;
  escapeRadius: number;
  isJuliaMode: boolean;
  juliaC: { re: number; im: number };
}

export type FractalMode = 'escape_time' | 'newton';

// ─── Renderer Uniforms ──────────────────────────────────────────

export interface UniformData {
  centerX: number;
  centerY: number;
  zoom: number;
  aspect: number;
  maxIter: number;
  escapeRadius: number;
  juliaMode: number;
  juliaCRe: number;
  juliaCIm: number;
  colorMode: number;
  params: Record<string, number>;
}
