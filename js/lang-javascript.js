/* ========== JAVASCRIPT LANGUAGE ========== */
const JS_EXAMPLES = {
  "Object references": `function main() {
    let a = 42;
    let b = 7;
    let obj = new Box();
    obj.value = a;
    obj.value = 100;
    console.log(obj.value);
    return 0;
}

class Box {
    constructor() {
        this.value = 0;
    }
}`,

  "Linked list": `function main() {
    let head = new Node();
    head.data = 10;
    head.next = new Node();
    head.next.data = 20;
    head.next.next = new Node();
    head.next.next.data = 30;
    head.next.next.next = null;

    let curr = head;
    while (curr != null) {
        console.log(curr.data);
        curr = curr.next;
    }
    return 0;
}

class Node {
    constructor() {
        this.data = 0;
        this.next = null;
    }
}`,

  "Binary tree": `function main() {
    let root = new TreeNode();
    root.val = 8;
    root.left = new TreeNode();
    root.left.val = 3;
    root.left.left = new TreeNode();
    root.left.left.val = 1;
    root.left.right = new TreeNode();
    root.left.right.val = 6;
    root.right = new TreeNode();
    root.right.val = 10;
    root.right.right = new TreeNode();
    root.right.right.val = 14;

    let cursor = root.left;
    console.log(cursor.val);
    return 0;
}

class TreeNode {
    constructor() {
        this.val = 0;
        this.left = null;
        this.right = null;
    }
}`,

  "For-loop iteration": `function main() {
    let arr = [2, 4, 6, 8, 10];

    for (let i = 0; i < 5; i = i + 1) {
        let x = arr[i];
        console.log(x);
    }
    return 0;
}`,

  "Max rectangle in binary matrix": `// Maximum area rectangle of 1s (histogram + stack).
// Adapted for this visualizer: no Math.max / Array.push / ternary / ===.
// Example matrix answer: 8

function getMaxArea(heights, m) {
    let st = [0, 0, 0, 0, 0, 0, 0, 0];
    let top = -1;
    let res = 0;

    for (let i = 0; i < m; i = i + 1) {
        while (top >= 0 && heights[st[top]] >= heights[i]) {
            let tp = st[top];
            top = top - 1;

            let width;
            if (top < 0) {
                width = i;
            } else {
                width = i - st[top] - 1;
            }

            let area = heights[tp] * width;
            if (area > res) {
                res = area;
            }
        }
        top = top + 1;
        st[top] = i;
    }

    while (top >= 0) {
        let tp = st[top];
        top = top - 1;

        let width;
        if (top < 0) {
            width = m;
        } else {
            width = m - st[top] - 1;
        }

        let area = heights[tp] * width;
        if (area > res) {
            res = area;
        }
    }

    return res;
}

function maxArea(mat, n, m) {
    let heights = [0, 0, 0, 0];
    let ans = 0;

    for (let i = 0; i < n; i = i + 1) {
        for (let j = 0; j < m; j = j + 1) {
            if (mat[i][j] == 1) {
                heights[j] = heights[j] + 1;
            } else {
                heights[j] = 0;
            }
        }

        let area = getMaxArea(heights, m);
        if (area > ans) {
            ans = area;
        }
    }

    return ans;
}

function main() {
    let mat = [
        [0, 1, 1, 0],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 0, 0]
    ];

    let result = maxArea(mat, 4, 4);
    console.log(result);
    return 0;
}`,
};

const JS_KEYWORDS = new Set([
  "let", "const", "var", "function", "return", "if", "else", "while", "for",
  "true", "false", "null", "class", "new", "this", "console", "log", "of", "in",
]);

function tokenizeJavaScript(src) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  s = s.replace(/\/\/.*$/gm, "");
  const tokens = [];
  let i = 0;
  let line = 1;
  const n = s.length;
  const push = (type, value) => tokens.push({ type, value, line });

  while (i < n) {
    const c = s[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      const q = c; i++;
      let str = "";
      while (i < n && s[i] !== q) {
        if (s[i] === "\n") line++;
        if (s[i] === "\\" && i + 1 < n) { str += s[i + 1]; i += 2; continue; }
        str += s[i++];
      }
      i++;
      push("string", str);
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] || ""))) {
      let num = "";
      while (i < n && /[0-9.]/.test(s[i])) num += s[i++];
      push("number", Number(num));
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let id = "";
      while (i < n && /[A-Za-z0-9_$]/.test(s[i])) id += s[i++];
      if (JS_KEYWORDS.has(id)) push("kw", id);
      else push("id", id);
      continue;
    }
    const two = s.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||", "++", "--", "+="].includes(two)) {
      push("op", two);
      i += 2;
      continue;
    }
    if ("(){}[];,.<>*/%+-=!".includes(c)) {
      push("op", c);
      i++;
      continue;
    }
    throw cppError("Unexpected character: " + c, line);
  }
  tokens.push({ type: "eof", value: "", line });
  return tokens;
}

