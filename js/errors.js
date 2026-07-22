/* ========== ERRORS ========== */
/** Create an Error tagged with a 1-based source line. */
function cppError(message, line) {
  const lineNum = line || (typeof currentLine !== "undefined" ? currentLine : 0) || 0;
  const prefix = lineNum ? "Line " + lineNum + ": " : "";
  const e = new Error(prefix + message);
  e.line = lineNum;
  return e;
}

function fail(message, line) {
  throw cppError(message, line);
}

function lineFromError(e) {
  if (!e) return 0;
  if (e.line) return e.line;
  const m = String(e.message || e).match(/\b[Ll]ine\s+(\d+)\b/);
  return m ? Number(m[1]) : 0;
}
