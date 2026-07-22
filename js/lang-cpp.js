/* ========== C++ LANGUAGE ========== */
registerLanguage({
  id: "cpp",
  label: "C++",
  sourceLabel: "C++ source",
  nullLabel: "nullptr",
  entryPoint: "main",
  entryHint: "Entry point must be int main() { ... }.",
  tokenize,
  parse,
  examples: typeof EXAMPLES !== "undefined" ? EXAMPLES : {},
  helpHtml:
    '<strong>Supported C++ subset:</strong> ' +
    'structs/classes · pointers (<code style="color:var(--pointer)">*</code>, <code style="color:var(--pointer)">&amp;</code>, <code style="color:var(--pointer)">-&gt;</code>) · ' +
    '<code style="color:var(--value)">new</code>/<code style="color:var(--value)">nullptr</code> · ' +
    '<code style="color:var(--value)">for</code>/<code style="color:var(--value)">while</code>/<code style="color:var(--value)">if</code> · ' +
    'functions + <code style="color:var(--value)">main</code> · arrays · ' +
    '<code style="color:var(--value)">cout</code> · ints/doubles/bools/strings. ' +
    "STL containers, templates, and full OOP are not simulated.",
  syntax: {
    ctrlKeywords: new Set([
      "return", "if", "else", "while", "for", "new", "delete", "break", "continue",
      "using", "namespace", "const", "static", "auto", "sizeof", "public", "private",
      "protected", "struct", "class", "true", "false", "nullptr", "NULL",
    ]),
    typeKeywords: new Set([
      "int", "double", "float", "bool", "char", "void", "string", "long", "short",
    ]),
    streamIds: new Set(["cout", "cin", "endl", "std", "iostream"]),
    ptrOps: ["->", "*", "&"],
    declPattern: /\b([A-Za-z_]\w*)\s*\*?\s+([A-Za-z_]\w*)\s*(?:[=;\[,\(])/g,
    structPattern: /\b(?:struct|class)\s+([A-Za-z_]\w*)/g,
  },
});
