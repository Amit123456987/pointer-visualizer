/* ========== ITERATION TRACKING ========== */
function iterVarFromFor(st) {
  if (st.init && st.init.type === "vardecl") return st.init.name;
  if (st.upd && st.upd.type === "assign" && st.upd.left.type === "ident") return st.upd.left.name;
  if (
    st.upd &&
    (st.upd.type === "preop" || st.upd.type === "postop") &&
    st.upd.expr &&
    st.upd.expr.type === "ident"
  ) {
    return st.upd.expr.name;
  }
  return null;
}

function pushIteration(info) {
  iterationStack = iterationStack.filter((it) => it.varName !== info.varName);
  iterationStack.push(info);
  iterationInfo = info;
}

function popIterationVar(varName) {
  if (!varName) return;
  iterationStack = iterationStack.filter((it) => it.varName !== varName);
  iterationInfo = iterationStack.length ? iterationStack[iterationStack.length - 1] : null;
}

function popIterationForLoop(st) {
  popIterationVar(iterVarFromFor(st));
}

function popIterationForWhile(st) {
  const c = st.cond;
  const ptrName = c && c.type === "binary" && c.left.type === "ident" ? c.left.name : null;
  popIterationVar(ptrName);
}

function arrayIteratorsFor(arrName, length) {
  const out = [];
  for (const it of iterationStack) {
    if (it.kind === "array" && it.source === arrName && it.items.length === length) {
      out.push({ varName: it.varName, index: it.index });
    }
  }
  return out;
}

/** Row/col iterators currently walking a 2D matrix */
function matrixIteratorsFor(matName) {
  const out = [];
  for (const it of iterationStack) {
    if (it.kind === "matrix" && it.source === matName && (it.axis === "row" || it.axis === "col")) {
      out.push({ varName: it.varName, axis: it.axis, index: it.index });
    }
  }
  return out;
}

function isActiveIteratorVar(name) {
  return iterationStack.some((it) => it.varName === name);
}

function iterationBadgesHtml(markers, kind, extraClass) {
  if (!markers.length) return "";
  const cls = (kind || "iter") + (extraClass ? " " + extraClass : "");
  return (
    '<span class="structure-badges">' +
    markers
      .map(
        (m, i) =>
          '<span class="structure-badge ' +
          cls +
          (i > 0 ? " iter-alt" : "") +
          '" data-ptr="' +
          escapeXml(m.varName) +
          '">' +
          escapeXml(m.varName) +
          "</span>"
      )
      .join("") +
    "</span>"
  );
}

function allLocals() {
  const out = [];
  for (const fr of callStack) {
    for (const [name, val] of fr.locals) out.push({ name, val, frame: fr.name });
  }
  return out;
}

function findSourceForAddr(startAddr, iterName) {
  if (!startAddr) return null;
  const preferred = ["head", "root", "start", "list", "arr", "graph", "nums", "a"];
  const locals = allLocals().filter((l) => l.name !== iterName);
  const ptrs = locals.filter((l) => l.val && l.val.k === "ptr" && l.val.addr === startAddr);
  if (!ptrs.length) {
    // any pointer into same chain (head of collected items)
    return null;
  }
  ptrs.sort((a, b) => {
    const pa = preferred.indexOf(a.name.toLowerCase());
    const pb = preferred.indexOf(b.name.toLowerCase());
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });
  return ptrs[0].name;
}

function findArraySource(iterName) {
  const locals = allLocals();
  for (const l of locals) {
    if (l.val && l.val.k === "arr") return l.name;
  }
  if (typeof globals !== "undefined" && globals) {
    for (const [name, val] of globals) {
      if (val && val.k === "arr") return name;
    }
  }
  return null;
}

function classifyStructure(sourceName, items) {
  if (!sourceName) return "range";
  try {
    const v = getVar(sourceName);
    if (v && v.k === "arr") {
      if (typeof isMatrixValue === "function" && isMatrixValue(v)) return "matrix";
      return "array";
    }
  } catch (_) {}
  if (items && items.some((it) => it.id)) {
    const o = items[0] && items[0].id ? heap.get(items[0].id) : null;
    if (o) {
      if ("next" in o.fields) return "linkedlist";
      if ("left" in o.fields || "right" in o.fields) return "tree";
      if ("edge1" in o.fields || "edge2" in o.fields) return "graph";
    }
    return "linkedlist";
  }
  return "structure";
}

