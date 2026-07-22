/* ========== SYNTAX HIGHLIGHT ========== */
function synEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSyntaxConfig() {
  const lang = getCurrentLanguage();
  return lang.syntax || {
    ctrlKeywords: CTRL_KEYWORDS,
    typeKeywords: TYPE_KEYWORDS,
    streamIds: STREAM_IDS,
    ptrOps: ["->", "*", "&"],
    declPattern: /\b([A-Za-z_]\w*)\s*\*?\s+([A-Za-z_]\w*)\s*(?:[=;\[,\(])/g,
    structPattern: /\b(?:struct|class)\s+([A-Za-z_]\w*)/g,
  };
}

const CTRL_KEYWORDS = new Set([
  "return", "if", "else", "while", "for", "new", "delete", "break", "continue",
  "using", "namespace", "const", "static", "auto", "sizeof", "public", "private",
  "protected", "struct", "class", "true", "false", "nullptr", "NULL",
]);

const TYPE_KEYWORDS = new Set([
  "int", "double", "float", "bool", "char", "void", "string", "long", "short",
]);

const STREAM_IDS = new Set(["cout", "cin", "endl", "std", "iostream"]);

/** Collect known variable / type names from source text and the running VM. */
function collectHighlightNames(src) {
  const cfg = getSyntaxConfig();
  const vars = new Set();
  const types = new Set(cfg.typeKeywords);

  if (src) {
    let m;
    const structRe = cfg.structPattern;
    while ((m = structRe.exec(src))) types.add(m[1]);

    const declRe = cfg.declPattern;
    while ((m = declRe.exec(src))) {
      if (cfg.declPattern.source.includes("let|const|var")) {
        vars.add(m[1]);
      } else {
        const t = m[1];
        const v = m[2];
        if (cfg.ctrlKeywords.has(t) || cfg.streamIds.has(t)) continue;
        if (cfg.typeKeywords.has(t) || types.has(t) || /^[A-Z]/.test(t)) {
          types.add(t);
          if (!cfg.ctrlKeywords.has(v) && !cfg.typeKeywords.has(v) && v !== "main") vars.add(v);
        }
      }
    }
  }

  try {
    if (typeof callStack !== "undefined" && callStack) {
      for (const fr of callStack) {
        for (const name of fr.locals.keys()) vars.add(name);
      }
    }
    if (typeof structs !== "undefined" && structs) {
      for (const name of structs.keys()) types.add(name);
    }
  } catch (_) {}

  return { vars, types, cfg };
}

/** Highlight one source line into colored HTML spans. */
function highlightLineHtml(line, names) {
  if (!line) return " ";
  const vars = names.vars;
  const types = names.types;
  const cfg = names.cfg || getSyntaxConfig();
  const ctrlKeywords = cfg.ctrlKeywords;
  const typeKeywords = cfg.typeKeywords;
  const streamIds = cfg.streamIds;
  const ptrOps = cfg.ptrOps || ["->", "*", "&"];
  let i = 0;
  const n = line.length;
  let out = "";

  const push = (cls, text) => {
    out += '<span class="' + cls + '">' + synEscape(text) + "</span>";
  };

  while (i < n) {
    const c = line[i];

    if (/\s/.test(c)) {
      let ws = "";
      while (i < n && /\s/.test(line[i])) ws += line[i++];
      out += synEscape(ws);
      continue;
    }

    if (c === "/" && line[i + 1] === "/") {
      push("tok-comment", line.slice(i));
      break;
    }

    if (c === "/" && line[i + 1] === "*") {
      let j = i + 2;
      while (j < n - 1 && !(line[j] === "*" && line[j + 1] === "/")) j++;
      if (j < n - 1) j += 2;
      else j = n;
      push("tok-comment", line.slice(i, j));
      i = j;
      continue;
    }

    if (c === "#") {
      push("tok-pre", line.slice(i));
      break;
    }

    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < n && line[j] !== q) {
        if (line[j] === "\\" && j + 1 < n) j += 2;
        else j++;
      }
      if (j < n) j++;
      push("tok-str", line.slice(i, j));
      i = j;
      continue;
    }

    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(line[i + 1] || ""))) {
      let j = i;
      while (j < n && /[0-9.xXa-fA-F]/.test(line[j])) j++;
      push("tok-num", line.slice(i, j));
      i = j;
      continue;
    }

    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      let k = j;
      while (k < n && /\s/.test(line[k])) k++;
      const isCall = line[k] === "(";

      let cls = "tok-ident";
      if (ctrlKeywords.has(word)) cls = "tok-kw";
      else if (typeKeywords.has(word) || types.has(word)) cls = "tok-type";
      else if (streamIds.has(word)) cls = "tok-kw";
      else if (isCall) cls = "tok-fn";
      else if (vars.has(word)) cls = "tok-var";
      else if (/^[A-Z]/.test(word)) cls = "tok-type";
      else cls = "tok-var";

      push(cls, word);
      i = j;
      continue;
    }

    const two = line.slice(i, i + 2);
    if (["->", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "<<", ">>", "+="].includes(two)) {
      push(ptrOps.includes(two) ? "tok-ptr" : "tok-op", two);
      i += 2;
      continue;
    }

    if ("(){}[];,.<>*/%+-=!&|?:".includes(c)) {
      if (ptrOps.includes(c)) push("tok-ptr", c);
      else push("tok-op", c);
      i++;
      continue;
    }

    out += synEscape(c);
    i++;
  }

  return out || " ";
}
