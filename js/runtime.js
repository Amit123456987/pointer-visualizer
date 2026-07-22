/* ========== RUNTIME / INTERPRETER ========== */
let heap, nextId, globals, callStack, stdout, structs;
let ipQueue; // flat step queue of closures for stepping
let stepIndex;
let iterationInfo;
let lastArrayWrite; // { name, index, frame } — last array cell written
let lastError;
let currentSourceLine; // descriptive
let currentLine; // 1-based source line being executed
let errorLine; // 1-based line with a parse/runtime error

function markError(e) {
  const line = lineFromError(e) || currentLine || 0;
  errorLine = line;
  if (line) currentLine = line;
  let msg = e && (e.message || String(e));
  if (line && msg && !/\b[Ll]ine\s+\d+\b/.test(msg)) {
    msg = "Line " + line + ": " + msg;
  }
  lastError = msg;
  return { msg: lastError, error: true, line };
}

function resetVm() {
  heap = new Map();
  nextId = 1;
  globals = new Map();
  callStack = [];
  stdout = [];
  ipQueue = [];
  stepIndex = 0;
  iterationInfo = null;
  lastArrayWrite = null;
  lastError = null;
  currentSourceLine = "";
  currentLine = 0;
  errorLine = 0;
}

function alloc(typeName, fields) {
  const id = "0x" + (nextId++).toString(16).padStart(4, "0");
  const obj = { id, typeName, fields: { ...fields } };
  heap.set(id, obj);
  return id;
}

function VPrim(v) { return { k: "prim", v }; }
function VPtr(addr) { return { k: "ptr", addr }; } // addr is heap id or {frame,name} for stack ptr
function VNull() { return { k: "null" }; }
function VArr(items) { return { k: "arr", items }; }

function describe(val) {
  if (!val) return "undefined";
  if (val.k === "prim") return JSON.stringify(val.v);
  if (val.k === "null") {
    try {
      return getCurrentLanguage().nullLabel;
    } catch (_) {
      return "nullptr";
    }
  }
  if (val.k === "ptr") {
    if (typeof val.addr === "string") return val.addr;
    if (val.addr && val.addr.stack) return "&" + val.addr.name;
    return String(val.addr);
  }
  if (val.k === "arr") return "[" + val.items.map(describe).join(", ") + "]";
  return "?";
}

function truthy(val) {
  if (!val) return false;
  if (val.k === "null") return false;
  if (val.k === "prim") return !!val.v;
  if (val.k === "ptr") return true;
  return true;
}

function currentFrame() {
  return callStack[callStack.length - 1];
}

function lookupVar(name) {
  for (let i = callStack.length - 1; i >= 0; i--) {
    if (callStack[i].locals.has(name)) return { frame: callStack[i], name };
  }
  if (globals.has(name)) return { frame: { locals: globals, name: "<global>" }, name, global: true };
  return null;
}

function getVar(name) {
  const loc = lookupVar(name);
  if (!loc) fail("Undefined variable: " + name);
  if (loc.global) return globals.get(name);
  return loc.frame.locals.get(name);
}

function setVar(name, val) {
  const loc = lookupVar(name);
  if (!loc) {
    currentFrame().locals.set(name, val);
    return;
  }
  if (loc.global) globals.set(name, val);
  else loc.frame.locals.set(name, val);
}

function declVar(name, val) {
  currentFrame().locals.set(name, val);
}

function defaultFields(structName) {
  const s = structs.get(structName);
  const fields = {};
  if (!s) return fields;
  for (const f of s.fields) {
    if (f.type.stars > 0) fields[f.name] = VNull();
    else if (f.type.base === "bool") fields[f.name] = VPrim(false);
    else if (["int","long","short","double","float"].includes(f.type.base)) fields[f.name] = VPrim(0);
    else fields[f.name] = VPrim(0);
  }
  return fields;
}

