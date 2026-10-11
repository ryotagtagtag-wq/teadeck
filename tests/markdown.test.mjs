import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderInline, renderMarkdown } from '../integration/markdown.ts';

test('inline syntax: emphasis, strikethrough, code and links', () => {
  assert.equal(renderInline('**fett** und *kursiv* und _auch_ und ~~weg~~'), '<strong>fett</strong> und <em>kursiv</em> und <em>auch</em> und <del>weg</del>');
  assert.equal(renderInline('`a * b` bleibt'), '<code>a * b</code> bleibt');
  assert.equal(renderInline('[Teadeck](https://teadeck.de)'), '<a href="https://teadeck.de" rel="nofollow noopener noreferrer" target="_blank">Teadeck</a>');
  // Bare addresses become links, without the punctuation that ends the sentence.
  assert.equal(renderInline('siehe https://example.com/a_b.'), 'siehe <a href="https://example.com/a_b" rel="nofollow noopener noreferrer" target="_blank">https://example.com/a_b</a>.');
  // Underscores inside words are not emphasis.
  assert.equal(renderInline('snake_case_name'), 'snake_case_name');
  assert.equal(renderInline('\\*kein\\* Stern'), '*kein* Stern');
});

test('nothing typed becomes HTML, and links only point to the web or mail', () => {
  assert.equal(renderInline('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(renderInline('[klick](javascript:alert(1))'), '[klick](javascript:alert(1))');
  assert.equal(renderInline('[x](https://a.example/"onmouseover="y)'), '<a href="https://a.example/&quot;onmouseover=&quot;y" rel="nofollow noopener noreferrer" target="_blank">x</a>');
  assert.equal(renderMarkdown('```\n<script>alert(1)</script>\n```'), '<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;\n</code></pre>');
});

test('blocks: headings, paragraphs with their line breaks, rules and quotes', () => {
  assert.equal(renderMarkdown('# Titel\n\nZeile eins\nZeile zwei\n\n---\n\n> zitiert\n> weiter'),
    '<h1>Titel</h1><p>Zeile eins<br>Zeile zwei</p><hr><blockquote><p>zitiert<br>weiter</p></blockquote>');
  assert.equal(renderMarkdown('### Klein ###'), '<h3>Klein</h3>');
});

test('lists, ordered and nested', () => {
  assert.equal(renderMarkdown('- eins\n- zwei\n  - innen\n- drei'), '<ul><li>eins</li><li>zwei<ul><li>innen</li></ul></li><li>drei</li></ul>');
  assert.equal(renderMarkdown('3. drei\n4. vier'), '<ol start="3"><li>drei</li><li>vier</li></ol>');
  assert.equal(renderMarkdown('Text\n- Punkt'), '<p>Text</p><ul><li>Punkt</li></ul>');
});

test('fenced code keeps its language for highlighting', () => {
  assert.equal(renderMarkdown('```js\nconst a = 1;\n```\nDanach'), '<pre><code class="language-js">const a = 1;\n</code></pre><p>Danach</p>');
  // An unclosed fence runs to the end, as while still typing.
  assert.equal(renderMarkdown('~~~\noffen'), '<pre><code>offen\n</code></pre>');
});
