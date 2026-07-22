/* ========== RENDER ========== */
function escapeXml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function renderCodeHighlight() {
  const view = document.getElementById("codeView");
  if (!view || !codeEl) return;
  const lines = codeEl.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const names =
    typeof collectHighlightNames === "function"
      ? collectHighlightNames(codeEl.value)
      : { vars: new Set(), types: new Set() };
  view.innerHTML = lines
    .map((text, i) => {
      const n = i + 1;
      const isErr = errorLine && errorLine === n;
      const isActive = !isErr && currentLine === n;
      let cls = "code-line";
      if (isErr) cls += " error";
      else if (isActive) cls += " active";
      const highlighted =
        typeof highlightLineHtml === "function" ? highlightLineHtml(text, names) : escapeXml(text) || " ";
      return (
        '<div class="' +
        cls +
        '" data-line="' +
        n +
        '"><span class="ln">' +
        n +
        '</span><span class="tx">' +
        highlighted +
        "</span></div>"
      );
    })
    .join("");
  const focusEl = view.querySelector(".code-line.error") || view.querySelector(".code-line.active");
  if (focusEl && typeof focusEl.scrollIntoView === "function") {
    focusEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  syncEditorScroll();
}

function syncEditorScroll(fromTextarea) {
  const view = document.getElementById("codeView");
  if (!view || !codeEl) return;
  if (fromTextarea !== false) {
    view.scrollTop = codeEl.scrollTop;
    view.scrollLeft = codeEl.scrollLeft;
  }
}

function renderVarRow(name, val, frameName, roleOverride) {
  const isIter = typeof isActiveIteratorVar === "function" && isActiveIteratorVar(name);
  const isSrc =
    iterationStack.some((it) => it.source === name) ||
    (iterationInfo && name === iterationInfo.source);
  const isElem = iterationInfo && iterationInfo.elementVar && name === iterationInfo.elementVar;
  const isArr = val.k === "arr";
  let cls = "var-row";
  if (roleOverride === "arg") cls += " var-arg";
  if (isIter || isElem) cls += " highlight";
  else if (isSrc) cls += " source-hl";
  else if (isArr) cls += " array-row";
  const kind = val.k === "ptr" ? "pointer" : val.k === "arr" ? "array" : val.k === "null" ? "null" : "value";
  let role = roleOverride || kind;
  if (!roleOverride) {
    if (isIter) role = "iterates";
    else if (isSrc) role = "over";
    else if (isElem) role = "element";
  }
  const valCls = val.k === "ptr" ? "var-val ptr" : "var-val";
  let valHtml = escapeXml(describe(val));
  if (isArr && val.items.length <= 16) {
    valHtml =
      '<span class="inline-array">' +
      val.items.map((it, i) => {
        const markers =
          typeof arrayIteratorsFor === "function"
            ? arrayIteratorsFor(name, val.items.length).filter((m) => m.index === i)
            : [];
        const isWrite =
          typeof isLastArrayWrite === "function"
            ? isLastArrayWrite(val, i, name, frameName)
            : lastArrayWrite &&
              lastArrayWrite.name === name &&
              lastArrayWrite.index === i &&
              lastArrayWrite.frame === frameName;
        const title = markers.length
          ? markers.map((m) => m.varName).join(", ")
          : isWrite
            ? "wrote [" + i + "]"
            : "";
        let cellCls = "inline-array-cell";
        if (isWrite) cellCls += " updated";
        else if (markers.length) cellCls += " hot";
        return (
          '<span class="' +
          cellCls +
          '"' +
          (title ? ' title="' + escapeXml(title) + '"' : "") +
          (isWrite ? ' data-arr-write="1"' : "") +
          ">" +
          (isWrite ? '<span class="inline-idx">[' + i + "]</span>" : "") +
          escapeXml(describe(it)) +
          "</span>"
        );
      }).join("") +
      "</span>";
  }
  return (
    '<div class="' + cls + '"><span class="var-name">' + escapeXml(name) +
    '</span><span class="' + valCls + '">' + valHtml +
    '</span><span class="var-kind">' + role + "</span></div>"
  );
}

/** Persist expand/collapse across Step refreshes */
let callStackUi = { collapsed: new Set(), expanded: new Set() };

function resetCallStackUi() {
  callStackUi = { collapsed: new Set(), expanded: new Set() };
}

function callFrameKey(depth, name) {
  return depth + ":" + name;
}

function isCallFrameExpanded(key, isActive) {
  if (callStackUi.collapsed.has(key)) return false;
  if (callStackUi.expanded.has(key)) return true;
  return true; // default open so args/locals are visible; click to collapse
}

function toggleCallFrame(key) {
  if (isCallFrameExpanded(key, false) || callStackUi.expanded.has(key)) {
    callStackUi.expanded.delete(key);
    callStackUi.collapsed.add(key);
  } else {
    callStackUi.collapsed.delete(key);
    callStackUi.expanded.add(key);
  }
}

function frameSignatureHtml(fr) {
  const params = fr.paramNames || [];
  if (!params.length) return '<span class="frame-fn">' + escapeXml(fr.name) + "</span>()";
  const parts = params.map((p) => {
    const cur = fr.locals.has(p) ? fr.locals.get(p) : null;
    return (
      '<span class="frame-arg-name">' +
      escapeXml(p) +
      '</span>=<span class="frame-arg-val">' +
      escapeXml(cur ? describe(cur) : "?") +
      "</span>"
    );
  });
  return '<span class="frame-fn">' + escapeXml(fr.name) + "</span>(" + parts.join(", ") + ")";
}

function renderCallFrame(fr, depth, isActive) {
  const key = callFrameKey(depth, fr.name);
  const expanded = isCallFrameExpanded(key, isActive);
  const paramSet = new Set(fr.paramNames || []);
  const args = [];
  const locals = [];
  for (const [name, val] of fr.locals) {
    if (paramSet.has(name)) args.push([name, val]);
    else locals.push([name, val]);
  }

  let body = "";
  if (expanded) {
    if (args.length) {
      body += '<div class="frame-section-label">Arguments</div>';
      for (const [name, val] of args) {
        body += renderVarRow(name, val, fr.name, "arg");
      }
    }
    if (locals.length) {
      body += '<div class="frame-section-label">Locals</div>';
      for (const [name, val] of locals) {
        body += renderVarRow(name, val, fr.name);
      }
    }
    if (fr.didReturn && fr.returnHolder && fr.returnHolder.v != null) {
      body +=
        '<div class="frame-section-label">Return</div>' +
        '<div class="var-row var-return"><span class="var-name">return</span><span class="var-val">' +
        escapeXml(describe(fr.returnHolder.v)) +
        '</span><span class="var-kind">return</span></div>';
    }
    if (!args.length && !locals.length && !(fr.didReturn && fr.returnHolder)) {
      body += '<div class="frame-empty">No arguments or locals</div>';
    }
  }

  return (
    '<div class="frame-block' +
    (isActive ? " frame-active" : "") +
    (fr.name === "<global>" ? " frame-global" : "") +
    (expanded ? " frame-expanded" : " frame-collapsed") +
    '" data-frame-key="' +
    escapeXml(key) +
    '">' +
    '<button type="button" class="frame-header" data-frame-toggle="' +
    escapeXml(key) +
    '" aria-expanded="' +
    (expanded ? "true" : "false") +
    '">' +
    '<span class="frame-chevron" aria-hidden="true">' +
    (expanded ? "▾" : "▸") +
    "</span>" +
    '<span class="frame-sig">' +
    frameSignatureHtml(fr) +
    "</span>" +
    '<span class="frame-depth">#' +
    depth +
    "</span>" +
    (isActive ? '<span class="frame-active-tag">executing</span>' : "") +
    "</button>" +
    (expanded ? '<div class="frame-body">' + body + "</div>" : "") +
    "</div>"
  );
}

function wireCallStackUi(root) {
  if (!root) return;
  root.querySelectorAll("[data-frame-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const key = btn.getAttribute("data-frame-toggle");
      if (!key) return;
      const wasExpanded = btn.getAttribute("aria-expanded") === "true";
      if (wasExpanded) {
        callStackUi.expanded.delete(key);
        callStackUi.collapsed.add(key);
      } else {
        callStackUi.collapsed.delete(key);
        callStackUi.expanded.add(key);
      }
      if (typeof refresh === "function") refresh();
    });
  });
}