function evalLValue(node) {
  if (node.type === "ident") {
    const loc = lookupVar(node.name);
    if (!loc) fail("Undefined: " + node.name);
    return { kind: "var", name: node.name, loc };
  }
  if (node.type === "deref") {
    const ptr = evalExpr(node.expr);
    if (ptr.k !== "ptr") fail("Dereference of non-pointer");
    if (typeof ptr.addr === "object" && ptr.addr.stack) {
      return { kind: "var", name: ptr.addr.name, loc: { frame: ptr.addr.frame, name: ptr.addr.name } };
    }
    fail("Cannot assign through heap pointer without field (use ->)");
  }
  if (node.type === "member") {
    const objVal = evalExpr(node.obj);
    let id;
    if (node.arrow) {
      if (objVal.k !== "ptr" || typeof objVal.addr !== "string") fail("-> on non-pointer");
      id = objVal.addr;
    } else if (objVal.k === "ptr" && typeof objVal.addr === "string") {
      id = objVal.addr;
    } else {
      fail("Member access on non-object value (use pointers with ->)");
    }
    const obj = heap.get(id);
    if (!obj) fail("Dangling pointer");
    return { kind: "field", objId: id, field: node.field };
  }
  if (node.type === "index") {
    const arr = evalExpr(node.obj);
    const idx = evalExpr(node.index);
    if (arr.k !== "arr") fail("Indexing non-array");
    const arrName = node.obj.type === "ident" ? node.obj.name : null;
    return { kind: "index", arr, index: idx.v, arrName };
  }
  fail("Invalid lvalue");
}

function readLValue(lv) {
  if (lv.kind === "var") {
    if (lv.loc.global) return globals.get(lv.name);
    return lv.loc.frame.locals.get(lv.name);
  }
  if (lv.kind === "field") return heap.get(lv.objId).fields[lv.field];
  if (lv.kind === "index") return lv.arr.items[lv.index];
}

function writeLValue(lv, val) {
  if (lv.kind === "var") {
    if (lv.loc.global) globals.set(lv.name, val);
    else lv.loc.frame.locals.set(lv.name, val);
    return;
  }
  if (lv.kind === "field") {
    heap.get(lv.objId).fields[lv.field] = val;
    return;
  }
  if (lv.kind === "index") {
    lv.arr.items[lv.index] = val;
    if (lv.arrName) {
      const loc = lookupVar(lv.arrName);
      const frame =
        loc && loc.global ? "<global>" : currentFrame() ? currentFrame().name : "";
      lastArrayWrite = { name: lv.arrName, index: lv.index, frame };
    }
  }
}