/** Flatten mat[i][j] → { base: "mat", indices: [iExpr, jExpr] } */
function flattenIndexChain(e) {
  const indices = [];
  let cur = e;
  while (cur && cur.type === "index") {
    indices.unshift(cur.index);
    cur = cur.obj;
  }
  if (!cur || cur.type !== "ident") return null;
  return { base: cur.name, indices };
}

function trackForIteration(st) {
  try {
    let iterVar = null;
    if (st.init && st.init.type === "vardecl") iterVar = st.init.name;
    if (!iterVar && st.upd && st.upd.type === "assign" && st.upd.left.type === "ident") {
      iterVar = st.upd.left.name;
    }
    // also detect i++ / ++i in update
    if (!iterVar && st.upd && (st.upd.type === "preop" || st.upd.type === "postop") && st.upd.expr && st.upd.expr.type === "ident") {
      iterVar = st.upd.expr.name;
    }

    let source = null;
    let oneDSource = null;
    let matrixAxis = null; // "row" | "col"
    let elementVar = null; // x in: int x = arr[i]

    const noteIndex = (e) => {
      const chain = flattenIndexChain(e);
      if (!chain || !iterVar) return;
      let usesIter = false;
      let axis = null;
      for (let a = 0; a < chain.indices.length; a++) {
        const idx = chain.indices[a];
        if (idx && idx.type === "ident" && idx.name === iterVar) {
          usesIter = true;
          if (chain.indices.length >= 2) axis = a === 0 ? "row" : "col";
        }
      }
      if (!usesIter) return;
      if (axis) {
        source = chain.base;
        matrixAxis = axis;
      } else if (!matrixAxis) {
        oneDSource = chain.base;
      }
    };

    const walkExpr = (e) => {
      if (!e) return;
      if (e.type === "index") {
        noteIndex(e);
        walkExpr(e.obj);
        walkExpr(e.index);
        return;
      }
      if (e.type === "assign") {
        if (e.left.type === "ident" && e.right.type === "index") {
          const chain = flattenIndexChain(e.right);
          if (chain && chain.indices.length === 1) {
            elementVar = e.left.name;
            if (!matrixAxis) oneDSource = chain.base;
          }
        }
        walkExpr(e.left);
        walkExpr(e.right);
        return;
      }
      if (e.type === "binary" || e.type === "logical") {
        walkExpr(e.left);
        walkExpr(e.right);
        return;
      }
      if (e.type === "unary" || e.type === "preop" || e.type === "postop") {
        walkExpr(e.expr);
        return;
      }
      if (e.type === "call") {
        (e.args || []).forEach(walkExpr);
        return;
      }
      if (e.type === "cout") {
        (e.parts || []).forEach(walkExpr);
        return;
      }
      if (e.type === "member") walkExpr(e.obj);
      if (e.type === "arraylit") (e.items || []).forEach(walkExpr);
    };

    const walkStmt = (n) => {
      if (!n) return;
      if (Array.isArray(n)) {
        n.forEach(walkStmt);
        return;
      }
      if (n.type === "vardecl") {
        if (n.init && n.init.type === "index") {
          const chain = flattenIndexChain(n.init);
          if (chain && chain.indices.length === 1) {
            elementVar = n.name;
            if (!matrixAxis) oneDSource = chain.base;
          }
        }
        walkExpr(n.init);
        return;
      }
      if (n.type === "expr") {
        walkExpr(n.expr);
        return;
      }
      if (n.type === "if") {
        walkExpr(n.cond);
        walkStmt(n.then);
        walkStmt(n.else);
        return;
      }
      if (n.type === "for") {
        walkStmt(n.init);
        walkExpr(n.cond);
        walkExpr(n.upd);
        walkStmt(n.body);
        return;
      }
      if (n.type === "while") {
        walkExpr(n.cond);
        walkStmt(n.body);
        return;
      }
      if (n.type === "return") walkExpr(n.value);
    };

    walkStmt(st.body);

    if (matrixAxis && source) {
      // Prefer 2D association when the loop indexes a matrix.
    } else if (oneDSource) {
      source = oneDSource;
      matrixAxis = null;
    } else if (!source) {
      source = findArraySource(iterVar);
    }

    if (iterVar) {
      const iv = getVar(iterVar);
      let items = [];
      let current = describe(iv);
      let currentId = null;
      let kind = classifyStructure(source, items);
      let axis = matrixAxis;

      if (source) {
        try {
          const arr = getVar(source);
          if (arr && arr.k === "arr") {
            if (typeof isMatrixValue === "function" && isMatrixValue(arr)) {
              kind = "matrix";
              if (!axis) axis = "row";
              if (axis === "col") {
                const row0 = arr.items[0];
                items = (row0 && row0.items ? row0.items : []).map((it, i) => ({
                  display: describe(it),
                  index: i,
                }));
              } else {
                items = arr.items.map((row, i) => ({
                  display: row && row.k === "arr" ? "[" + row.items.map(describe).join(", ") + "]" : describe(row),
                  index: i,
                }));
              }
            } else {
              items = arr.items.map((it, i) => ({ display: describe(it), index: i }));
            }
            if (iv.k === "prim" && items[iv.v]) {
              current = items[iv.v].display;
            }
          }
        } catch (_) {}
      }

      const idx = iv.k === "prim" ? Math.trunc(Number(iv.v)) : 0;
      const fr = typeof currentFrame === "function" && currentFrame() ? currentFrame().name : "";
      let relation;
      if (kind === "matrix" && source) {
        relation =
          iterVar +
          " iterates " +
          (axis === "col" ? "columns" : "rows") +
          " of " +
          source;
      } else if (source) {
        relation =
          iterVar + " iterates over " + source + (elementVar ? " (via " + elementVar + ")" : "");
      } else {
        relation = iterVar + " counts range";
      }

      pushIteration({
        varName: iterVar,
        source: source || "(range)",
        elementVar,
        kind,
        axis: kind === "matrix" ? axis || "row" : null,
        index: idx,
        items: items.length ? items : [{ display: current, index: idx }],
        current: { display: current, id: currentId, index: idx },
        frame: fr,
        relation,
      });
    }
  } catch (_) {}
}

