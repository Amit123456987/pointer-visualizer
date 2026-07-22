/* ========== CUSTOM PROGRAMS (localStorage) ========== */
const PROGRAMS_STORAGE_KEY = "cppVisualizerCustomPrograms";

function loadCustomProgramsRaw() {
  try {
    const raw = localStorage.getItem(PROGRAMS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeProgramEntry(entry, fallbackLanguage) {
  if (typeof entry === "string") {
    return { code: entry, language: fallbackLanguage || "cpp" };
  }
  if (entry && typeof entry === "object" && typeof entry.code === "string") {
    return {
      code: entry.code,
      language: entry.language || fallbackLanguage || "cpp",
    };
  }
  return null;
}

function loadCustomPrograms() {
  const raw = loadCustomProgramsRaw();
  const out = {};
  for (const [name, entry] of Object.entries(raw)) {
    const normalized = normalizeProgramEntry(entry);
    if (normalized) out[name] = normalized;
  }
  return out;
}

function saveCustomPrograms(programs) {
  localStorage.setItem(PROGRAMS_STORAGE_KEY, JSON.stringify(programs));
}

function getCustomProgram(name) {
  return loadCustomPrograms()[name] ?? null;
}

function saveCustomProgram(name, code, language) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Program name cannot be empty.");
  if (isBuiltinProgram(trimmed, language || currentLanguageId)) {
    throw new Error("That name is reserved for a built-in example.");
  }
  const programs = loadCustomPrograms();
  programs[trimmed] = { code, language: language || currentLanguageId };
  saveCustomPrograms(programs);
  return trimmed;
}

function deleteCustomProgram(name) {
  const programs = loadCustomPrograms();
  if (!(name in programs)) return false;
  delete programs[name];
  saveCustomPrograms(programs);
  return true;
}

function renameCustomProgram(oldName, newName) {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Program name cannot be empty.");
  const programs = loadCustomPrograms();
  const entry = programs[oldName];
  if (!entry) throw new Error("Program not found.");
  if (isBuiltinProgram(trimmed, entry.language)) {
    throw new Error("That name is reserved for a built-in example.");
  }
  if (trimmed !== oldName && trimmed in programs) throw new Error("A program with that name already exists.");
  programs[trimmed] = entry;
  if (trimmed !== oldName) delete programs[oldName];
  saveCustomPrograms(programs);
  return trimmed;
}

function isBuiltinProgram(name, langId) {
  const examples = getLanguageExamples(langId || currentLanguageId);
  return Object.prototype.hasOwnProperty.call(examples, name);
}

function isCustomProgram(name) {
  return Object.prototype.hasOwnProperty.call(loadCustomPrograms(), name);
}

function getProgramEntry(name) {
  const custom = getCustomProgram(name);
  if (custom) return custom;
  for (const lang of Object.values(LANGUAGES)) {
    if (Object.prototype.hasOwnProperty.call(lang.examples, name)) {
      return { code: lang.examples[name], language: lang.id };
    }
  }
  return null;
}

function getProgramCode(name) {
  return getProgramEntry(name)?.code ?? null;
}

function getAllProgramNames(langId) {
  const language = langId || currentLanguageId;
  const custom = Object.entries(loadCustomPrograms())
    .filter(([, entry]) => entry.language === language)
    .map(([name]) => name);
  const hidden = getHiddenBuiltins(language);
  const builtin = Object.keys(getLanguageExamples(language)).filter(
    (name) => !hidden.has(name)
  );
  return { builtin, custom };
}

const HIDDEN_BUILTINS_KEY = "pv-hidden-builtin-programs";

function loadHiddenBuiltinsRaw() {
  try {
    const raw = localStorage.getItem(HIDDEN_BUILTINS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveHiddenBuiltinsRaw(data) {
  localStorage.setItem(HIDDEN_BUILTINS_KEY, JSON.stringify(data));
}

function getHiddenBuiltins(langId) {
  const language = langId || currentLanguageId;
  const raw = loadHiddenBuiltinsRaw();
  const list = Array.isArray(raw[language]) ? raw[language] : [];
  return new Set(list.filter((n) => typeof n === "string"));
}

function hideBuiltinProgram(name, langId) {
  const language = langId || currentLanguageId;
  const raw = loadHiddenBuiltinsRaw();
  const list = Array.isArray(raw[language]) ? raw[language].slice() : [];
  if (!list.includes(name)) list.push(name);
  raw[language] = list;
  saveHiddenBuiltinsRaw(raw);
  return true;
}

function unhideBuiltinProgram(name, langId) {
  const language = langId || currentLanguageId;
  const raw = loadHiddenBuiltinsRaw();
  const list = Array.isArray(raw[language]) ? raw[language].slice() : [];
  raw[language] = list.filter((n) => n !== name);
  saveHiddenBuiltinsRaw(raw);
}
