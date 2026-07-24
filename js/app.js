/* ========== UI ========== */
const statusEl = document.getElementById("status");
const codeEl = document.getElementById("code");
const codeViewEl = document.getElementById("codeView");
const sel = document.getElementById("examples");
const langSel = document.getElementById("language");
const helpEl = document.getElementById("languageHelp");
const programsDialog = document.getElementById("programsDialog");
const programNameInput = document.getElementById("programName");
const programsMessage = document.getElementById("programsMessage");
const programListEl = document.getElementById("programList");
const programsEmpty = document.getElementById("programsEmpty");
const programsLangLabel = document.getElementById("programsLangLabel");
const programTitleInput = document.getElementById("programTitle");
const editorKindBadge = document.getElementById("editorKindBadge");
const editorStats = document.getElementById("editorStats");
const editorDirty = document.getElementById("editorDirty");
const btnSaveCurrent = document.getElementById("btnSaveCurrent");
const btnDeleteCurrent = document.getElementById("btnDeleteCurrent");

let activeProgram = null;
let editorSnapshot = { name: "", code: "", isCustom: false };

function setStatus(msg, err) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", !!err);
}

function showProgramsMessage(msg, kind) {
  if (!msg) {
    programsMessage.hidden = true;
    programsMessage.textContent = "";
    programsMessage.className = "programs-message";
    return;
  }
  programsMessage.hidden = false;
  programsMessage.textContent = msg;
  programsMessage.className = "programs-message " + (kind || "ok");
}

function programLineCount(code) {
  return code ? code.replace(/\r\n/g, "\n").split("\n").length : 0;
}

function isEditorDirty() {
  return codeEl.value !== editorSnapshot.code;
}

function updateEditorChrome() {
  const lines = programLineCount(codeEl.value);
  editorStats.textContent = lines + " line" + (lines === 1 ? "" : "s");
  editorDirty.hidden = !isEditorDirty();

  const isCustom = activeProgram && isCustomProgram(activeProgram);
  editorKindBadge.textContent = isCustom ? "My program" : "Example";
  editorKindBadge.classList.toggle("custom", !!isCustom);
  btnSaveCurrent.textContent = isCustom ? "Save changes" : "Save as mine";
  const canDelete = !!(activeProgram && isCustomProgram(activeProgram));
  if (btnDeleteCurrent) {
    btnDeleteCurrent.disabled = !canDelete;
    btnDeleteCurrent.title = canDelete
      ? 'Delete saved program "' + activeProgram + '"'
      : "Only saved My programs can be deleted";
  }
  const toolbarDelete = document.getElementById("btnDeleteProgram");
  if (toolbarDelete) {
    toolbarDelete.disabled = !canDelete;
    toolbarDelete.title = btnDeleteCurrent ? btnDeleteCurrent.title : "Delete program";
  }

  if (document.activeElement !== programTitleInput) {
    programTitleInput.value = activeProgram || "";
  }
}

function markEditorSnapshot(name, code, isCustom) {
  editorSnapshot = { name: name || "", code: code ?? codeEl.value, isCustom: !!isCustom };
  updateEditorChrome();
}

function applyLanguageUi() {
  const lang = getCurrentLanguage();
  document.title = lang.label + " Program Visualizer";
  document.querySelector(".brand h1").textContent = lang.label + " Program Visualizer";
  document.querySelector(".brand p").textContent =
    "Paste " + lang.label + " — watch variables, pointers, trees, and graphs as it runs";
  if (helpEl) helpEl.innerHTML = lang.helpHtml;
  if (programsLangLabel) programsLangLabel.textContent = lang.label;
  codeEl.setAttribute("aria-label", "Edit " + lang.label + " program");
}

function populateLanguageSelect() {
  if (!langSel) return;
  langSel.replaceChildren();
  for (const lang of Object.values(LANGUAGES)) {
    const opt = document.createElement("option");
    opt.value = lang.id;
    opt.textContent = lang.label;
    langSel.appendChild(opt);
  }
  langSel.value = currentLanguageId;
}

function populateProgramSelect(selected) {
  const { builtin, custom } = getAllProgramNames();
  sel.replaceChildren();

  if (custom.length) {
    const customGroup = document.createElement("optgroup");
    customGroup.label = "My programs";
    for (const name of custom.sort()) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      customGroup.appendChild(opt);
    }
    sel.appendChild(customGroup);
  }

  const builtinGroup = document.createElement("optgroup");
  builtinGroup.label = "Examples";
  for (const name of builtin) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    builtinGroup.appendChild(opt);
  }
  sel.appendChild(builtinGroup);

  const target = selected && getProgramEntry(selected)?.language === currentLanguageId
    ? selected
    : custom[0] ?? builtin[0];
  if (target) sel.value = target;
}