function parseJavaScript(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const match = (type, value) => {
    const t = peek();
    if (t.type === type && (value === undefined || t.value === value)) { next(); return true; }
    return false;
  };
  const expect = (type, value) => {
    const t = peek();
    if (t.type === type && (value === undefined || t.value === value)) return next();
    throw cppError(
      "Expected " + (value || type) + ", got " + (t.value === "" ? t.type : t.value),
      t.line
    );
  };

  const structs = new Map();

  function inferTypeFromExpr(expr) {
    if (!expr) return { base: "int", stars: 0 };
    if (expr.type === "literal") {
      if (typeof expr.value === "string") return { base: "string", stars: 0 };
      if (typeof expr.value === "boolean") return { base: "bool", stars: 0 };
      return { base: "int", stars: 0 };
    }
    if (expr.type === "nullptr") return { base: "void", stars: 1 };
    if (expr.type === "new") return { base: expr.typeName.base, stars: 1 };
    if (expr.type === "ident") return { base: "auto", stars: 0 };
    if (expr.type === "member") return { base: "auto", stars: 0 };
    if (expr.type === "index") return { base: "int", stars: 0 };
    return { base: "int", stars: 0 };
  }

  function parseTypeName() {
    if (peek().type === "id" && structs.has(peek().value)) {
      const base = next().value;
      let stars = 0;
      while (match("op", "*")) stars++;
      return { base, stars };
    }
    return { base: "int", stars: 0 };
  }

  function parsePrimary() {
    if (match("kw", "true")) return { type: "literal", value: true };
    if (match("kw", "false")) return { type: "literal", value: false };
    if (match("kw", "null")) return { type: "nullptr" };
    if (peek().type === "number") return { type: "literal", value: next().value };
    if (peek().type === "string") return { type: "literal", value: next().value };
    if (match("kw", "new")) {
      const name = expect("id").value;
      const ty = { base: name, stars: 0 };
      if (match("op", "(")) {
        if (!match("op", ")")) {
          do { parseExpr(); } while (match("op", ","));
          expect("op", ")");
        }
      }
      return { type: "new", typeName: ty, args: [] };
    }
    if (match("op", "(")) {
      const e = parseExpr();
      expect("op", ")");
      return e;
    }
    if (match("op", "[")) {
      const items = [];
      if (!match("op", "]")) {
        do { items.push(parseExpr()); } while (match("op", ","));
        expect("op", "]");
      }
      return { type: "arraylit", items };
    }
    if (peek().type === "id" || peek().type === "kw") {
      const name = next().value;
      if (match("op", "(")) {
        const args = [];
        if (!match("op", ")")) {
          do { args.push(parseExpr()); } while (match("op", ","));
          expect("op", ")");
        }
        return { type: "call", name, args };
      }
      return { type: "ident", name };
    }
    throw cppError("Unexpected in expression: " + peek().value, peek().line);
  }

  function parsePostfix() {
    let e = parsePrimary();
    while (true) {
      if (match("op", "[")) {
        const idx = parseExpr();
        expect("op", "]");
        e = { type: "index", obj: e, index: idx };
      } else if (match("op", ".")) {
        const fieldTok = peek();
        if (fieldTok.type !== "id" && fieldTok.type !== "kw") {
          throw cppError("Expected property name, got " + fieldTok.value, fieldTok.line);
        }
        const field = next().value;
        e = { type: "member", obj: e, field, arrow: false };
      } else if (match("op", "(")) {
        const args = [];
        if (!match("op", ")")) {
          do { args.push(parseExpr()); } while (match("op", ","));
          expect("op", ")");
        }
        if (e.type === "ident") e = { type: "call", name: e.name, args };
        else if (e.type === "member" && e.obj.type === "ident" && e.obj.name === "console" && e.field === "log") {
          e = { type: "cout", parts: args };
        } else e = { type: "call", callee: e, args };
      } else if (match("op", "++") || match("op", "--")) {
        e = { type: "postop", op: tokens[p - 1].value, expr: e };
      } else break;
    }
    return e;
  }

  function parseUnary() {
    if (match("op", "-")) return { type: "unary", op: "-", expr: parseUnary() };
    if (match("op", "!")) return { type: "unary", op: "!", expr: parseUnary() };
    if (match("op", "++") || match("op", "--")) {
      const op = tokens[p - 1].value;
      return { type: "preop", op, expr: parseUnary() };
    }
    return parsePostfix();
  }

  function parseMul() {
    let e = parseUnary();
    while (peek().type === "op" && "*/%".includes(peek().value) && peek().value.length === 1) {
      const op = next().value;
      e = { type: "binary", op, left: e, right: parseUnary() };
    }
    return e;
  }

  function parseAdd() {
    let e = parseMul();
    while (peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = next().value;
      e = { type: "binary", op, left: e, right: parseMul() };
    }
    return e;
  }

  function parseCmp() {
    let e = parseAdd();
    while (peek().type === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(peek().value)) {
      const op = next().value;
      e = { type: "binary", op, left: e, right: parseAdd() };
    }
    return e;
  }

  function parseAnd() {
    let e = parseCmp();
    while (match("op", "&&")) e = { type: "binary", op: "&&", left: e, right: parseCmp() };
    return e;
  }

  function parseOr() {
    let e = parseAnd();
    while (match("op", "||")) e = { type: "binary", op: "||", left: e, right: parseAnd() };
    return e;
  }

  function parseAssign() {
    let e = parseOr();
    if (match("op", "=")) return { type: "assign", left: e, right: parseAssign() };
    if (match("op", "+=")) {
      return { type: "assign", left: e, right: { type: "binary", op: "+", left: e, right: parseAssign() } };
    }
    return e;
  }

  function parseExpr() { return parseAssign(); }

  function parseBlock() {
    expect("op", "{");
    const body = [];
    while (!match("op", "}")) body.push(parseStmt());
    return body;
  }

  function parseLetDecl() {
    const line = peek().line;
    match("kw", "let") || match("kw", "const") || match("kw", "var");
    const name = expect("id").value;
    let arraySize = null;
    if (match("op", "=")) {
      const init = parseExpr();
      expect("op", ";");
      let typeName = inferTypeFromExpr(init);
      if (init.type === "arraylit") {
        typeName = { base: "int", stars: 0 };
        arraySize = init.items.length;
        return {
          type: "vardecl",
          typeName,
          name,
          init: { type: "arraylit", items: init.items },
          arraySize,
          line,
        };
      }
      return { type: "vardecl", typeName, name, init, arraySize, line };
    }
    expect("op", ";");
    return { type: "vardecl", typeName: { base: "int", stars: 0 }, name, init: null, arraySize, line };
  }

  function parseStmt() {
    const line = peek().line;
    if (match("kw", "return")) {
      let value = null;
      if (!match("op", ";")) {
        value = parseExpr();
        expect("op", ";");
      }
      return { type: "return", value, line };
    }
    if (match("kw", "break")) { expect("op", ";"); return { type: "break", line }; }
    if (match("kw", "continue")) { expect("op", ";"); return { type: "continue", line }; }
    if (match("kw", "if")) {
      expect("op", "(");
      const cond = parseExpr();
      expect("op", ")");
      const then = peek().value === "{" ? parseBlock() : [parseStmt()];
      let els = null;
      if (match("kw", "else")) els = peek().value === "{" ? parseBlock() : [parseStmt()];
      return { type: "if", cond, then, else: els, line };
    }
    if (match("kw", "while")) {
      expect("op", "(");
      const cond = parseExpr();
      expect("op", ")");
      const body = peek().value === "{" ? parseBlock() : [parseStmt()];
      return { type: "while", cond, body, line };
    }
    if (match("kw", "for")) {
      expect("op", "(");
      let init = null;
      if (!match("op", ";")) {
        if (match("kw", "let") || match("kw", "const") || match("kw", "var")) {
          const vline = tokens[p - 1].line;
          const name = expect("id").value;
          let ini = null;
          let typeName = { base: "int", stars: 0 };
          if (match("op", "=")) {
            ini = parseExpr();
            typeName = inferTypeFromExpr(ini);
          }
          expect("op", ";");
          init = { type: "vardecl", typeName, name, init: ini, arraySize: null, line: vline };
        } else {
          init = { type: "expr", expr: parseExpr(), line };
          expect("op", ";");
        }
      }
      let cond = null;
      if (!match("op", ";")) { cond = parseExpr(); expect("op", ";"); }
      let upd = null;
      if (!match("op", ")")) { upd = parseExpr(); expect("op", ")"); }
      const body = peek().value === "{" ? parseBlock() : [parseStmt()];
      return { type: "for", init, cond, upd, body, line };
    }
    if (peek().type === "kw" && ["let", "const", "var"].includes(peek().value)) return parseLetDecl();
    const expr = parseExpr();
    expect("op", ";");
    return { type: "expr", expr, line };
  }

  function parseClass() {
    expect("kw", "class");
    const name = expect("id").value;
    const fields = [];
    structs.set(name, { name, fields });
    expect("op", "{");
    while (!match("op", "}")) {
      if (match("id", "constructor") || (match("kw", "constructor"))) {
        expect("op", "(");
        while (!match("op", ")") && peek().type !== "eof") next();
        const body = parseBlock();
        for (const st of body) {
          if (st.type === "expr" && st.expr.type === "assign") {
            const left = st.expr.left;
            if (left.type === "member" && left.obj.type === "ident" && left.obj.name === "this") {
              fields.push({ name: left.field, type: inferTypeFromExpr(st.expr.right) });
            }
          }
        }
        continue;
      }
      while (peek().type !== "eof" && peek().value !== "}") next();
      if (peek().value === "}") break;
    }
    structs.set(name, { name, fields });
  }

  function parseFunction() {
    const line = peek().line;
    expect("kw", "function");
    const name = expect("id").value;
    expect("op", "(");
    const params = [];
    if (!match("op", ")")) {
      do {
        const pname = expect("id").value;
        params.push({ name: pname, type: { base: "int", stars: 0 } });
      } while (match("op", ","));
      expect("op", ")");
    }
    const body = parseBlock();
    return { type: "function", name, ret: { base: "void", stars: 0 }, params, body, line };
  }

  const program = { structs, functions: [], statements: [] };
  while (peek().type !== "eof") {
    if (match("kw", "class")) {
      p--;
      parseClass();
      continue;
    }
    if (peek().type === "kw" && peek().value === "function") {
      program.functions.push(parseFunction());
      continue;
    }
    if (peek().type === "kw" && ["let", "const", "var"].includes(peek().value)) {
      program.statements.push(parseLetDecl());
      continue;
    }
    program.statements.push(parseStmt());
  }
  return program;
}