function renderMemory(into) {
  let framesHtml = "";
  const frames = callStack.length ? callStack : [];
  const activeFrame = frames.length ? frames[frames.length - 1] : null;

  if (!frames.length) {
    framesHtml = '<div class="frame-empty">Call stack empty — Run or Step a program</div>';
  } else {
    framesHtml += '<div class="call-stack-list">';
    for (let i = 0; i < frames.length; i++) {
      const fr = frames[i];
      if (fr.name === "<global>" && (!fr.locals || !fr.locals.size)) continue;
      const isActive = fr === activeFrame && fr.name !== "<global>";
      framesHtml += renderCallFrame(fr, i, isActive);
    }
    framesHtml += "</div>";
  }

  let heapHtml = "";
  for (const [, o] of heap) {
    const parts = Object.entries(o.fields).map(([k, v]) => k + "=" + describe(v));
    const onIter =
      iterationInfo && iterationInfo.current && iterationInfo.current.id === o.id;
    heapHtml +=
      '<div class="var-row' + (onIter ? " highlight" : "") + '"><span class="var-name">' + escapeXml(o.id) +
      '</span><span class="var-val">' + escapeXml(o.typeName + " { " + parts.join(", ") + " }") +
      '</span><span class="var-kind">' + (onIter ? "current" : "heap") + "</span></div>";
  }
  if (!heapHtml) heapHtml = '<div class="empty-state" style="padding:1rem;font-size:0.78rem">Heap empty — allocate with <code>new</code></div>';

  const overlay = renderIterationOverlay();

  const out =
    stdout.length > 0
      ? '<div class="iter-box" style="grid-column:1/-1;border-top-color:color-mix(in srgb,var(--value) 50%,transparent)">' +
        '<div class="box-title">Output</div>' +
        '<pre class="cout-pre">' + escapeXml(stdout.join("\n")) + "</pre></div>"
      : "";

  const errBanner = errorLine
    ? '<div class="step-line" style="border-color:color-mix(in srgb,var(--danger) 45%,var(--stroke));background:color-mix(in srgb,var(--danger) 14%,var(--bg-panel))">' +
      '<strong style="color:var(--danger)">Error on line ' +
      errorLine +
      "</strong> · " +
      escapeXml(lastError || "error") +
      "</div>"
    : "";

  const stepBanner =
    !errorLine && currentSourceLine
      ? '<div class="step-line">' +
        (currentLine ? '<strong style="color:var(--accent)">Line ' + currentLine + "</strong> · " : "") +
        escapeXml(currentSourceLine) +
        "</div>"
      : "";

  const liveStructures = typeof renderLiveStructures === "function" ? renderLiveStructures() : "";

  into.innerHTML =
    '<div class="legend"><span class="l-val">Values</span><span class="l-ptr">Pointers</span><span class="l-iter">Iterator / updated</span></div>' +
    errBanner +
    stepBanner +
    (liveStructures ? '<div style="grid-column:1/-1">' + liveStructures + "</div>" : "") +
    '<div class="memory-grid">' +
    (overlay ? '<div style="grid-column:1/-1">' + overlay + "</div>" : "") +
    '<div class="stack-box"><div class="box-title">Call stack</div>' +
    '<p class="stack-hint">Click a frame to expand arguments and locals</p>' +
    framesHtml + '</div><div class="heap-box"><div class="box-title">Heap (new objects)</div>' +
    heapHtml + "</div>" + out + "</div>";

  wireCallStackUi(into);
}

