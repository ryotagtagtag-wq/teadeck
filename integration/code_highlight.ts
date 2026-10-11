/**
 * A small highlighter for code blocks in posts. It knows the shape most
 * languages share - comments, strings, numbers, keywords and calls - rather
 * than any one grammar, which is enough to make code in a post readable.
 * Only blocks that name their language are highlighted.
 */

export type TokenRole = 'plain' | 'keyword' | 'function' | 'string' | 'number' | 'comment';
export type Token = { text: string; role: TokenRole };

const hashComments = new Set([
  'bash', 'sh', 'shell', 'zsh', 'fish', 'python', 'py', 'ruby', 'rb', 'perl', 'pl', 'r',
  'yaml', 'yml', 'toml', 'ini', 'conf', 'dockerfile', 'makefile', 'make', 'nix', 'elixir', 'ex',
  'powershell', 'ps1', 'caddyfile', 'nginx',
]);
const dashComments = new Set(['sql', 'lua', 'haskell', 'hs', 'elm', 'ada']);
const noSlashComments = new Set([...hashComments, ...dashComments, 'html', 'xml', 'svg', 'markdown', 'md', 'json']);
const blockOnlyComments = new Set(['css', 'scss', 'less']);
const plainLanguages = new Set(['text', 'txt', 'plain', 'plaintext']);

const keywords = new Set([
  'abstract', 'and', 'as', 'async', 'await', 'bool', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'def', 'default', 'defer', 'del', 'delete', 'do', 'done', 'double', 'elif',
  'else', 'enum', 'esac', 'export', 'extends', 'false', 'fi', 'final', 'finally', 'float', 'fn', 'for',
  'from', 'func', 'function', 'go', 'if', 'impl', 'implements', 'import', 'in', 'instanceof', 'int',
  'interface', 'is', 'lambda', 'let', 'local', 'long', 'loop', 'map', 'match', 'mod', 'module', 'mut',
  'new', 'nil', 'none', 'None', 'not', 'null', 'number', 'object', 'or', 'package', 'pass', 'private',
  'protected', 'pub', 'public', 'raise', 'return', 'select', 'self', 'short', 'static', 'str', 'string',
  'struct', 'super', 'switch', 'then', 'this', 'throw', 'throws', 'trait', 'true', 'True', 'False', 'try',
  'type', 'typeof', 'undefined', 'unsigned', 'use', 'var', 'void', 'where', 'while', 'with', 'yield',
  'FROM', 'WHERE', 'SELECT', 'INSERT', 'INTO', 'UPDATE', 'DELETE', 'CREATE', 'TABLE', 'JOIN', 'ORDER', 'BY',
  'GROUP', 'VALUES', 'SET', 'AND', 'OR', 'NOT', 'NULL', 'AS', 'ON', 'LIMIT',
]);

/** The language a code element names in its class, as Markdown renderers write it (`language-js`). */
export function codeLanguage(className: string | null | undefined): string {
  return /(?:^|\s)language-([A-Za-z0-9+#-]+)/.exec(className ?? '')?.[1] ?? '';
}

function commentPattern(language: string): string {
  const patterns: string[] = [];
  if (!noSlashComments.has(language) && !blockOnlyComments.has(language)) patterns.push('//[^\\n]*');
  if (!noSlashComments.has(language)) patterns.push('/\\*[\\s\\S]*?(?:\\*/|$)');
  if (hashComments.has(language)) patterns.push('#[^\\n]*');
  if (dashComments.has(language)) patterns.push('--[^\\n]*');
  if (['html', 'xml', 'svg', 'markdown', 'md'].includes(language)) patterns.push('<!--[\\s\\S]*?(?:-->|$)');
  return patterns.join('|');
}

/** Splits code into tokens whose text, joined, is exactly the input. */
export function highlightCode(code: string, language: string): Token[] {
  const lang = language.toLowerCase();
  if (!lang || plainLanguages.has(lang)) return code ? [{ text: code, role: 'plain' }] : [];
  const comments = commentPattern(lang);
  const pattern = new RegExp([
    comments ? `(${comments})` : '(?!)',
    '("(?:[^"\\\\\\n]|\\\\.)*"?|\'(?:[^\'\\\\\\n]|\\\\.)*\'?|`(?:[^`\\\\]|\\\\.)*`?)',
    '(\\b(?:0x[0-9a-fA-F_]+|\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b)',
    '([A-Za-z_$][\\w$]*)',
  ].join('|'), 'g');

  const tokens: Token[] = [];
  const push = (text: string, role: TokenRole) => {
    const last = tokens.at(-1);
    if (last && last.role === role) last.text += text;
    else tokens.push({ text, role });
  };
  let index = 0;
  for (const match of code.matchAll(pattern)) {
    if (match.index > index) push(code.slice(index, match.index), 'plain');
    const [text, comment, string, number, word] = match;
    const after = code.slice(match.index + text.length);
    if (comment !== undefined) push(text, 'comment');
    else if (string !== undefined) push(text, 'string');
    else if (number !== undefined) push(text, 'number');
    else if (word !== undefined && keywords.has(word)) push(text, 'keyword');
    else if (word !== undefined && (/^\s*\(/.test(after) || /^[A-Z][a-z]\w*$/.test(word))) push(text, 'function');
    else push(text, 'plain');
    index = match.index + text.length;
  }
  if (index < code.length) push(code.slice(index), 'plain');
  return tokens;
}

/**
 * The tokens line by line, for a block that shows each line on its own (and
 * wraps it). A token spanning lines, such as a block comment, is split at them.
 */
export function splitTokenLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokens) {
    token.text.split('\n').forEach((text, index) => {
      if (index > 0) lines.push([]);
      if (text) lines.at(-1)!.push({ text, role: token.role });
    });
  }
  return lines;
}