function loadProgram(name) {
  const entry = getProgramEntry(name);
  if (!entry) return;
  if (entry.language !== currentLanguageId) {
    setCurrentLanguage(entry.language);
    if (langSel) langSel.value = entry.language;
    applyLanguageUi();
    populateProgramSelect(name);
  }
  activeProgram = name;
  codeEl.value = entry.code;
  resetVm();
  window.__cppProgram = null;
  window.__activeProgram = null;
  markEditorSnapshot(name, entry.code, isCustomProgram(name));
  const kind = isCustomProgram(name) ? "program" : "example";
  setStatus('Loaded ' + kind + ' "' + name + '" (' + getCurrentLanguage().label + '). Edit, then Run / Step.');
  refresh();
}

function switchLanguage(langId) {
  setCurrentLanguage(langId);
  applyLanguageUi();
  activeProgram = null;
  populateProgramSelect();
  if (programsDialog.open) renderProgramsPanel();
  const first = sel.value;
  if (first) loadProgram(first);
  else {
    codeEl.value = "";
    resetVm();
    window.__cppProgram = null;
    window.__activeProgram = null;
    markEditorSnapshot("", "", false);
    setStatus("Paste a " + getCurrentLanguage().label + " program or load an example, then Run / Step.");
    refresh();
  }
}

function saveCurrentProgram() {
  const name = programTitleInput.value.trim();
  if (!name) {
    setStatus("Enter a program name in the editor header before saving.", true);
    programTitleInput.focus();
    return;
  }
  try {
    const wasCustom = editorSnapshot.isCustom && editorSnapshot.name;
    if (wasCustom && editorSnapshot.name !== name) {
      renameCustomProgram(editorSnapshot.name, name);
    }
    const saved = saveCustomProgram(name, codeEl.value, currentLanguageId);
    activeProgram = saved;
    populateProgramSelect(saved);
    if (programsDialog.open) renderProgramsPanel();
    markEditorSnapshot(saved, codeEl.value, true);
    setStatus('Saved "' + saved + '" (' + getCurrentLanguage().label + ').');
    showProgramsMessage('Saved "' + saved + '".', "ok");
  } catch (err) {
    setStatus(err.message || String(err), true);
    showProgramsMessage(err.message || String(err), "err");
  }
}

function confirmAndDeleteProgram(name) {
  if (!name) return false;

  if (!isCustomProgram(name)) {
    window.alert(
      '"' + name + '" is a built-in example and cannot be deleted.\n\nSave a copy with "Save as mine" if you want a removable program.'
    );
    return false;
  }

  const ok = window.confirm(
    'Delete saved program "' + name + '"?\n\nThis cannot be undone.'
  );
  if (!ok) return false;

  deleteCustomProgram(name);

  if (activeProgram === name) {
    activeProgram = null;
    const { builtin, custom } = getAllProgramNames();
    const next = custom[0] ?? builtin[0];
    if (next) {
      loadProgram(next);
      populateProgramSelect(next);
    } else {
      codeEl.value = "";
      programTitleInput.value = "";
      markEditorSnapshot("", "", false);
      populateProgramSelect();
      renderCodeHighlight();
      resetVm();
      refresh();
    }
  } else {
    populateProgramSelect(activeProgram);
  }

  if (programsDialog.open) renderProgramsPanel();
  showProgramsMessage('Deleted "' + name + '".', "ok");
  setStatus('Deleted program "' + name + '".');
  updateEditorChrome();
  return true;
}

function deleteActiveProgram() {
  const name = activeProgram || (sel && sel.value) || "";
  if (!name) {
    setStatus("Select a program to delete first.", true);
    return;
  }
  if (!activeProgram) activeProgram = name;
  confirmAndDeleteProgram(name);
}