function collectChainFrom(startId) {
  const items = [];
  let id = startId;
  const seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id);
    const obj = heap.get(id);
    if (!obj) break;
    const data = obj.fields.data || obj.fields.val || obj.fields.id || obj.fields.value;
    items.push({
      display: data ? describe(data) : dataLabel(obj),
      id,
    });
    const next =
      obj.fields.next || obj.fields.edge1 || obj.fields.left;
    if (next && next.k === "ptr" && typeof next.addr === "string") id = next.addr;
    else break;
  }
  return items;
}

function findListHeadAddr(fromId) {
  // Walk reverse: find node with no other node pointing next/edge to it among chain
  // Simpler: among locals, preferred head/root; else start of chain by scanning heap
  const pointed = new Set();
  for (const o of heap.values()) {
    for (const key of ["next", "edge1", "edge2", "left", "right"]) {
      const v = o.fields[key];
      if (v && v.k === "ptr" && typeof v.addr === "string") pointed.add(v.addr);
    }
  }
  // walk backward from fromId is hard; use root that reaches fromId
  let best = fromId;
  for (const o of heap.values()) {
    if (pointed.has(o.id)) continue;
    const chain = collectChainFrom(o.id);
    if (chain.some((it) => it.id === fromId)) {
      best = o.id;
      break;
    }
  }
  return best;
}

function trackLoopIteration(st) {
  try {
    let ptrName = null;
    const c = st.cond;
    if (c && c.type === "binary" && c.left.type === "ident") ptrName = c.left.name;
    if (!ptrName) return;
    const val = getVar(ptrName);
    if (!val || val.k !== "ptr" || typeof val.addr !== "string") {
      pushIteration({
        varName: ptrName,
        source: "(null)",
        kind: "linkedlist",
        index: 0,
        items: [],
        current: { display: "nullptr" },
        relation: ptrName + " finished iterating",
      });
      return;
    }

    const headAddr = findListHeadAddr(val.addr);
    const items = collectChainFrom(headAddr);
    const source =
      findSourceForAddr(headAddr, ptrName) ||
      findSourceForAddr(val.addr, ptrName) ||
      "chain";

    const cur = val.addr;
    const idx = items.findIndex((it) => it.id === cur);
    const curItem = idx >= 0 ? items[idx] : { display: describe(val), id: cur };

    // element alias: cout << curr->data etc. — use ptr itself as the floating badge
    pushIteration({
      varName: ptrName,
      source,
      elementVar: null,
      kind: classifyStructure(source, items),
      index: idx >= 0 ? idx : 0,
      items: items.length ? items : [curItem],
      current: { display: curItem.display, id: cur },
      relation: ptrName + " iterates over " + source,
    });
  } catch (_) {}
}

