import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeLanguage, highlightCode, splitTokenLines } from '../integration/code_highlight.ts';

const roles = (tokens, role) => tokens.filter(token => token.role === role).map(token => token.text.trim());

test('the language comes from the class a Markdown renderer gives the code element', () => {
  assert.equal(codeLanguage('language-js'), 'js');
  assert.equal(codeLanguage('foo language-c++'), 'c++');
  assert.equal(codeLanguage(''), '');
  assert.equal(codeLanguage(undefined), '');
});

test('the tokens always add up to the code, untouched', () => {
  const samples = [
    ['js', 'const a = "x // not a comment"; // a comment\nfetch(`/api/${a}`, 0x1f) /* open'],
    ['python', "def f(x):\n    return x + 1.5  # done\nprint('it\\'s')"],
    ['sql', "SELECT id FROM users -- all\nWHERE name = 'a'"],
    ['', 'no language: <b>&amp;</b>'],
    ['text', 'const x = 1'],
    ['go', '"unterminated\nfunc main() {}'],
  ];
  for (const [language, code] of samples) {
    assert.equal(highlightCode(code, language).map(token => token.text).join(''), code, language);
  }
});

test('comments, strings, numbers, keywords and calls get their roles', () => {
  const tokens = highlightCode('const total = sum(1, "two") // add\nnew Map()', 'js');
  assert.deepEqual(roles(tokens, 'keyword'), ['const', 'new']);
  assert.deepEqual(roles(tokens, 'function'), ['sum', 'Map']);
  assert.deepEqual(roles(tokens, 'string'), ['"two"']);
  assert.deepEqual(roles(tokens, 'number'), ['1']);
  assert.deepEqual(roles(tokens, 'comment'), ['// add']);
});

test('comment syntax follows the language', () => {
  assert.deepEqual(roles(highlightCode('x = 1 # note', 'python'), 'comment'), ['# note']);
  assert.deepEqual(roles(highlightCode('color: #fff; /* note */', 'css'), 'comment'), ['/* note */']);
  assert.deepEqual(roles(highlightCode('a // b', 'python'), 'comment'), []);
});

test('code without a known language stays plain', () => {
  assert.deepEqual(highlightCode('const x = 1', ''), [{ text: 'const x = 1', role: 'plain' }]);
  assert.deepEqual(highlightCode('', 'js'), []);
});

test('tokens are split into lines, a block comment across lines included', () => {
  const lines = splitTokenLines([
    { text: 'a', role: 'plain' },
    { text: '/* one\ntwo */', role: 'comment' },
    { text: '\n\nb', role: 'plain' },
  ]);
  assert.deepEqual(lines, [
    [{ text: 'a', role: 'plain' }, { text: '/* one', role: 'comment' }],
    [{ text: 'two */', role: 'comment' }],
    [],
    [{ text: 'b', role: 'plain' }],
  ]);
});
