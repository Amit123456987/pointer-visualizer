/* ========== PARSER ========== */
function parse(tokens) {
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

  const types = new Set(["int","double","float","bool","char","void","string","long","short"]);
  const structs = new Map(); // name -> { fields: [{name, type, isPtr}] }

  function isTypeStart() {
    const t = peek();
    if (t.type === "kw" && (types.has(t.value) || t.value === "struct" || t.value === "class")) return true;
    if (t.type === "id" && structs.has(t.value)) return true;
    // Capitalized identifier is a type only when it starts a declaration
    // (Type name / Type* name), not an expression (A->id, B = ...).
    if (t.type === "id" && /^[A-Z]/.test(t.value)) {
      let j = p + 1;
      while (j < tokens.length && tokens[j].type === "op" && tokens[j].value === "*") j++;
      return !!(tokens[j] && tokens[j].type === "id");
    }
    return false;
  }

  function parseType() {
    let base;
    if (match("kw", "struct") || match("kw", "class")) {
      base = expect("id").value;
    } else if (peek().type === "kw" && types.has(peek().value)) {
      base = next().value;
    } else if (peek().type === "id") {
      // Allow known structs and forward type names
      base = next().value;
    } else {
      throw cppError("Expected type, got " + peek().value, peek().line);
    }
    let stars = 0;
    while (match("op", "*")) stars++;
    return { base, stars };
  }

  function parsePrimary() {
    if (match("kw", "true")) return { type: "literal", value: true };
    if (match("kw", "false")) return { type: "literal", value: false };
    if (match("kw", "nullptr") || match("kw", "NULL")) return { type: "nullptr" };
    if (peek().type === "number") return { type: "literal", value: next().value };
    if (peek().type === "string") return { type: "literal", value: next().value };
    if (match("kw", "new")) {
      const ty = parseType();
      // new Type  or new Type()
      if (match("op", "(")) {
        const args = [];
        if (!match("op", ")")) {
          do { args.push(parseExpr()); } while (match("op", ","));
          expect("op", ")");
        }
        return { type: "new", typeName: ty, args };
      }
      return { type: "new", typeName: ty, args: [] };
    }
    if (match("op", "(")) {
      const e = parseExpr();
      expect("op", ")");
      return e;
    }
    if (match("op", "&")) {
      return { type: "addr", expr: parseUnary() };
    }
    if (peek().type === "id" || (peek().type === "kw" && peek().value === "cout")) {
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
        const field = expect("id").value;
        e = { type: "member", obj: e, field, arrow: false };
      } else if (match("op", "->")) {
        const field = expect("id").value;
        e = { type: "member", obj: e, field, arrow: true };
      } else if (match("op", "(")) {
        const args = [];
        if (!match("op", ")")) {
          do { args.push(parseExpr()); } while (match("op", ","));
          expect("op", ")");
        }
        // method / functor call: expr(...)
        if (e.type === "ident") e = { type: "call", name: e.name, args };
        else e = { type: "call", callee: e, args };
      } else if (match("op", "++") || match("op", "--")) {
        e = { type: "postop", op: tokens[p-1].value, expr: e };
      } else break;
    }
    return e;
  }

  function parseUnary() {
    if (match("op", "*")) return { type: "deref", expr: parseUnary() };
    if (match("op", "-")) return { type: "unary", op: "-", expr: parseUnary() };
    if (match("op", "!")) return { type: "unary", op: "!", expr: parseUnary() };
    if (match("op", "++") || match("op", "--")) {
      const op = tokens[p-1].value;
      return { type: "preop", op, expr: parseUnary() };
    }
    return parsePostfix();
  }

  function parseBinary(pred) {
    // manual precedence climb via layered fns below
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
    while (peek().type === "op" && ["<",">","<=",">=","==","!="].includes(peek().value)) {
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
    if (match("op", "=")) {
      return { type: "assign", left: e, right: parseAssign() };
    }
    if (match("op", "+=")) {
      return { type: "assign", left: e, right: { type: "binary", op: "+", left: e, right: parseAssign() } };
    }
    // cout << x << y
    if (e.type === "ident" && e.name === "cout") {
      const parts = [];
      while (match("op", "<<")) {
        if (match("kw", "endl")) parts.push({ type: "literal", value: "\n" });
        else parts.push(parseOr());
      }
      if (parts.length) return { type: "cout", parts };
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

  function parseVarDecl() {
    const line = peek().line;
    const ty = parseType();
    const name = expect("id").value;
    let arraySize = null;
    if (match("op", "[")) {
      arraySize = expect("number").value;
      expect("op", "]");
    }
    let init = null;
    if (match("op", "=")) init = parseExpr();
    expect("op", ";");
    return { type: "vardecl", typeName: ty, name, init, arraySize, line };
  }

  function parseStmt() {
    const line = peek().line;
    // using namespace std;
    if (match("kw", "using")) {
      while (!match("op", ";") && peek().type !== "eof") next();
      return { type: "noop", line };
    }
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
        if (isTypeStart()) {
          const ty = parseType();
          const name = expect("id").value;
          let ini = null;
          if (match("op", "=")) ini = parseExpr();
          expect("op", ";");
          init = { type: "vardecl", typeName: ty, name, init: ini, arraySize: null, line };
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

    if (isTypeStart()) return parseVarDecl();

    const expr = parseExpr();
    expect("op", ";");
    return { type: "expr", expr, line };
  }

  function parseStruct() {
    const isClass = peek().value === "class";
    next(); // struct|class
    const name = expect("id").value;
    // Register early so fields can use Node* next style self-references
    const fields = [];
    structs.set(name, { name, fields });
    expect("op", "{");
    while (!match("op", "}")) {
      if (match("kw", "public") || match("kw", "private") || match("kw", "protected")) {
        expect("op", ":");
        continue;
      }
      const ty = parseType();
      const fname = expect("id").value;
      expect("op", ";");
      fields.push({ name: fname, type: ty });
    }
    match("op", ";");
    return { type: "struct", name, fields };
  }

  function parseFunction() {
    const line = peek().line;
    const ret = parseType();
    const name = expect("id").value;
    expect("op", "(");
    const params = [];
    if (!match("op", ")")) {
      do {
        const ty = parseType();
        const pname = expect("id").value;
        params.push({ name: pname, type: ty });
      } while (match("op", ","));
      expect("op", ")");
    }
    const body = parseBlock();
    return { type: "function", name, ret, params, body, line };
  }

  const program = { structs, functions: [], statements: [] };
  while (peek().type !== "eof") {
    if (peek().type === "kw" && (peek().value === "struct" || peek().value === "class")) {
      parseStruct();
      continue;
    }
    if (peek().type === "kw" && peek().value === "using") {
      while (!match("op", ";") && peek().type !== "eof") next();
      continue;
    }
    // Detect "Type name(" as a function without swallowing real parse errors
    const save = p;
    let isFunc = false;
    if (isTypeStart()) {
      try {
        parseType();
        if (peek().type === "id") {
          next();
          if (peek().type === "op" && peek().value === "(") isFunc = true;
        }
      } catch (_) {
        // Lookahead probe only — ignore
      }
      p = save;
    }
    if (isFunc) {
      program.functions.push(parseFunction());
      continue;
    }
    if (isTypeStart()) {
      program.statements.push(parseVarDecl());
      continue;
    }
    program.statements.push(parseStmt());
  }
  return program;
}
