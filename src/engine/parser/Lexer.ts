import type { Token, TokenType } from '../../types/index.ts';

const KNOWN_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'conj', 'arg',
  'sinh', 'cosh', 'tanh', 'atan2',
]);

const KNOWN_CONSTANTS = new Set(['pi', 'e', 'i']);
const KNOWN_VARIABLES = new Set(['z', 'c']);

export class Lexer {
  private source: string;
  private pos = 0;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    this.pos = 0;
    this.tokens = [];

    while (this.pos < this.source.length) {
      this.skipWhitespace();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];

      if (this.isDigit(ch) || (ch === '.' && this.pos + 1 < this.source.length && this.isDigit(this.source[this.pos + 1]))) {
        this.readNumber();
      } else if (this.isAlpha(ch) || ch === '_') {
        this.readIdentifier();
      } else if ('+-*/^'.includes(ch)) {
        this.tokens.push({ type: 'OPERATOR', value: ch, position: this.pos });
        this.pos++;
      } else if (ch === '(') {
        this.tokens.push({ type: 'LPAREN', value: '(', position: this.pos });
        this.pos++;
      } else if (ch === ')') {
        this.tokens.push({ type: 'RPAREN', value: ')', position: this.pos });
        this.pos++;
      } else if (ch === ',') {
        this.tokens.push({ type: 'COMMA', value: ',', position: this.pos });
        this.pos++;
      } else if (ch === '|') {
        // Treat |...| as abs(...)
        this.tokens.push({ type: 'FUNCTION', value: 'abs', position: this.pos });
        this.tokens.push({ type: 'LPAREN', value: '(', position: this.pos });
        this.pos++;
        // Find matching |
        // We'll let the parser handle the closing
      } else {
        throw new Error(`Unexpected character '${ch}' at position ${this.pos}`);
      }
    }

    this.tokens.push({ type: 'EOF', value: '', position: this.pos });
    return this.tokens;
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length && /\s/.test(this.source[this.pos])) {
      this.pos++;
    }
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  private isAlphaNumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch);
  }

  private readNumber(): void {
    const start = this.pos;
    let hasDecimal = false;

    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (this.isDigit(ch)) {
        this.pos++;
      } else if (ch === '.' && !hasDecimal) {
        hasDecimal = true;
        this.pos++;
      } else {
        break;
      }
    }

    // Handle scientific notation: 1e5, 2.5e-3
    if (this.pos < this.source.length && (this.source[this.pos] === 'e' || this.source[this.pos] === 'E')) {
      this.pos++;
      if (this.pos < this.source.length && (this.source[this.pos] === '+' || this.source[this.pos] === '-')) {
        this.pos++;
      }
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        this.pos++;
      }
    }

    this.tokens.push({
      type: 'NUMBER',
      value: this.source.slice(start, this.pos),
      position: start,
    });
  }

  private readIdentifier(): void {
    const start = this.pos;
    while (this.pos < this.source.length && this.isAlphaNumeric(this.source[this.pos])) {
      this.pos++;
    }

    const word = this.source.slice(start, this.pos);
    let type: TokenType;

    if (KNOWN_FUNCTIONS.has(word)) {
      type = 'FUNCTION';
    } else if (KNOWN_CONSTANTS.has(word)) {
      type = 'CONSTANT';
    } else if (KNOWN_VARIABLES.has(word)) {
      type = 'VARIABLE';
    } else {
      type = 'PARAM';
    }

    this.tokens.push({ type, value: word, position: start });
  }
}