function emptyStateHtml(message) {
  return '<div class="empty-state">' + message + "</div>";
}

function svgDefs() {
  return (
    "<defs>" +
    '<linearGradient id="nodeGrad" x1="0%" y1="0%" x2="0%" y2="100%">' +
    '<stop offset="0%" stop-color="#333"/><stop offset="100%" stop-color="#252525"/>' +
    "</linearGradient>" +
    '<linearGradient id="ptrGrad" x1="0%" y1="0%" x2="0%" y2="100%">' +
    '<stop offset="0%" stop-color="#ffb0c8"/><stop offset="100%" stop-color="#f48fb1"/>' +
    "</linearGradient>" +
    '<filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">' +
    '<feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.25"/>' +
    "</filter>" +
    '<filter id="ptrGlow" x="-50%" y="-50%" width="200%" height="200%">' +
    '<feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#f48fb1" flood-opacity="0.55"/>' +
    "</filter>" +
    '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb74d"/></marker>' +
    '<marker id="arrow-iter" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="#f48fb1"/></marker>' +
    "</defs>"
  );
}

function svgNodeRect(x, y, w, h, label, opts) {
  const hl = opts && opts.highlight;
  const stroke = hl ? "#f48fb1" : (opts && opts.stroke) || "#a8c7fa";
  const filter = ' filter="url(#softShadow)"';
  const sw = hl ? 2 : 1.5;
  return (
    '<rect x="' + (x - w / 2) + '" y="' + (y - h / 2) + '" width="' + w + '" height="' + h + '" rx="8" fill="url(#nodeGrad)" stroke="' + stroke + '" stroke-width="' + sw + '"' + filter + "/>" +
    '<text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" fill="#e3e3e3" font-size="12" font-family="Roboto Mono" font-weight="500">' + escapeXml(label) + "</text>"
  );
}

