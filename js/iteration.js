/* ========== ITERATION TRACKING ========== */
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
  return null;
}

function classifyStructure(sourceName, items) {
  if (!sourceName) return "range";
  try {
    const v = getVar(sourceName);
    if (v && v.k === "arr") return "array";
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
    let elementVar = null; // x in: int x = arr[i]
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.type === "vardecl" && n.init) {
          if (n.init.type === "index" && n.init.obj.type === "ident") {
            source = n.init.obj.name;
            elementVar = n.name;
          }
          walkExpr(n.init);
        }
        if (n.type === "expr") walkExpr(n.expr);
      }
    };
    const walkExpr = (e) => {
      if (!e) return;
      if (e.type === "index" && e.obj.type === "ident") source = e.obj.name;
      if (e.type === "assign") {
        if (e.left.type === "ident" && e.right.type === "index" && e.right.obj.type === "ident") {
          elementVar = e.left.name;
          source = e.right.obj.name;
        }
        if (e.left.type === "index" && e.left.obj.type === "ident") {
          source = e.left.obj.name;
        }
        walkExpr(e.left);
        walkExpr(e.right);
      }
      if (e.type === "binary") { walkExpr(e.left); walkExpr(e.right); }
      if (e.type === "cout") e.parts.forEach(walkExpr);
      if (e.type === "member") walkExpr(e.obj);
    };
    walk(st.body);
    if (!source) source = findArraySource(iterVar);

    if (iterVar) {
      const iv = getVar(iterVar);
      let items = [];
      let current = describe(iv);
      let currentId = null;
      if (source) {
        try {
          const arr = getVar(source);
          if (arr && arr.k === "arr") {
            items = arr.items.map((it, i) => ({ display: describe(it), index: i }));
            if (iv.k === "prim" && items[iv.v]) {
              current = items[iv.v].display;
            }
          }
        } catch (_) {}
      }
      const idx = iv.k === "prim" ? iv.v : 0;
      iterationInfo = {
        varName: iterVar,
        source: source || "(range)",
        elementVar,
        kind: classifyStructure(source, items),
        index: idx,
        items: items.length ? items : [{ display: current, index: idx }],
        current: { display: current, id: currentId, index: idx },
        relation: source
          ? iterVar + " iterates over " + source + (elementVar ? " (via " + elementVar + ")" : "")
          : iterVar + " counts range",
      };
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
      iterationInfo = {
        varName: ptrName,
        source: "(null)",
        kind: "linkedlist",
        index: 0,
        items: [],
        current: { display: "nullptr" },
        relation: ptrName + " finished iterating",
      };
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
    iterationInfo = {
      varName: ptrName,
      source,
      elementVar: null,
      kind: classifyStructure(source, items),
      index: idx >= 0 ? idx : 0,
      items: items.length ? items : [curItem],
      current: { display: curItem.display, id: cur },
      relation: ptrName + " iterates over " + source,
    };
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
    out.push({
      name,
      frame,
      label,
      items: val.items.map((it, i) => ({ display: describe(it), index: i })),
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
    const iterActive =
      iterationInfo &&
      iterationInfo.kind === "array" &&
      iterationInfo.source === arr.name &&
      iterationInfo.items.length === arr.items.length;

    const slots = arr.items.map((it, i) => {
      const isIter = iterActive && iterationInfo.index === i;
      const isWrite =
        lastArrayWrite &&
        lastArrayWrite.name === arr.name &&
        lastArrayWrite.index === i &&
        lastArrayWrite.frame === arr.frame;
      let cls = "structure-slot";
      if (isWrite) cls += " updated";
      if (isIter) cls += " active";

      let badge = "";
      if (isWrite) badge = '<span class="structure-badge write">updated</span>';
      else if (isIter) badge = '<span class="structure-badge iter">' + escapeXml(iterationInfo.varName) + "</span>";

      return (
        '<div class="' + cls + '">' +
        badge +
        '<div class="structure-cell">' + escapeXml(it.display) + "</div>" +
        '<span class="structure-idx">[' + i + "]</span></div>"
      );
    });

    html +=
      '<div class="structure-card array-card">' +
      '<div class="structure-head"><span class="structure-name">' + escapeXml(arr.label) + "</span>" +
      '<span class="structure-meta">' + arr.items.length + " cells</span></div>" +
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
        badge = '<span class="structure-badge iter">' + escapeXml(iterationInfo.varName) + "</span>";
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
  const kindLabel =
    kind === "array" ? "Array" :
    kind === "linkedlist" ? "Linked list" :
    kind === "tree" ? "Tree" :
    kind === "graph" ? "Graph" : "Structure";

  const headline =
    '<div class="overlay-headline">' +
    '<span class="kind-pill">' + kindLabel + "</span>" +
    '<span class="chip iter">' + escapeXml(iterationInfo.varName) + "</span>" +
    '<span class="over-word">iterates over</span>' +
    '<span class="chip src">' + escapeXml(iterationInfo.source) + "</span>" +
    (iterationInfo.elementVar
      ? '<span class="over-word">element alias</span><span class="chip">' +
        escapeXml(iterationInfo.elementVar) + " = " + escapeXml(iterationInfo.current.display) +
        "</span>"
      : "") +
    '<span class="over-word">position ' +
    (iterationInfo.index + 1) + " / " + iterationInfo.items.length +
    "</span></div>";

  const slots = iterationInfo.items.map((it, i) => {
    const active = i === iterationInfo.index;
    let badge = "";
    let srcTag = "";
    if (active) {
      badge = '<span class="badge">' + escapeXml(iterationInfo.varName) + "</span>";
    }
    if (i === 0 && iterationInfo.source && iterationInfo.source !== "(range)") {
      srcTag = '<span class="src-tag">' + escapeXml(iterationInfo.source) + "</span>";
    }
    return (
      '<div class="overlay-slot' + (active ? " active" : "") + '">' +
      srcTag +
      badge +
      '<div class="cell">' + escapeXml(it.display) + "</div>" +
      '<span class="idx">' +
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
