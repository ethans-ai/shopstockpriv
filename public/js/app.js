// ShopStock client helpers — no framework, no build step.

// Remember who is using this phone/PC so mutations can be attributed
// without accounts. Prefills every hidden person field and the checkout name.
(function () {
  const KEY = 'shopstock_person';

  function currentName() {
    try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
  }

  function remember(name) {
    try { if (name && name.trim()) localStorage.setItem(KEY, name.trim()); } catch {}
  }

  function fillHiddenFields(root) {
    const name = currentName();
    for (const el of (root || document).querySelectorAll('.person-hidden')) {
      el.value = name;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    fillHiddenFields(document);

    // Prefill visible checkout name inputs
    for (const input of document.querySelectorAll('.person-input')) {
      if (!input.value) input.value = currentName();
      input.addEventListener('change', () => remember(input.value));
    }

    // Save the name whenever a checkout form is submitted
    document.addEventListener('submit', (e) => {
      const nameInput = e.target.querySelector?.('input[name="person_name"]');
      if (nameInput) remember(nameInput.value);
      fillHiddenFields(e.target);
    }, true);

    // Person-name suggestions for checkout fields
    const datalist = document.getElementById('people-list');
    const personInput = document.querySelector('.person-input');
    if (datalist && personInput) {
      fetch('/api/people/suggest')
        .then(r => r.json())
        .then(names => {
          for (const n of names) {
            const opt = document.createElement('option');
            opt.value = n;
            datalist.appendChild(opt);
          }
        })
        .catch(() => {});
    }
  });

  // htmx swaps in new fragments (qty controls) — refill hidden fields
  document.addEventListener('htmx:afterSwap', (e) => fillHiddenFields(e.target));
})();

// USB barcode scanner wedge: scanners act as keyboards, "typing" the code very
// fast and ending with Enter.
//
// Outside form fields: rapid keystrokes + Enter navigate to the scanned code.
// Inside the search box: native behavior (Enter submits; the server extracts
//   codes from scanned URLs too).
// Inside any OTHER field (qty "set" input, category select, edit form...): a
//   scanner-speed burst is intercepted — the field is restored to its pre-scan
//   value, the Enter never submits the form, and the app navigates instead.
//   This stops a stray scan from silently corrupting a quantity or a form.
(function () {
  const WEDGE_GAP_MS = 150; // outside fields: scanners <50ms/char, blind typing slower
  const FIELD_GAP_MS = 75;  // inside fields: stricter, so fast human typing never triggers
  const MIN_LENGTH = 4;

  function parseScan(raw) {
    const s = raw.trim();
    // Old QR labels encode URLs — a 2D scanner types the whole URL; extract the code
    const url = s.match(/\/(i|l)\/([A-Za-z0-9]{4,8})$/);
    if (url) return url[2];
    if (/^[A-Za-z0-9]{4,8}$/.test(s)) return s;
    return null;
  }

  function goTo(code) {
    window.location.href = '/search?q=' + encodeURIComponent(code);
  }

  function isFormField(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
                  || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function isSearchField(el) {
    return el && el.tagName === 'INPUT' && (el.type === 'search' || el.name === 'q');
  }

  let buf = '', last = 0;                    // outside-field burst
  let fieldBuf = '', fieldLast = 0, fieldSnap = null; // in-field burst + pre-scan snapshot

  document.addEventListener('keydown', (e) => {
    // Real scanners never auto-repeat and never hold modifiers
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const now = Date.now();

    if (isFormField(t)) {
      if (isSearchField(t)) return; // scanning into search is a supported path

      if (now - fieldLast > FIELD_GAP_MS) {
        fieldBuf = '';
        // Snapshot before the first burst character lands in the field
        fieldSnap = t.tagName === 'SELECT'
          ? { el: t, idx: t.selectedIndex }
          : { el: t, val: t.value };
      }
      fieldLast = now;

      if (e.key === 'Enter') {
        if (fieldBuf.length >= MIN_LENGTH) {
          // Scanner-speed burst: this was a scan, not typing. Block the
          // implicit form submit and undo what the scanner typed.
          e.preventDefault();
          e.stopPropagation();
          const code = parseScan(fieldBuf);
          if (fieldSnap && fieldSnap.el === t) {
            if (fieldSnap.idx !== undefined) t.selectedIndex = fieldSnap.idx;
            else t.value = fieldSnap.val;
          }
          if (code) goTo(code);
        }
        fieldBuf = '';
        return;
      }
      if (e.key.length === 1) fieldBuf += e.key;
      return;
    }

    // Outside form fields
    if (now - last > WEDGE_GAP_MS) buf = '';
    last = now;

    if (e.key === 'Enter') {
      if (buf.length >= MIN_LENGTH) {
        // The burst was claimed as a scan — suppress Enter even if the code is
        // unrecognized, so a focused button/link/summary isn't activated.
        e.preventDefault();
        const code = parseScan(buf);
        if (code) goTo(code);
      }
      buf = '';
      return;
    }
    if (e.key.length === 1) {
      buf += e.key;
      if (buf.length >= MIN_LENGTH) e.preventDefault(); // suppress stray page effects mid-scan
    }
  }, true); // capture phase: runs before htmx and implicit submit handling
})();