function svgEdge(x1, y1, x2, y2, label, hl, edgeKey) {
  const stroke = hl ? "#f48fb1" : "#ffb74d";
  const marker = hl ? "url(#arrow-iter)" : "url(#arrow)";
  const edgeAttr = edgeKey ? ' data-edge="' + escapeXml(edgeKey) + '"' : "";
  return (
    "<line" +
    edgeAttr +
    ' x1="' +
    x1 +
    '" y1="' +
    y1 +
    '" x2="' +
    x2 +
    '" y2="' +
    y2 +
    '" stroke="' +
    stroke +
    '" stroke-width="2" stroke-linecap="round" marker-end="' +
    marker +
    '"/>' +
    (label
      ? '<text x="' +
        (x1 + x2) / 2 +
        '" y="' +
        ((y1 + y2) / 2 - 6) +
        '" fill="#9e9e9e" font-size="10" font-family="Roboto Mono" text-anchor="middle">' +
        escapeXml(label) +
        "</text>"
      : "")
  );
}

function svgPtrBadge(x, y, name) {
  const label = String(name || "");
  const w = Math.max(48, Math.min(110, 20 + label.length * 7));
  const h = 18;
  const bx = x - w / 2;
  const by = y - 50;
  return (
    '<g class="ptr-marker" data-ptr="' +
    escapeXml(label) +
    '" filter="url(#ptrGlow)">' +
    '<rect x="' +
    bx +
    '" y="' +
    by +
    '" width="' +
    w +
    '" height="' +
    h +
    '" rx="9" fill="url(#ptrGrad)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>' +
    '<path d="M ' +
    (x - 6) +
    " " +
    (by + h) +
    " L " +
    x +
    " " +
    (by + h + 8) +
    " L " +
    (x + 6) +
    " " +
    (by + h) +
    ' Z" fill="#f48fb1"/>' +
    '<circle cx="' +
    (bx + 10) +
    '" cy="' +
    (by + h / 2) +
    '" r="2.2" fill="#2a0a18"/>' +
    '<text x="' +
    (x + 3) +
    '" y="' +
    (by + 12.5) +
    '" text-anchor="middle" fill="#2a0a18" font-size="10" font-family="Roboto Mono" font-weight="600">' +
    escapeXml(label) +
    "</text></g>"
  );
}

function fieldPtr(obj, names) {
  for (const n of names) {
    const v = obj.fields[n];
    if (v && v.k === "ptr" && typeof v.addr === "string") return v.addr;
  }
  return null;
}

