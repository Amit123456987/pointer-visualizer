/* ========== LANGUAGE REGISTRY ========== */
const LANGUAGES = {};
let currentLanguageId = "cpp";

function registerLanguage(def) {
  if (!def.id || !def.label || !def.tokenize || !def.parse) {
    throw new Error("Language definition must include id, label, tokenize, and parse.");
  }
  LANGUAGES[def.id] = {
    nullLabel: "nullptr",
    entryPoint: "main",
    entryHint: "Add a main() function.",
    sourceLabel: "Source",
    ...def,
    examples: def.examples || {},
  };
}

function getLanguage(id) {
  const lang = LANGUAGES[id];
  if (!lang) throw new Error("Unknown language: " + id);
  return lang;
}

function getCurrentLanguage() {
  return getLanguage(currentLanguageId);
}

function setCurrentLanguage(id) {
  getLanguage(id);
  currentLanguageId = id;
  if (typeof window !== "undefined") window.__programLanguage = id;
}

function getLanguageExamples(langId) {
  return getLanguage(langId || currentLanguageId).examples;
}

function compileSource(src, langId) {
  const lang = getLanguage(langId || currentLanguageId);
  const tokens = lang.tokenize(src);
  return lang.parse(tokens);
}

function setupProgramEntry(program, langId) {
  const lang = getLanguage(langId || currentLanguageId);
  const entry = lang.entryPoint;

  callStack.push(makeCallFrame("<global>", { locals: globals }));
  for (const st of program.statements) enqueueStmt(st);

  const main = program.functions.find((f) => f.name === entry);
  if (main) {
    ipQueue.push(() => {
      currentLine = main.line || currentLine;
      currentSourceLine = "line " + (main.line || "?") + ": enter " + entry + "()";
      callStack.push(
        makeCallFrame(entry, {
          paramNames: (main.params || []).map((p) => p.name),
        })
      );
    });
    for (const st of main.body) enqueueStmt(st);
    ipQueue.push(() => {
      currentSourceLine = "exit " + entry + "()";
      if (callStack.length > 1) callStack.pop();
    });
    return;
  }

  if (!program.functions.length && !program.statements.length) {
    fail("No code found. " + lang.entryHint);
  }
  if (!main && program.functions.length) {
    fail("No " + entry + "() found. " + lang.entryHint);
  }
}