function renderProgramsPanel() {
  const custom = Object.entries(loadCustomPrograms())
    .filter(([, entry]) => entry.language === currentLanguageId)
    .sort(([a], [b]) => a.localeCompare(b));

  programListEl.replaceChildren();
  programsEmpty.hidden = custom.length > 0;

  for (const [name, entry] of custom) {
    const item = document.createElement("article");
    item.className = "program-item" + (activeProgram === name ? " active" : "");

    const main = document.createElement("button");
    main.type = "button";
    main.className = "program-item-main";
    main.innerHTML =
      '<span class="program-item-name">' + escapeHtml(name) + "</span>" +
      '<span class="program-item-meta">' + programLineCount(entry.code) + " lines · click to open in editor</span>";
    main.addEventListener("click", () => {
      loadProgram(name);
      populateProgramSelect(name);
      renderProgramsPanel();
      programsDialog.close();
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "program-item-delete";
    del.title = 'Delete "' + name + '"';
    del.setAttribute("aria-label", 'Delete "' + name + '"');
    del.textContent = "Delete";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmAndDeleteProgram(name);
    });

    item.append(main, del);
    programListEl.appendChild(item);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openProgramsPanel() {
  showProgramsMessage("");
  programNameInput.value = programTitleInput.value.trim();
  applyLanguageUi();
  renderProgramsPanel();
  programsDialog.showModal();
  programNameInput.focus();
}

function addProgramFromEditor() {
  showProgramsMessage("");
  const name = programNameInput.value.trim();
  if (!name) {
    showProgramsMessage("Enter a name for your program.", "err");
    programNameInput.focus();
    return;
  }
  programTitleInput.value = name;
  saveCurrentProgram();
}

populateLanguageSelect();
applyLanguageUi();
try {
  localStorage.removeItem("pv-hidden-builtin-programs");
} catch (_) {}
populateProgramSelect();
sel.addEventListener("change", () => loadProgram(sel.value));
if (langSel) langSel.addEventListener("change", () => switchLanguage(langSel.value));

document.getElementById("btnPrograms").addEventListener("click", openProgramsPanel);
document.getElementById("btnClosePrograms").addEventListener("click", () => programsDialog.close());
document.getElementById("btnAddProgram").addEventListener("click", addProgramFromEditor);
btnSaveCurrent.addEventListener("click", saveCurrentProgram);
if (btnDeleteCurrent) {
  btnDeleteCurrent.addEventListener("click", deleteActiveProgram);
}
const btnDeleteProgram = document.getElementById("btnDeleteProgram");
if (btnDeleteProgram) {
  btnDeleteProgram.addEventListener("click", deleteActiveProgram);
}

(function wireSoundVolume() {
  const slider = document.getElementById("soundVolume");
  if (!slider || typeof getSoundVolume !== "function") return;
  slider.value = String(Math.round(getSoundVolume() * 100));
  const apply = () => {
    if (typeof initSounds === "function") initSounds();
    if (typeof setSoundVolume === "function") setSoundVolume(Number(slider.value) / 100);
  };
  slider.addEventListener("input", apply);
  slider.addEventListener("change", apply);
})();

programNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addProgramFromEditor();
  }
});

programTitleInput.addEventListener("input", updateEditorChrome);

function startFromEditor() {
  if (typeof initSounds === "function") initSounds();
  prepareProgram(codeEl.value);
}

function handleResult(r) {
  if (r && r.error) {
    setStatus(r.msg, true);
  } else {
    setStatus(r.msg, false);
  }
}

function handleException(e) {
  const r = markError(e);
  setStatus(r.msg, true);
}

document.getElementById("btnRun").addEventListener("click", () => {
  try {
    startFromEditor();
    const r = runAll();
    handleResult(r);
  } catch (e) {
    handleException(e);
  }
  refresh();
});

document.getElementById("btnStep").addEventListener("click", () => {
  try {
    if (typeof initSounds === "function") initSounds();
    if (!window.__cppProgram || stepIndex >= ipQueue.length) startFromEditor();
    const r = stepOnce();
    handleResult(r);
  } catch (e) {
    handleException(e);
  }
  refresh();
});

document.getElementById("btnReset").addEventListener("click", () => {
  resetVm();
  window.__cppProgram = null;
  window.__activeProgram = null;
  setStatus("Reset. Press Run or Step.");
  refresh();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
    refresh();
  });
});

document.querySelector(".stage").addEventListener("click", (e) => {
  const btn = e.target.closest(".histogram-toggle");
  if (!btn) return;
  e.preventDefault();
  const key = btn.getAttribute("data-hist-key");
  if (!key || typeof toggleHistogramMode !== "function") return;
  toggleHistogramMode(key);
  refresh();
});

codeEl.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const s = codeEl.selectionStart, en = codeEl.selectionEnd;
    codeEl.value = codeEl.value.slice(0, s) + "    " + codeEl.value.slice(en);
    codeEl.selectionStart = codeEl.selectionEnd = s + 4;
    renderCodeHighlight();
    updateEditorChrome();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveCurrentProgram();
  }
});

codeEl.addEventListener("input", () => {
  if (!window.__cppProgram) {
    currentLine = 0;
    errorLine = 0;
  }
  renderCodeHighlight();
  updateEditorChrome();
});

codeEl.addEventListener("scroll", () => {
  if (typeof syncEditorScroll === "function") syncEditorScroll();
});

loadProgram(sel.value || Object.keys(getLanguageExamples())[0]);