function collectAllArrays() {
  const out = [];
  const seen = new Set();

  function add(name, frame, val) {
    if (!val || val.k !== "arr") return;
    const key = frame + "::" + name;
    if (seen.has(key)) return;
    seen.add(key);
    const label = frame === "<global>" ? name + " (global)" : frame === "main" ? name : name + " · " + frame;
    const matrix = typeof isMatrixValue === "function" && isMatrixValue(val);
    out.push({
      name,
      frame,
      label,
      arr: val,
      matrix,
      items: matrix
        ? null
        : val.items.map((it, i) => ({ display: describe(it), index: i })),
      rows: matrix
        ? val.items.map((row, r) => ({
            arr: row,
            cells: (row.items || []).map((it, c) => ({ display: describe(it), index: c, row: r })),
          }))
        : null,
    });
  }

  for (const fr of callStack) {
    for (const [name, val] of fr.locals) add(name, fr.name, val);
  }
  if (typeof globals !== "undefined" && globals) {
    for (const [name, val] of globals) add(name, "<global>", val);
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

function collectAllLinkedLists() {
  const lists = [];
  const pointed = new Set();

  for (const o of heap.values()) {
    for (const key of ["next", "edge1", "left", "right"]) {
      const v = o.fields[key];
      if (v && v.k === "ptr" && typeof v.addr === "string") pointed.add(v.addr);
    }
  }

  const seenChains = new Set();

  for (const o of heap.values()) {
    if (!("next" in o.fields) && !("edge1" in o.fields)) continue;
    if (pointed.has(o.id)) continue;

    const items = collectChainFrom(o.id);
    if (!items.length) continue;

    const sig = items.map((it) => it.id).join("->");
    if (seenChains.has(sig)) continue;
    seenChains.add(sig);

    const source =
      findSourceForAddr(o.id, null) ||
      findSourceForAddr(items[0].id, null) ||
      dataLabel(o);

    lists.push({ name: source, headId: o.id, items });
  }

  return lists.sort((a, b) => a.name.localeCompare(b.name));
}

function renderLiveStructures() {
  const arrays = collectAllArrays();
  const lists = collectAllLinkedLists();

  if (!arrays.length && !lists.length) return "";

  let html =
    '<div class="structures-live">' +
    '<div class="box-title">Live arrays &amp; lists</div>' +
    '<p class="structures-hint">Updates on every step — highlighted cells were just written</p>';

  for (const arr of arrays) {
    let hasWrite = false;

    if (arr.matrix) {
      const miters =
        typeof matrixIteratorsFor === "function" ? matrixIteratorsFor(arr.name) : [];
      const rowIters = miters.filter((m) => m.axis === "row");
      const colIters = miters.filter((m) => m.axis === "col");
      const activeRows = new Set(rowIters.map((m) => m.index));
      const activeCols = new Set(colIters.map((m) => m.index));
      const rows = arr.rows.length;
      const cols = rows ? arr.rows[0].cells.length : 0;

      const colHeads = [];
      for (let c = 0; c < cols; c++) {
        const markers = colIters.filter((m) => m.index === c);
        colHeads.push(
          '<div class="matrix-col-head' + (markers.length ? " active" : "") + '">' +
            (markers.length ? iterationBadgesHtml(markers, "iter", "iter-col") : "") +
            '<span class="matrix-axis-label">j=' + c + "</span>" +
          "</div>"
        );
      }

      const rowHtml = arr.rows
        .map((row, r) => {
          const rowMarkers = rowIters.filter((m) => m.index === r);
          const slots = row.cells.map((it, c) => {
            const isWrite =
              typeof isLastArrayWrite === "function"
                ? isLastArrayWrite(row.arr, c, arr.name, arr.frame, r)
                : false;
            if (isWrite) hasWrite = true;
            const onRow = activeRows.has(r);
            const onCol = activeCols.has(c);
            let cls = "structure-slot";
            if (isWrite) cls += " updated";
            if (onRow && onCol) cls += " active matrix-cross";
            else if (onRow) cls += " matrix-row-hot";
            else if (onCol) cls += " matrix-col-hot";
            let badge = "";
            if (isWrite) {
              badge =
                '<span class="structure-badge write" data-ptr-anchor="center">[' +
                r +
                "][" +
                c +
                "] updated</span>";
            }
            return (
              '<div class="' + cls + '"' + (isWrite ? ' data-arr-write="1"' : "") + ">" +
              badge +
              '<div class="structure-cell">' + escapeXml(it.display) + "</div>" +
              '<span class="structure-idx' + (isWrite ? " idx-updated" : "") + '">[' + r + "][" + c + "]</span></div>"
            );
          });
          return (
            '<div class="matrix-row' + (rowMarkers.length ? " row-active" : "") + '">' +
            '<div class="matrix-row-label' + (rowMarkers.length ? " active" : "") + '">' +
            (rowMarkers.length ? iterationBadgesHtml(rowMarkers, "iter", "iter-row") : "") +
            '<span class="matrix-axis-label">i=' + r + "</span>" +
            "</div>" +
            slots.join("") +
            "</div>"
          );
        })
        .join("");

      const iterMeta = miters.length
        ? miters
            .map((m) => m.varName + (m.axis === "row" ? "↓" : "→") + "[" + m.index + "]")
            .join(" · ") + " · "
        : "";

      html +=
        '<div class="structure-card array-card matrix-card' +
        (hasWrite ? " has-write" : "") +
        (miters.length ? " has-iters" : "") +
        '">' +
        '<div class="structure-head"><span class="structure-name">' + escapeXml(arr.label) + "</span>" +
        '<span class="structure-meta">' +
        iterMeta +
        (hasWrite && lastArrayWrite
          ? "wrote [" + lastArrayWrite.row + "][" + lastArrayWrite.index + "] · "
          : "") +
        rows + "×" + cols + " matrix</span></div>" +
        '<div class="structure-track matrix-track">' +
        '<div class="matrix-row matrix-col-headers">' +
        '<div class="matrix-corner"></div>' +
        colHeads.join("") +
        "</div>" +
        rowHtml +
        "</div></div>";
      continue;
    }

    const slots = arr.items.map((it, i) => {
      const markers = arrayIteratorsFor(arr.name, arr.items.length).filter((m) => m.index === i);
      const isWrite =
        typeof isLastArrayWrite === "function"
          ? isLastArrayWrite(arr.arr, i, arr.name, arr.frame)
          : lastArrayWrite &&
            lastArrayWrite.name === arr.name &&
            lastArrayWrite.index === i &&
            lastArrayWrite.frame === arr.frame;
      if (isWrite) hasWrite = true;
      let cls = "structure-slot";
      if (isWrite) cls += " updated";
      if (markers.length) cls += " active";

      let badge = "";
      if (isWrite) {
        badge =
          '<span class="structure-badge write" data-ptr-anchor="center">[' +
          i +
          "] updated</span>";
      } else if (markers.length) {
        badge = iterationBadgesHtml(markers);
      }

      return (
        '<div class="' + cls + '"' + (isWrite ? ' data-arr-write="1"' : "") + ">" +
        badge +
        '<div class="structure-cell">' + escapeXml(it.display) + "</div>" +
        '<span class="structure-idx' + (isWrite ? " idx-updated" : "") + '">[' + i + "]</span></div>"
      );
    });

    html +=
      '<div class="structure-card array-card' + (hasWrite ? " has-write" : "") + '">' +
      '<div class="structure-head"><span class="structure-name">' + escapeXml(arr.label) + "</span>" +
      '<span class="structure-meta">' +
      (hasWrite ? "wrote [" + lastArrayWrite.index + "] · " : "") +
      arr.items.length + " cells</span></div>" +
      '<div class="structure-track array-track">' + slots.join("") + "</div></div>";
  }

  for (const list of lists) {
    const slots = list.items.map((it, i) => {
      const isIter =
        iterationInfo &&
        iterationInfo.current &&
        iterationInfo.current.id === it.id;
      const isHead = i === 0;
      let cls = "structure-slot" + (isIter ? " active" : "");
      let badge = "";
      if (isIter && iterationInfo.varName) {
        badge =
          '<span class="structure-badge iter" data-ptr="' +
          escapeXml(iterationInfo.varName) +
          '" data-ptr-anchor="center">' +
          escapeXml(iterationInfo.varName) +
          "</span>";
      } else if (isHead) {
        badge = '<span class="structure-badge head">' + escapeXml(list.name) + "</span>";
      }
      return (
        '<div class="' + cls + '">' +
        badge +
        '<div class="structure-cell">' + escapeXml(it.display) + "</div>" +
        '<span class="structure-idx">#' + (i + 1) + "</span></div>" +
        (i < list.items.length - 1 ? '<span class="structure-arrow">→</span>' : "")
      );
    });

    html +=
      '<div class="structure-card list-card">' +
      '<div class="structure-head"><span class="structure-name">' + escapeXml(list.name) + "</span>" +
      '<span class="structure-meta">linked list · ' + list.items.length + " nodes</span></div>" +
      '<div class="structure-track list-track">' + slots.join("") + "</div></div>";
  }

  html += "</div>";
  return html;
}

function renderIterationOverlay() {
  if (!iterationInfo || !iterationInfo.items || !iterationInfo.items.length) return "";

  const kind = iterationInfo.kind || "structure";

  if (kind === "matrix" && iterationInfo.source && iterationInfo.source !== "(range)") {
    try {
      const mat = getVar(iterationInfo.source);
      if (mat && typeof isMatrixValue === "function" && isMatrixValue(mat)) {
        const miters = matrixIteratorsFor(iterationInfo.source);
        const rowIters = miters.filter((m) => m.axis === "row");
        const colIters = miters.filter((m) => m.axis === "col");
        const activeRows = new Set(rowIters.map((m) => m.index));
        const activeCols = new Set(colIters.map((m) => m.index));
        const nRows = mat.items.length;
        const nCols = nRows && mat.items[0].items ? mat.items[0].items.length : 0;

        const chips = miters
          .map(
            (m) =>
              '<span class="chip iter">' +
              escapeXml(m.varName) +
              (m.axis === "row" ? " row" : " col") +
              " [" +
              m.index +
              "]</span>"
          )
          .join("");

        const colHeads = [];
        for (let c = 0; c < nCols; c++) {
          const markers = colIters.filter((m) => m.index === c);
          colHeads.push(
            '<div class="matrix-col-head' + (markers.length ? " active" : "") + '">' +
              (markers.length
                ? markers
                    .map(
                      (m) =>
                        '<span class="badge" data-ptr="' +
                        escapeXml(m.varName) +
                        '" data-ptr-anchor="center">' +
                        escapeXml(m.varName) +
                        "</span>"
                    )
                    .join("")
                : "") +
              '<span class="matrix-axis-label">[' + c + "]</span></div>"
          );
        }

        let grid = '<div class="matrix-row matrix-col-headers"><div class="matrix-corner"></div>' + colHeads.join("") + "</div>";
        for (let r = 0; r < nRows; r++) {
          const rowMarkers = rowIters.filter((m) => m.index === r);
          const row = mat.items[r];
          let slots = "";
          for (let c = 0; c < nCols; c++) {
            const onRow = activeRows.has(r);
            const onCol = activeCols.has(c);
            let cls = "overlay-slot";
            if (onRow && onCol) cls += " active";
            else if (onRow || onCol) cls += " dim-hot";
            slots +=
              '<div class="' + cls + '"><div class="cell">' +
              escapeXml(describe(row.items[c])) +
              '</div><span class="idx">[' + r + "][" + c + "]</span></div>";
          }
          grid +=
            '<div class="matrix-row">' +
            '<div class="matrix-row-label' + (rowMarkers.length ? " active" : "") + '">' +
            rowMarkers
              .map(
                (m) =>
                  '<span class="badge" data-ptr="' +
                  escapeXml(m.varName) +
                  '" data-ptr-anchor="center">' +
                  escapeXml(m.varName) +
                  "</span>"
              )
              .join("") +
            '<span class="matrix-axis-label">[' + r + "]</span></div>" +
            slots +
            "</div>";
        }

        return (
          '<div class="overlay-wrap">' +
          '<div class="box-title">Iterator on top of structure</div>' +
          '<div class="overlay-headline">' +
          '<span class="kind-pill">Matrix</span>' +
          chips +
          '<span class="over-word">over</span>' +
          '<span class="chip src">' + escapeXml(iterationInfo.source) + "</span>" +
          "</div>" +
          '<div class="overlay-track matrix-track overlay-matrix">' + grid + "</div>" +
          '<div style="margin-top:0.65rem;font-size:0.72rem;color:var(--muted)">' +
          escapeXml(
            miters.map((m) => m.varName + " → " + (m.axis === "row" ? "row" : "col") + " " + m.index).join(" · ") ||
              iterationInfo.relation ||
              ""
          ) +
          "</div></div>"
        );
      }
    } catch (_) {}
  }

  const kindLabel =
    kind === "array" ? "Array" :
    kind === "linkedlist" ? "Linked list" :
    kind === "tree" ? "Tree" :
    kind === "graph" ? "Graph" :
    kind === "matrix" ? "Matrix" : "Structure";

  const sameSource =
    kind === "array" && iterationInfo.source && iterationInfo.source !== "(range)"
      ? iterationStack.filter(
          (it) =>
            it.kind === "array" &&
            it.source === iterationInfo.source &&
            it.items.length === iterationInfo.items.length
        )
      : iterationStack.length
        ? iterationStack.filter((it) => it.varName === iterationInfo.varName)
        : [iterationInfo];

  const iterChips = sameSource
    .map(
      (it) =>
        '<span class="chip iter">' +
        escapeXml(it.varName) +
        " @ " +
        (it.index != null ? "[" + it.index + "]" : "#" + (it.index + 1)) +
        "</span>"
    )
    .join("");

  const headline =
    '<div class="overlay-headline">' +
    '<span class="kind-pill">' + kindLabel + "</span>" +
    iterChips +
    '<span class="over-word">over</span>' +
    '<span class="chip src">' + escapeXml(iterationInfo.source) + "</span>" +
    (iterationInfo.elementVar
      ? '<span class="over-word">element alias</span><span class="chip">' +
        escapeXml(iterationInfo.elementVar) + " = " + escapeXml(iterationInfo.current.display) +
        "</span>"
      : "") +
    "</div>";

  const slots = iterationInfo.items.map((it, i) => {
    const markers =
      kind === "array"
        ? sameSource.filter((it) => it.index === i)
        : i === iterationInfo.index
          ? [iterationInfo]
          : [];
    const active = markers.length > 0;
    const isWrite =
      kind === "array" &&
      typeof isLastArrayWrite === "function" &&
      isLastArrayWrite(null, i, iterationInfo.source, null);
    let badge = "";
    let srcTag = "";
    if (isWrite) {
      badge = '<span class="badge write-badge">[' + i + "] updated</span>";
    } else if (markers.length) {
      badge = markers
        .map(
          (m) =>
            '<span class="badge" data-ptr="' +
            escapeXml(m.varName) +
            '" data-ptr-anchor="center">' +
            escapeXml(m.varName) +
            "</span>"
        )
        .join("");
    }
    if (i === 0 && iterationInfo.source && iterationInfo.source !== "(range)") {
      srcTag = '<span class="src-tag">' + escapeXml(iterationInfo.source) + "</span>";
    }
    return (
      '<div class="overlay-slot' +
      (active ? " active" : "") +
      (isWrite ? " updated" : "") +
      '">' +
      srcTag +
      badge +
      '<div class="cell">' + escapeXml(it.display) + "</div>" +
      '<span class="idx' + (isWrite ? " idx-updated" : "") + '">' +
      (it.index != null ? "[" + it.index + "]" : "#" + (i + 1)) +
      "</span></div>"
    );
  });

  // Insert arrows between slots for list/graph
  let trackInner = "";
  if (kind === "linkedlist" || kind === "graph" || kind === "tree") {
    slots.forEach((s, i) => {
      trackInner += s;
      if (i < slots.length - 1) trackInner += '<span class="overlay-arrow">→</span>';
    });
  } else {
    trackInner = slots.join("");
  }

  return (
    '<div class="overlay-wrap">' +
    '<div class="box-title">Iterator on top of structure</div>' +
    headline +
    '<div class="overlay-track">' + trackInner + "</div>" +
    '<div style="margin-top:0.65rem;font-size:0.72rem;color:var(--muted)">' +
    escapeXml(iterationInfo.relation || "") +
    "</div></div>"
  );
}