function evalExpr(node) {
  if (!node) return VNull();
  switch (node.type) {
    case "literal": return VPrim(node.value);
    case "nullptr": return VNull();
    case "ident": return getVar(node.name);
    case "unary": {
      const v = evalExpr(node.expr);
      if (node.op === "-") return VPrim(-v.v);
      if (node.op === "!") return VPrim(!truthy(v));
      break;
    }
    case "binary": {
      const l = evalExpr(node.left);
      const r = evalExpr(node.right);
      const lv = l.k === "prim" ? l.v : (l.k === "null" ? 0 : l);
      const rv = r.k === "prim" ? r.v : (r.k === "null" ? 0 : r);
      switch (node.op) {
        case "+": return VPrim(lv + rv);
        case "-": return VPrim(lv - rv);
        case "*": return VPrim(lv * rv);
        case "/": return VPrim(Math.trunc(lv / rv));
        case "%": return VPrim(lv % rv);
        case "<": return VPrim(lv < rv);
        case ">": return VPrim(lv > rv);
        case "<=": return VPrim(lv <= rv);
        case ">=": return VPrim(lv >= rv);
        case "==": {
          if (l.k === "null" && r.k === "null") return VPrim(true);
          if (l.k === "ptr" && r.k === "ptr") return VPrim(l.addr === r.addr);
          if (l.k === "null" || r.k === "null") return VPrim(false);
          return VPrim(lv === rv);
        }
        case "!=": {
          const eq = evalExpr({ type: "binary", op: "==", left: node.left, right: node.right });
          return VPrim(!eq.v);
        }
        case "&&": return VPrim(truthy(l) && truthy(r));
        case "||": return VPrim(truthy(l) || truthy(r));
      }
      break;
    }
    case "addr": {
      if (node.expr.type !== "ident") fail("& only supported on variables");
      const loc = lookupVar(node.expr.name);
      if (!loc) fail("Undefined: " + node.expr.name);
      const frame = loc.global ? { locals: globals } : loc.frame;
      return VPtr({ stack: true, name: node.expr.name, frame });
    }
    case "deref": {
      const ptr = evalExpr(node.expr);
      if (ptr.k === "null") fail("Null dereference");
      if (ptr.k !== "ptr") fail("Not a pointer");
      if (typeof ptr.addr === "object" && ptr.addr.stack) {
        return ptr.addr.frame.locals.get(ptr.addr.name);
      }
      // heap ptr without field — return opaque
      return ptr;
    }
    case "member": {
      const objVal = evalExpr(node.obj);
      if (node.arrow) {
        if (objVal.k === "null") fail("Null -> access");
        if (objVal.k !== "ptr" || typeof objVal.addr !== "string") fail("-> requires pointer");
        const obj = heap.get(objVal.addr);
        if (!obj) fail("Invalid pointer " + objVal.addr);
        return obj.fields[node.field];
      }
      if (objVal.k === "ptr" && typeof objVal.addr === "string") {
        if (objVal.k === "null") fail("Null property access");
        const obj = heap.get(objVal.addr);
        if (!obj) fail("Invalid object reference");
        return obj.fields[node.field];
      }
      // string.length / string.size (property form)
      if (objVal.k === "prim" && typeof objVal.v === "string") {
        if (node.field === "length" || node.field === "size") return VPrim(objVal.v.length);
      }
      fail("Use -> for pointer members (or .length() on string)");
    }
    case "arraylit":
      return VArr(node.items.map((item) => evalExpr(item)));
    case "index": {
      const arr = evalExpr(node.obj);
      const idx = evalExpr(node.index);
      if (arr.k === "arr") return arr.items[idx.v];
      // string[i] → ASCII code (like char → int promotion)
      if (arr.k === "prim" && typeof arr.v === "string") {
        const i = idx.v;
        if (i < 0 || i >= arr.v.length) fail("String index out of range");
        return VPrim(arr.v.charCodeAt(i));
      }
      fail("Not an array");
    }
    case "new": {
      const base = node.typeName.base;
      if (structs.has(base)) {
        const id = alloc(base, defaultFields(base));
        return VPtr(id);
      }
      // new int — allocate box
      const id = alloc(base, { value: VPrim(0) });
      return VPtr(id);
    }
    case "assign": {
      const lv = evalLValue(node.left);
      const rv = evalExpr(node.right);
      writeLValue(lv, rv);
      return rv;
    }
    case "cout": {
      const texts = node.parts.map((p) => {
        const v = evalExpr(p);
        if (v.k === "prim") return String(v.v);
        return describe(v);
      });
      const line = texts.join("");
      stdout.push(line);
      return VPrim(0);
    }
    case "call": {
      // s.length() / s.size()
      if (node.callee) {
        if (node.callee.type === "member" && !node.callee.arrow) {
          const objVal = evalExpr(node.callee.obj);
          if (objVal.k === "prim" && typeof objVal.v === "string") {
            const f = node.callee.field;
            if (f === "length" || f === "size") return VPrim(objVal.v.length);
          }
        }
        fail("Unsupported method call");
      }
      const fn = getUserFunction(node.name);
      if (!fn) fail("Unknown function: " + node.name);

      if (!steppingActive) {
        const frame = { name: fn.name, locals: new Map() };
        callStack.push(frame);
        for (let i = 0; i < fn.params.length; i++) {
          frame.locals.set(fn.params[i].name, evalExpr(node.args[i] || { type: "nullptr" }));
        }
        let ret = VPrim(0);
        try {
          runBlockSync(fn.body);
        } catch (e) {
          if (e && e.__return) ret = e.value;
          else throw e;
        }
        callStack.pop();
        return ret;
      }

      fail("Unexpected call during step — use Step to enter " + node.name + "()");
    }
    case "postop":
    case "preop": {
      // simplified: ++/-- on ident
      const e = node.expr;
      if (e.type === "ident") {
        const v = getVar(e.name);
        const nv = VPrim(v.v + (node.op === "++" ? 1 : -1));
        setVar(e.name, nv);
        return node.type === "preop" ? nv : v;
      }
      return evalExpr(e);
    }
    default:
      fail("Unsupported expression: " + node.type);
  }
  fail("Eval failed for " + node.type);
}

