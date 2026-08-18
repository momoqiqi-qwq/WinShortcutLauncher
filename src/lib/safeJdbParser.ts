class StaticObjectParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): unknown {
    this.skipSpaceAndComments();
    const value = this.parseValue();
    this.skipSpaceAndComments();
    if (this.peek() === ';') {
      this.index += 1;
      this.skipSpaceAndComments();
    }
    if (!this.eof()) this.fail('对象结束后存在不支持的表达式');
    return value;
  }

  private parseValue(): unknown {
    this.skipSpaceAndComments();
    const char = this.peek();
    if (char === '{') return this.parseObject();
    if (char === '[') return this.parseArray();
    if (char === '"' || char === "'") return this.parseString();
    if (char === '-' || char === '+' || /[0-9.]/.test(char)) return this.parseNumber();
    if (this.isIdentifierStart(char)) {
      const word = this.parseIdentifier();
      if (word === 'true') return true;
      if (word === 'false') return false;
      if (word === 'null') return null;
      if (word === 'undefined') return null;
      if (word === 'NaN') return null;
      if (word === 'Infinity') return null;
      this.fail(`不支持把标识符 ${word} 当作值；JDB 只能包含静态数据`);
    }
    this.fail(`遇到不支持的字符 ${JSON.stringify(char)}`);
  }

  private parseObject(): Record<string, unknown> {
    this.expect('{');
    const result: Record<string, unknown> = {};
    this.skipSpaceAndComments();
    if (this.peek() === '}') {
      this.index += 1;
      return result;
    }
    while (!this.eof()) {
      this.skipSpaceAndComments();
      const char = this.peek();
      let key: string;
      if (char === '"' || char === "'") key = this.parseString();
      else if (this.isIdentifierStart(char)) key = this.parseIdentifier();
      else if (/[0-9+-]/.test(char)) key = String(this.parseNumber());
      else this.fail('对象键必须是字符串、数字或普通标识符');

      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        this.fail(`对象键 ${key} 不允许出现在导入配置中`);
      }
      this.skipSpaceAndComments();
      this.expect(':');
      result[key] = this.parseValue();
      this.skipSpaceAndComments();
      if (this.peek() === '}') {
        this.index += 1;
        return result;
      }
      this.expect(',');
      this.skipSpaceAndComments();
      if (this.peek() === '}') {
        this.index += 1;
        return result;
      }
    }
    this.fail('对象缺少结束符 }');
  }

  private parseArray(): unknown[] {
    this.expect('[');
    const result: unknown[] = [];
    this.skipSpaceAndComments();
    if (this.peek() === ']') {
      this.index += 1;
      return result;
    }
    while (!this.eof()) {
      result.push(this.parseValue());
      this.skipSpaceAndComments();
      if (this.peek() === ']') {
        this.index += 1;
        return result;
      }
      this.expect(',');
      this.skipSpaceAndComments();
      if (this.peek() === ']') {
        this.index += 1;
        return result;
      }
    }
    this.fail('数组缺少结束符 ]');
  }

  private parseString(): string {
    const quote = this.peek();
    this.index += 1;
    let result = '';
    while (!this.eof()) {
      const char = this.peek();
      this.index += 1;
      if (char === quote) return result;
      if (char !== '\\') {
        result += char;
        continue;
      }
      if (this.eof()) this.fail('字符串转义不完整');
      const escaped = this.peek();
      this.index += 1;
      const simple: Record<string, string> = {
        n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0',
        '\\': '\\', '"': '"', "'": "'",
      };
      if (escaped in simple) {
        result += simple[escaped];
        continue;
      }
      if (escaped === 'x') {
        result += String.fromCharCode(this.readHex(2));
        continue;
      }
      if (escaped === 'u') {
        if (this.peek() === '{') {
          this.index += 1;
          const start = this.index;
          while (!this.eof() && this.peek() !== '}') this.index += 1;
          if (this.eof()) this.fail('Unicode 转义不完整');
          const hex = this.source.slice(start, this.index);
          this.index += 1;
          const codePoint = Number.parseInt(hex, 16);
          if (!Number.isFinite(codePoint)) this.fail('Unicode 转义无效');
          result += String.fromCodePoint(codePoint);
        } else {
          result += String.fromCharCode(this.readHex(4));
        }
        continue;
      }
      if (escaped === '\n' || escaped === '\r') {
        if (escaped === '\r' && this.peek() === '\n') this.index += 1;
        continue;
      }
      result += escaped;
    }
    this.fail('字符串缺少结束引号');
  }

  private readHex(length: number): number {
    const value = this.source.slice(this.index, this.index + length);
    if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(value)) this.fail('十六进制转义无效');
    this.index += length;
    return Number.parseInt(value, 16);
  }

  private parseNumber(): number {
    const rest = this.source.slice(this.index);
    const hexMatch = rest.match(/^[+-]?0[xX][0-9a-fA-F]+/);
    const numericMatch = rest.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    const token = hexMatch?.[0] ?? numericMatch?.[0];
    if (!token) this.fail('数字格式无效');
    this.index += token.length;
    const value = Number(token);
    if (!Number.isFinite(value)) this.fail('数字超出支持范围');
    return value;
  }

  private parseIdentifier(): string {
    const start = this.index;
    this.index += 1;
    while (!this.eof() && this.isIdentifierPart(this.peek())) this.index += 1;
    return this.source.slice(start, this.index);
  }

  private skipSpaceAndComments() {
    while (!this.eof()) {
      const char = this.peek();
      if (/\s/.test(char)) {
        this.index += 1;
        continue;
      }
      if (char === '/' && this.source[this.index + 1] === '/') {
        this.index += 2;
        while (!this.eof() && this.peek() !== '\n') this.index += 1;
        continue;
      }
      if (char === '/' && this.source[this.index + 1] === '*') {
        this.index += 2;
        const end = this.source.indexOf('*/', this.index);
        if (end < 0) this.fail('块注释没有结束');
        this.index = end + 2;
        continue;
      }
      return;
    }
  }

  private expect(char: string) {
    this.skipSpaceAndComments();
    if (this.peek() !== char) this.fail(`应为 ${char}`);
    this.index += 1;
  }

  private isIdentifierStart(char: string) {
    return /[A-Za-z_$\u0080-\uFFFF]/.test(char);
  }

  private isIdentifierPart(char: string) {
    return /[A-Za-z0-9_$\u0080-\uFFFF]/.test(char);
  }

  private peek() {
    return this.source[this.index] ?? '';
  }

  private eof() {
    return this.index >= this.source.length;
  }

  private fail(message: string): never {
    const start = Math.max(0, this.index - 24);
    const end = Math.min(this.source.length, this.index + 24);
    const nearby = this.source.slice(start, end).replace(/\s+/g, ' ');
    throw new Error(`${message}（位置 ${this.index}，附近：${nearby}）`);
  }
}

function stripLeadingTrivia(rawText: string): string {
  let source = rawText.replace(/^\uFEFF/, '');
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source[index] ?? '')) {
      index += 1;
      continue;
    }
    if (source[index] === '/' && source[index + 1] === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (source[index] === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) throw new Error('JDB 文件开头的块注释没有结束');
      index = end + 2;
      continue;
    }
    break;
  }
  return source.slice(index);
}

function unwrapJdbAssignment(rawText: string): string {
  let source = stripLeadingTrivia(rawText);
  source = source.replace(/^\s*(?:var|let|const)\s+JDB\s*=\s*/i, '');
  source = source.replace(/^\s*(?:window\.)?JDB\s*=\s*/i, '');
  return source.trim();
}

/**
 * Parses the static object-literal subset used by Maye JDB files.
 * It intentionally never evaluates JavaScript. Function calls, member access,
 * template strings and executable expressions are rejected.
 */
export function parseStaticJdbObject(rawText: string): unknown {
  return new StaticObjectParser(unwrapJdbAssignment(rawText)).parse();
}
