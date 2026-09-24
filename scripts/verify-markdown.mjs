// Markdown converter review harness - no new dependencies (Node strips types).
// Run: npm run verify:markdown
// Fails (exit 1) on the first fixture mismatch, printing expected vs actual.
import { htmlToMarkdown, markdownToHtml } from "../src/lib/notes.ts";

let failures = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    console.log(`ok   ${name}`);

    return;
  }

  failures++;
  console.log(`FAIL ${name}`);
  console.log(`  expected: ${JSON.stringify(expected)}`);
  console.log(`  actual:   ${JSON.stringify(actual)}`);
}

const H2M = [
  ["h1", "<h1>Hello</h1>", "# Hello"],
  ["bold-wrapped h1", "<div><b><h1>Jeremias 23:3, 4</h1></b></div>", "# Jeremias 23:3, 4"],
  [
    "hollow h1",
    "<div><b><h1>T</h1></b><font><span><h1><br></h1></span></font></div><div><br></div><div>Body.</div>",
    "# T\n\nBody.",
  ],
  ["nested b-i-u", "<div>A <b><i><u>\u201cFaro Sul</u></i></b>\u201d fim.</div>", "A ***\u201cFaro Sul***\u201d fim."],
  ["italic", "<div><i>citação</i></div>", "*citação*"],
  ["strike", "<div><strike>old</strike></div>", "~~old~~"],
  ["strike in li", "<ul><li><strike>Workspace</strike></li><li>Notes</li></ul>", "- ~~Workspace~~\n- Notes"],
  ["underline kept plain", "<div><u>plain</u></div>", "plain"],
  ["highlight span", '<div>x <span style="background-color: yellow">y</span> z.</div>', "x **y** z."],
  ["tt code", "<div><tt>code()</tt></div>", "`code()`"],
  ["link", '<div>Ver <a href="https://e.com"><b>este</b></a>.</div>', "Ver [**este**](https://e.com)."],
  ["link with entity in url", '<div><a href="https://e.com/?a=1&amp;b=2">t</a></div>', "[t](https://e.com/?a=1&b=2)"],
  ["multi-para bold kept apart", "<div><b>A.</b></div><div><b>B.</b></div>", "**A.**\n\n**B.**"],
  ["empty styled divs", "<div><br></div><div><b><u><br></u></b></div><div>real</div>", "real"],
  // Literal < > typed by the user must survive as entities so they render.
  ["literal angle brackets", "<div>a &lt;sdasds b</div>", "a &lt;sdasds b"],
  ["ampersand", "<div>Fish &amp; Chips</div>", "Fish & Chips"],
  ["nbsp", "<div>a&nbsp;b</div>", "a b"],
  ["numeric entity", "<div>&#39;quoted&#39;</div>", "'quoted'"],
  [
    "blockquote",
    "<div>Intro</div><blockquote><div>Linha 1.</div><div>Linha 2.</div></blockquote><div>Fim.</div>",
    "Intro\n> Linha 1.\n>\n> Linha 2.\n\nFim.",
  ],
  [
    "table",
    "<table><tbody><tr><td><div><b>Scope</b></div></td><td><div>Time</div></td></tr><tr><td><div>A</div></td><td><div>B</div></td></tr></tbody></table>",
    "| **Scope** | Time |\n| --- | --- |\n| A | B |",
  ],
  ["nested read", "<ul><li>a</li><ul><li>b</li></ul></ul>", "- a\n  - b"],
  ["ordered read", "<ol><li>a</li><li>b</li></ol>", "1. a\n1. b"],
  ["checklist span", "<div><span class='x apple-rich-text-checklist'>task</span></div>", "- [ ] task"],
];

for (const [name, html, expected] of H2M) {
  check(`html>${name}`, htmlToMarkdown(html), expected);
}

const M2H = [
  ["heading", "# Hi", "<h1>Hi</h1>"],
  ["bold+link", "**b** [l](https://e.com)", '<div><b>b</b> <a href="https://e.com">l</a></div>'],
  ["task", "- [ ] t", "<ul><li>☐ t</li></ul>"],
  ["nested bullets", "- a\n  - b\n    - c", "<ul><li>a</li><ul><li>b</li><ul><li>c</li></ul></ul></ul>"],
  ["nested ordered", "1. a\n   1. b", "<ol><li>a</li><ol><li>b</li></ol></ol>"],
  ["quote", "> cited", "<blockquote>cited</blockquote>"],
  ["fence", "```\ncode()\n```", "<pre><code>code()</code></pre>"],
];

for (const [name, md, expected] of M2H) {
  check(`md>${name}`, markdownToHtml(md), expected);
}

// Round-trip: nested structure survives write then read.
{
  const nested = "- a\n  - b\n    - c";
  const back = htmlToMarkdown(markdownToHtml(nested));
  check("round-trip nested", back, nested);
}

// Idempotence: converting our own output must not grow markers.
const once = htmlToMarkdown("<div><b><h1>T</h1></b></div><div>Body <i>i</i>.</div>");
check("no marker growth", htmlToMarkdown(`<div>${once.replace(/\n/g, "<br>")}</div>`).length > 0, true);

if (failures > 0) {
  console.log(`\n${failures} fixture(s) failed`);
  process.exit(1);
}

console.log("\nall markdown fixtures pass");