/* Stepping: compile statements into a queue of micro-steps */

function pushSteps(stmts, done) {
  for (const st of stmts) enqueueStmt(st);
  if (done) ipQueue.push(done);
}

let steppingActive = false;

function isUserFunction(name) {
  const prog = window.__cppProgram || window.__activeProgram;
  return !!(prog && prog.functions.some((f) => f.name === name));
}

function expressionHasUserCall(expr) {
  if (!expr) return false;
  if (expr.type === "call" && expr.callee == null && isUserFunction(expr.name)) return true;
  if (expr.type === "assign") return expressionHasUserCall(expr.left) || expressionHasUserCall(expr.right);
  if (expr.type === "binary") return expressionHasUserCall(expr.left) || expressionHasUserCall(expr.right);
  if (expr.type === "unary") return expressionHasUserCall(expr.expr);
  if (expr.type === "deref" || expr.type === "addr") return expressionHasUserCall(expr.expr);
  if (expr.type === "member") return expressionHasUserCall(expr.obj);
  if (expr.type === "index") return expressionHasUserCall(expr.obj) || expressionHasUserCall(expr.index);
  if (expr.type === "postop" || expr.type === "preop") return expressionHasUserCall(expr.expr);
  if (expr.type === "cout") return expr.parts.some(expressionHasUserCall);
  if (expr.type === "call" && expr.callee) return expressionHasUserCall(expr.callee) || expr.args.some(expressionHasUserCall);
  if (expr.type === "arraylit") return expr.items.some(expressionHasUserCall);
  return false;
}

function getUserFunction(name) {
  const prog = window.__cppProgram || window.__activeProgram;
  return prog.functions.find((f) => f.name === name);
}

function markExec(st, label) {
  if (st && st.line) currentLine = st.line;
  const frame = currentFrame();
  const fnTag =
    frame && frame.name !== "<global>" && frame.name !== "main"
      ? " · " + frame.name + "()"
      : "";
  currentSourceLine = (label || currentSourceLine) + fnTag;
}

function skipToFunctionExit(fnName) {
  while (stepIndex < ipQueue.length) {
    const step = ipQueue[stepIndex];
    if (typeof step === "function" && step.__fnExit === fnName) return;
    stepIndex++;
  }
}

function enqueueFunctionCallSteps(callExpr, line, returnHolder, afterSteps) {
  const fn = getUserFunction(callExpr.name);
  if (!fn) return false;

  ipQueue.push(() => {
    markExec({ line: fn.line || line }, "line " + (fn.line || line || "?") + ": call " + fn.name + "()");
    const args = callExpr.args.map((a) => evalExpr(a));
    callStack.push({ name: fn.name, locals: new Map(), returnHolder });
    for (let i = 0; i < fn.params.length; i++) {
      currentFrame().locals.set(fn.params[i].name, args[i] || VNull());
    }
  });

  for (const st of fn.body) enqueueStmt(st);

  const exitStep = () => {
    markExec(null, "exit " + fn.name + "()");
    if (callStack.length > 1) callStack.pop();
  };
  exitStep.__fnExit = fn.name;
  ipQueue.push(exitStep);

  if (afterSteps) afterSteps();
  return true;
}