function dataLabel(obj) {
  for (const n of ["data", "val", "value", "id", "key"]) {
    if (obj.fields[n]) return describe(obj.fields[n]).replace(/"/g, "");
  }
  return obj.typeName;
}

function renderTree(into) {
  const treeObjs = [...heap.values()].filter((o) => "left" in o.fields || "right" in o.fields);
  const listObjs = [...heap.values()].filter((o) => "next" in o.fields);

  if (!treeObjs.length && !listObjs.length) {
    into.innerHTML = emptyStateHtml(
      'No tree or list nodes yet. Run a program that uses <code>left</code>/<code>right</code> or <code>next</code> pointers.'
    );
    return;
  }

  const pointed = new Set();
  for (const o of heap.values()) {
    for (const v of Object.values(o.fields)) {
      if (v && v.k === "ptr" && typeof v.addr === "string") pointed.add(v.addr);
    }
  }

  let parts = [];
  let maxW = 700;
  let totalH = 20;

  function layoutTree(rootId) {
    const pos = new Map();
    const edges = [];
    function place(id, depth, x0, x1) {
      const o = heap.get(id);
      if (!o) return;
      const x = (x0 + x1) / 2;
      const y = 50 + depth * 88;
      pos.set(id, { x, y, label: dataLabel(o) });
      const L = fieldPtr(o, ["left"]);
      const R = fieldPtr(o, ["right"]);
      if (L) { edges.push([id, L, "L"]); place(L, depth + 1, x0, x); }
      if (R) { edges.push([id, R, "R"]); place(R, depth + 1, x, x1); }
    }
    place(rootId, 0, 40, 660);
    return { pos, edges };
  }

  const treeRoots = treeObjs.filter((o) => !pointed.has(o.id));
  for (const root of treeRoots) {
    const { pos, edges } = layoutTree(root.id);
    const yOff = totalH;
    for (const [a, b, lab] of edges) {
      const pa = pos.get(a), pb = pos.get(b);
      if (!pa || !pb) continue;
      const hl = iterationInfo && iterationInfo.current && (iterationInfo.current.id === a || iterationInfo.current.id === b);
      parts.push(svgEdge(pa.x, pa.y + yOff + 16, pb.x, pb.y + yOff - 16, lab, hl, a + ":" + lab));
    }
    for (const [id, p] of pos) {
      const hl = iterationInfo && iterationInfo.current && iterationInfo.current.id === id;
      const isHead =
        iterationInfo &&
        iterationInfo.items &&
        iterationInfo.items[0] &&
        iterationInfo.items[0].id === id;
      parts.push(svgNodeRect(p.x, p.y + yOff, 56, 36, p.label, { highlight: hl, stroke: "#a8c7fa" }));
      if (hl && iterationInfo) {
        parts.push(svgPtrBadge(p.x, p.y + yOff, iterationInfo.varName));
      } else if (isHead && iterationInfo && iterationInfo.source) {
        parts.push(
          '<text x="'+p.x+'" y="'+(p.y+yOff-28)+'" text-anchor="middle" fill="#a8c7fa" font-size="10" font-family="Roboto Mono" font-weight="500">'+
          escapeXml(iterationInfo.source)+"</text>"
        );
      }
    }
    totalH += 50 + [...pos.values()].reduce((m, p) => Math.max(m, p.y), 0) + 40;
  }

  const listHeads = listObjs.filter((o) => !pointed.has(o.id));
  for (const head of listHeads) {
    let id = head.id;
    let x = 60;
    const y = totalH + 80;
    const seen = new Set();
    let isFirst = true;
    while (id && !seen.has(id)) {
      seen.add(id);
      const o = heap.get(id);
      if (!o) break;
      const hl = iterationInfo && iterationInfo.current && iterationInfo.current.id === id;
      if (isFirst && iterationInfo && iterationInfo.source) {
        parts.push(
          '<text x="'+x+'" y="'+(y-42)+'" text-anchor="middle" fill="#a8c7fa" font-size="10" font-family="Roboto Mono" font-weight="500">'+
          escapeXml(iterationInfo.source)+"</text>"
        );
      }
      if (hl && iterationInfo) {
        parts.push(svgPtrBadge(x, y, iterationInfo.varName));
      }
      parts.push(svgNodeRect(x, y, 56, 36, dataLabel(o), { highlight: hl, stroke: hl ? "#f48fb1" : "#80cbc4" }));
      isFirst = false;
      const n = fieldPtr(o, ["next"]);
      if (n) {
        parts.push(svgEdge(x + 28, y, x + 72, y, null, hl, id + ":next"));
        x += 100;
        id = n;
      } else {
        parts.push(
          '<text x="'+(x+52)+'" y="'+(y+4)+'" fill="#9e9e9e" font-size="11" font-family="Roboto Mono" font-style="italic">null</text>'
        );
        break;
      }
    }
    maxW = Math.max(maxW, x + 130);
    totalH = y + 60;
  }

  into.innerHTML =
    renderIterationOverlay() +
    '<div class="legend" style="margin-top:0.75rem"><span class="l-val">Nodes</span><span class="l-ptr">Pointers</span><span class="l-iter">Iterator on top of node</span></div>' +
    '<div class="viz-wrap"><svg class="viz" viewBox="0 0 '+maxW+" "+Math.max(totalH, 380)+'">' + svgDefs() + parts.join("") + "</svg></div>";
}

function renderGraph(into) {
  const nodes = new Map();
  const edges = [];

  function add(id, label, kind) {
    if (!nodes.has(id)) nodes.set(id, { label, kind });
  }

  for (const fr of callStack) {
    for (const [name, val] of fr.locals) {
      add("v:" + fr.name + ":" + name, name, "var");
      if (val.k === "ptr" && typeof val.addr === "string") {
        const o = heap.get(val.addr);
        add(val.addr, o ? dataLabel(o) : val.addr, "obj");
        edges.push(["v:" + fr.name + ":" + name, val.addr, "→"]);
      } else if (val.k === "ptr" && val.addr && val.addr.stack) {
        edges.push(["v:" + fr.name + ":" + name, "v:" + fr.name + ":" + val.addr.name, "&"]);
      }
    }
  }

  for (const o of heap.values()) {
    add(o.id, dataLabel(o), "obj");
    for (const [fname, v] of Object.entries(o.fields)) {
      if (v && v.k === "ptr" && typeof v.addr === "string") {
        add(v.addr, dataLabel(heap.get(v.addr) || { typeName: "?", fields: {} }), "obj");
        edges.push([o.id, v.addr, fname]);
      }
    }
  }

  if (!nodes.size) {
    into.innerHTML = emptyStateHtml(
      "Graph is empty — run a program with pointers or heap objects to see connections."
    );
    return;
  }

  const keys = [...nodes.keys()];
  const cx = 330, cy = 250, R = Math.min(210, 36 + keys.length * 16);
  const pos = new Map();
  keys.forEach((k, i) => {
    const a = (2 * Math.PI * i) / keys.length - Math.PI / 2;
    pos.set(k, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  });

  const parts = [];
  for (const [a, b, lab] of edges) {
    const pa = pos.get(a), pb = pos.get(b);
    if (!pa || !pb) continue;
    const dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
    const sx = pa.x + (dx / len) * 26, sy = pa.y + (dy / len) * 26;
    const ex = pb.x - (dx / len) * 26, ey = pb.y - (dy / len) * 26;
    const hl = iterationInfo && iterationInfo.current && (a === iterationInfo.current.id || b === iterationInfo.current.id);
    parts.push(svgEdge(sx, sy, ex, ey, lab, hl, a + ":" + lab));
  }
  for (const [k, meta] of nodes) {
    const p = pos.get(k);
    const hl = iterationInfo && iterationInfo.current && k === iterationInfo.current.id;
    const isSrcVar =
      iterationInfo &&
      meta.kind === "var" &&
      meta.label === iterationInfo.source;
    const isIterVar =
      iterationInfo &&
      meta.kind === "var" &&
      meta.label === iterationInfo.varName;
    const stroke = meta.kind === "var" ? "#a8c7fa" : "#80cbc4";
    const activeStroke = hl || isIterVar ? "#f48fb1" : isSrcVar ? "#a8c7fa" : stroke;
    const label = meta.label.length > 8 ? meta.label.slice(0, 7) + "…" : meta.label;
    const r = 24;
    const filter = ' filter="url(#softShadow)"';
    parts.push(
      '<circle cx="'+p.x+'" cy="'+p.y+'" r="'+r+'" fill="url(#nodeGrad)" stroke="'+activeStroke+'" stroke-width="'+(hl||isIterVar||isSrcVar?2:1.5)+'"'+filter+'/>' +
      '<text x="'+p.x+'" y="'+(p.y+4)+'" text-anchor="middle" fill="#e3e3e3" font-size="11" font-family="Roboto Mono" font-weight="500">'+escapeXml(label)+"</text>"
    );
    if (hl && iterationInfo) {
      parts.push(svgPtrBadge(p.x, p.y, iterationInfo.varName));
    }
  }

  into.innerHTML =
    renderIterationOverlay() +
    '<div class="legend" style="margin-top:0.75rem"><span class="l-val">Variables / objects</span><span class="l-ptr">Pointer edges</span><span class="l-iter">Iterator on top</span></div>' +
    '<div class="viz-wrap"><svg class="viz" viewBox="0 0 660 520">' + svgDefs() + parts.join("") + "</svg></div>";
}

function renderAll(into) {
  into.innerHTML = '<div style="display:grid;gap:1rem"><div id="all-mem"></div><div id="all-tree"></div><div id="all-graph"></div></div>';
  renderMemory(into.querySelector("#all-mem"));
  renderTree(into.querySelector("#all-tree"));
  renderGraph(into.querySelector("#all-graph"));
}

function prefersReducedMotion() {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function capturePointerMotion() {
  const ptrs = new Map();
  document.querySelectorAll("[data-ptr]").forEach((el) => {
    const key = el.getAttribute("data-ptr");
    if (!key) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    if (!ptrs.has(key)) ptrs.set(key, []);
    ptrs.get(key).push({ left: r.left, top: r.top });
  });

  const edges = new Map();
  document.querySelectorAll("line[data-edge]").forEach((el) => {
    const key = el.getAttribute("data-edge");
    if (!key) return;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push({
      x1: +el.getAttribute("x1"),
      y1: +el.getAttribute("y1"),
      x2: +el.getAttribute("x2"),
      y2: +el.getAttribute("y2"),
    });
  });

  return { ptrs, edges };
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function animatePointerSlides(prev) {
  if (!prev) return;

  const run = () => {
    let slid = false;
    const reduce = prefersReducedMotion();

    document.querySelectorAll("[data-ptr]").forEach((el) => {
      const key = el.getAttribute("data-ptr");
      const queue = prev.ptrs && prev.ptrs.get(key);
      if (!queue || !queue.length) return;
      const old = queue.shift();
      const r = el.getBoundingClientRect();
      const dx = old.left - r.left;
      const dy = old.top - r.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      slid = true;
      if (reduce) return;

      const centered = el.getAttribute("data-ptr-anchor") === "center";
      const from = centered
        ? "translateX(calc(-50% + " + dx + "px)) translateY(" + dy + "px)"
        : "translate(" + dx + "px, " + dy + "px)";
      const to = centered ? "translateX(-50%)" : "translate(0px, 0px)";

      el.style.transition = "none";
      el.style.transform = from;
      void el.getBoundingClientRect();
      el.classList.add("ptr-sliding");
      el.style.transition = "";
      el.style.transform = to;

      const cleanup = (ev) => {
        if (ev && ev.propertyName && ev.propertyName !== "transform") return;
        el.classList.remove("ptr-sliding");
        el.style.transform = "";
        el.style.transition = "";
        el.removeEventListener("transitionend", cleanup);
      };
      el.addEventListener("transitionend", cleanup);
      setTimeout(cleanup, 500);
    });

    if (prev.edges && prev.edges.size) {
      document.querySelectorAll("line[data-edge]").forEach((el) => {
        const key = el.getAttribute("data-edge");
        const queue = prev.edges.get(key);
        if (!queue || !queue.length) return;
        const from = queue.shift();
        const to = {
          x1: +el.getAttribute("x1"),
          y1: +el.getAttribute("y1"),
          x2: +el.getAttribute("x2"),
          y2: +el.getAttribute("y2"),
        };
        const moved =
          Math.hypot(to.x1 - from.x1, to.y1 - from.y1) > 0.5 ||
          Math.hypot(to.x2 - from.x2, to.y2 - from.y2) > 0.5;
        if (!moved) return;

        slid = true;
        if (reduce) return;

        el.setAttribute("x1", from.x1);
        el.setAttribute("y1", from.y1);
        el.setAttribute("x2", from.x2);
        el.setAttribute("y2", from.y2);

        const duration = 380;
        const t0 = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / duration);
          const e = easeOutCubic(t);
          el.setAttribute("x1", from.x1 + (to.x1 - from.x1) * e);
          el.setAttribute("y1", from.y1 + (to.y1 - from.y1) * e);
          el.setAttribute("x2", from.x2 + (to.x2 - from.x2) * e);
          el.setAttribute("y2", from.y2 + (to.y2 - from.y2) * e);
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }

    if (slid && typeof playPointerSlideSound === "function") playPointerSlideSound();
  };

  requestAnimationFrame(() => requestAnimationFrame(run));
}

function refresh() {
  const prev = capturePointerMotion();
  renderCodeHighlight();
  const tab = document.querySelector(".tab.active").dataset.tab;
  if (tab === "memory") renderMemory(document.getElementById("panel-memory"));
  if (tab === "tree") renderTree(document.getElementById("panel-tree"));
  if (tab === "graph") renderGraph(document.getElementById("panel-graph"));
  if (tab === "all") renderAll(document.getElementById("panel-all"));
  animatePointerSlides(prev);
}
