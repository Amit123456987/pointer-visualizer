/* ========== TOKENIZER ========== */
const KEYWORDS = new Set([
  "int","double","float","bool","char","void","string","long","short",
  "struct","class","public","private","protected","return","if","else",
  "while","for","new","delete","nullptr","NULL","true","false",
  "using","namespace","include","const","static","auto","sizeof",
  "cout","cin","endl","break","continue"
]);

function tokenize(src) {
  // Strip // and /* */ comments, preserve newlines for line numbers
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
    if (c === "#") {
      while (i < n && s[i] !== "\n") i++;
      continue;
    }
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
    if (/[A-Za-z_]/.test(c)) {
      let id = "";
      while (i < n && /[A-Za-z0-9_]/.test(s[i])) id += s[i++];
      if (KEYWORDS.has(id)) push("kw", id);
      else push("id", id);
      continue;
    }
    const two = s.slice(i, i + 2);
    if (["->", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "<<", ">>", "+="].includes(two)) {
      push("op", two);
      i += 2;
      continue;
    }
    if ("(){}[];,.<>*/%+-=!&|?:".includes(c)) {
      push("op", c);
      i++;
      continue;
    }
    throw cppError("Unexpected character: " + c, line);
  }
  tokens.push({ type: "eof", value: "", line: line });
  return tokens;
}