function enqueueStmt(st) {
  if (!st || st.type === "noop") return;

  if (st.type === "vardecl") {
    if (st.init && st.init.type === "call" && isUserFunction(st.init.name)) {
      const holder = { v: VPrim(0) };
      enqueueFunctionCallSteps(st.init, st.line, holder, () => {
        ipQueue.push(() => {
          markExec(st, "line " + (st.line || "?") + ": declare " + st.name);
          declVar(st.name, holder.v);
        });
      });
      return;
    }
    ipQueue.push(() => {
      markExec(st, "line " + (st.line || "?") + ": declare " + st.name);
      let val = VPrim(0);
      if (st.arraySize != null) {
        val = VArr(Array.from({ length: st.arraySize }, () => VPrim(0)));
      } else if (st.typeName.stars > 0) {
        val = VNull();
      } else if (structs.has(st.typeName.base)) {
        val = VNull();
      }
      if (st.init) val = evalExpr(st.init);
      declVar(st.name, val);
    });
    return;
  }

  if (st.type === "expr") {
    if (st.expr.type === "call" && isUserFunction(st.expr.name)) {
      enqueueFunctionCallSteps(st.expr, st.line, null, null);
      return;
    }
    if (
      st.expr.type === "assign" &&
      st.expr.right.type === "call" &&
      isUserFunction(st.expr.right.name)
    ) {
      const assign = st.expr;
      const holder = { v: VPrim(0) };
      enqueueFunctionCallSteps(assign.right, st.line, holder, () => {
        ipQueue.push(() => {
          markExec(st, "line " + (st.line || "?") + ": assign");
          const lv = evalLValue(assign.left);
          writeLValue(lv, holder.v);
        });
      });
      return;
    }
    ipQueue.push(() => {
      markExec(st, "line " + (st.line || "?") + ": expression");
      evalExpr(st.expr);
    });
    return;
  }

  if (st.type === "return") {
    if (st.value && st.value.type === "call" && isUserFunction(st.value.name)) {
      const holder = { v: VPrim(0) };
      enqueueFunctionCallSteps(st.value, st.line, holder, () => {
        ipQueue.push(() => {
          markExec(st, "line " + (st.line || "?") + ": return");
          const fr = currentFrame();
          if (fr && fr.returnHolder) fr.returnHolder.v = holder.v;
          if (callStack.length > 1) {
            throw { __fnReturn: true, fnName: fr.name, value: holder.v };
          }
          throw { __return: true, value: holder.v };
        });
      });
      return;
    }
    ipQueue.push(() => {
      markExec(st, "line " + (st.line || "?") + ": return");
      const v = st.value ? evalExpr(st.value) : VPrim(0);
      if (callStack.length > 1) {
        const fr = currentFrame();
        if (fr.returnHolder) fr.returnHolder.v = v;
        throw { __fnReturn: true, fnName: fr.name, value: v };
      }
      throw { __return: true, value: v };
    });
    return;
  }

  if (st.type === "if") {
    ipQueue.push(() => {
      markExec(st, "line " + (st.line || "?") + ": if (...)");
      const cond = truthy(evalExpr(st.cond));
      const rest = ipQueue.splice(stepIndex + 1);
      ipQueue.length = stepIndex + 1;
      const branch = cond ? st.then : (st.else || []);
      const saved = stepIndex;
      insertUpcoming(branch, rest);
      stepIndex = saved;
    });
    return;
  }

  if (st.type === "while") {
    ipQueue.push(function whileStep() {
      markExec(st, "line " + (st.line || "?") + ": while (...)");
      if (!truthy(evalExpr(st.cond))) return;
      trackLoopIteration(st);
      const remaining = ipQueue.slice(stepIndex + 1);
      ipQueue.length = stepIndex + 1;
      const bodySteps = [];
      collectSteps(st.body, bodySteps);
      for (const s of bodySteps) ipQueue.push(s);
      ipQueue.push(whileStep);
      for (const s of remaining) ipQueue.push(s);
    });
    return;
  }

  if (st.type === "for") {
    if (st.init) enqueueStmt(st.init);
    ipQueue.push(function forStep() {
      markExec(st, "line " + (st.line || "?") + ": for (...)");
      if (st.cond && !truthy(evalExpr(st.cond))) return;
      trackForIteration(st);
      const remaining = ipQueue.slice(stepIndex + 1);
      ipQueue.length = stepIndex + 1;
      const bodySteps = [];
      collectSteps(st.body, bodySteps);
      for (const s of bodySteps) ipQueue.push(s);
      if (st.upd) {
        ipQueue.push(() => {
          markExec(st, "line " + (st.line || "?") + ": for update");
          evalExpr(st.upd);
        });
      }
      ipQueue.push(forStep);
      for (const s of remaining) ipQueue.push(s);
    });
    return;
  }
}