registerLanguage({
  id: "javascript",
  label: "JavaScript",
  sourceLabel: "JavaScript source",
  nullLabel: "null",
  entryPoint: "main",
  entryHint: "Entry point must be function main() { ... }.",
  tokenize: tokenizeJavaScript,
  parse: parseJavaScript,
  examples: JS_EXAMPLES,
  helpHtml:
    '<strong>Supported JavaScript subset:</strong> ' +
    '<code style="color:var(--value)">let</code>/<code style="color:var(--value)">const</code> · ' +
    '<code style="color:var(--value)">class</code> + <code style="color:var(--value)">new</code> · ' +
    'object references (<code style="color:var(--pointer)">.</code> member access) · ' +
    '<code style="color:var(--value)">null</code> · ' +
    '<code style="color:var(--value)">for</code>/<code style="color:var(--value)">while</code>/<code style="color:var(--value)">if</code> · ' +
    'functions + <code style="color:var(--value)">main</code> · arrays · ' +
    '<code style="color:var(--value)">console.log</code>. ' +
    "Closures, prototypes, async, and full ES features are not simulated.",
  syntax: {
    ctrlKeywords: new Set([
      "return", "if", "else", "while", "for", "break", "continue", "function", "class",
      "let", "const", "var", "new", "this", "true", "false", "null", "console", "log",
    ]),
    typeKeywords: new Set([]),
    streamIds: new Set(["console", "log"]),
    ptrOps: ["."],
    declPattern: /\b(?:let|const|var)\s+([A-Za-z_$]\w*)\s*(?:=|;)/g,
    structPattern: /\bclass\s+([A-Za-z_$]\w*)/g,
  },
});