function collectSteps(stmts, out) {
  const saved = ipQueue;
  ipQueue = out;
  for (const st of stmts) enqueueStmt(st);
  ipQueue = saved;
}

function insertUpcoming(stmts, remainingFns) {
  const remaining = remainingFns || ipQueue.slice(stepIndex + 1);
  ipQueue.length = stepIndex + 1;
  const bodySteps = [];
  collectSteps(stmts, bodySteps);
  for (const s of bodySteps) ipQueue.push(s);
  for (const s of remaining) ipQueue.push(s);
}


function runBlockSync(body) {
  // used for function calls — run without stepping
  for (const st of body) execStmtSync(st);
}

function execStmtSync(st) {
  if (!st || st.type === "noop") return;
  if (st.type === "vardecl") {
    let val = VPrim(0);
    if (st.arraySize != null) val = VArr(Array.from({ length: st.arraySize }, () => VPrim(0)));
    else if (st.typeName.stars > 0) val = VNull();
    if (st.init) val = evalExpr(st.init);
    declVar(st.name, val);
    return;
  }
  if (st.type === "expr") { evalExpr(st.expr); return; }
  if (st.type === "return") {
    throw { __return: true, value: st.value ? evalExpr(st.value) : VPrim(0) };
  }
  if (st.type === "if") {
    if (truthy(evalExpr(st.cond))) st.then.forEach(execStmtSync);
    else if (st.else) st.else.forEach(execStmtSync);
    return;
  }
  if (st.type === "while") {
    let guard = 0;
    while (truthy(evalExpr(st.cond)) && guard++ < 10000) {
      trackLoopIteration(st);
      for (const s of st.body) execStmtSync(s);
    }
    return;
  }
  if (st.type === "for") {
    if (st.init) execStmtSync(st.init);
    let guard = 0;
    while (guard++ < 10000) {
      if (st.cond && !truthy(evalExpr(st.cond))) break;
      trackForIteration(st);
      for (const s of st.body) execStmtSync(s);
      if (st.upd) evalExpr(st.upd);
    }
    return;
  }
}

function prepareProgram(src) {
  resetVm();
  const program = compileSource(src);
  window.__cppProgram = program;
  window.__activeProgram = program;
  structs = program.structs;
  setupProgramEntry(program);
  return program;
}

function stepOnce() {
  if (!ipQueue.length) return { msg: "Nothing to run. Click Run or paste code and Step.", done: true };
  if (stepIndex >= ipQueue.length) return { msg: "Finished.", done: true };
  steppingActive = true;
  try {
    errorLine = 0;
    lastArrayWrite = null;
    ipQueue[stepIndex]();
    stepIndex++;
    const lineTag = currentLine ? ("L" + currentLine + " · ") : "";
    return { msg: lineTag + (currentSourceLine || "step"), done: stepIndex >= ipQueue.length };
  } catch (e) {
    if (e && e.__fnReturn) {
      skipToFunctionExit(e.fnName);
      const lineTag = currentLine ? ("L" + currentLine + " · ") : "";
      return {
        msg: lineTag + "return " + describe(e.value) + " · " + e.fnName + "()",
        done: stepIndex >= ipQueue.length,
      };
    }
    if (e && e.__return) {
      stepIndex = ipQueue.length;
      return { msg: "return " + describe(e.value), done: true };
    }
    return markError(e);
  } finally {
    steppingActive = false;
  }
}

function runAll() {
  while (stepIndex < ipQueue.length) {
    const r = stepOnce();
    if (r.error) return r;
    if (r.done && stepIndex >= ipQueue.length) return { msg: "Finished.", done: true };
  }
  return { msg: "Finished.", done: true };
}
