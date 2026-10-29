'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const key = 'qb_image_crop_library_v1';
  const canvas = $('source'), ctx = canvas.getContext('2d');
  let source = null, sourceName = '', crops = [], active = -1, drag = null, items = [], selected = new Set();
  const status = message => { $('status').textContent = message; };
  try { const stored = JSON.parse(localStorage.getItem(key) || '[]'); if (!Array.isArray(stored)) throw Error(); items = stored.filter(x => x && typeof x.id === 'string' && typeof x.original === 'string' && x.original.startsWith('data:image/') && typeof x.image === 'string' && x.image.startsWith('data:image/')); }
  catch { status('Could not read the saved library. Existing storage has not been changed.'); }
  function persist(next) {
    try { localStorage.setItem(key, JSON.stringify(next)); items = next; renderLibrary(); return true; }
    catch { status('Local storage is full or unavailable. Nothing was changed. Download images or delete library items to free space.'); return false; }
  }
  const loadImage = url => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(Error('Unable to read this image.')); image.src = url; });
  function draw() {
    if (!source) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0);
    const scale = canvas.width / Math.max(canvas.getBoundingClientRect().width, 1);
    [...crops, ...(drag?.mode === 'draw' ? [rect(drag.start, drag.end)] : [])].forEach((r, i) => {
      ctx.fillStyle = i === active ? '#16a36b35' : '#167aeb20'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = i === active ? '#087946' : '#176dea'; ctx.lineWidth = 2 * scale; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.font = `bold ${14 * scale}px system-ui`; ctx.fillStyle = '#084d34'; ctx.fillText(String(i + 1), r.x + 5 * scale, r.y + 18 * scale);
    });
    if (crops[active]) {
      ctx.fillStyle = 'white'; ctx.strokeStyle = '#087946'; ctx.lineWidth = 2 * scale;
      for (const h of handles(crops[active])) {
        ctx.fillRect(h.x - 4 * scale, h.y - 4 * scale, 8 * scale, 8 * scale);
        ctx.strokeRect(h.x - 4 * scale, h.y - 4 * scale, 8 * scale, 8 * scale);
      }
    }
  }
  let customZoom = 1;
  function resize() {
    if (!source) return;
    const width = $('zoom').value === 'fit' ? Math.min(source.width, Math.max(100, $('workspace').clientWidth - 26)) : source.width * ($('zoom').value === 'custom' ? customZoom : Number($('zoom').value));
    canvas.style.width = `${width}px`; canvas.style.height = `${width * source.height / source.width}px`; draw();
  }
  function cropControls() {
    $('crop-count').textContent = `${crops.length} crop${crops.length === 1 ? '' : 's'}`;
    for (const id of ['undo', 'clear', 'save']) $(id).disabled = !crops.length;
    $('crop-list').replaceChildren();
    crops.forEach((r, i) => { const b = document.createElement('button'); b.textContent = `${i + 1} · ${r.w} × ${r.h}`; b.classList.toggle('active', i === active); b.onclick = () => { active = i; cropControls(); draw(); }; $('crop-list').append(b); });
  }
  const point = e => { const bounds = canvas.getBoundingClientRect(); return { x: Math.round(Math.max(0, Math.min(canvas.width, (e.clientX - bounds.left) * canvas.width / bounds.width))), y: Math.round(Math.max(0, Math.min(canvas.height, (e.clientY - bounds.top) * canvas.height / bounds.height))) }; };
  const rect = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  function handles(r) {
    return [['nw', r.x, r.y], ['n', r.x + r.w / 2, r.y], ['ne', r.x + r.w, r.y],
      ['e', r.x + r.w, r.y + r.h / 2], ['se', r.x + r.w, r.y + r.h],
      ['s', r.x + r.w / 2, r.y + r.h], ['sw', r.x, r.y + r.h], ['w', r.x, r.y + r.h / 2]]
      .map(([edge, x, y]) => ({ edge, x, y }));
  }
  function hit(p, touch = false) {
    const tolerance = (touch ? 16 : 8) * canvas.width / canvas.getBoundingClientRect().width;
    if (crops[active]) {
      const handle = handles(crops[active]).find(h => Math.abs(p.x - h.x) <= tolerance && Math.abs(p.y - h.y) <= tolerance);
      if (handle) return { index: active, mode: 'resize', edge: handle.edge };
    }
    const index = crops.findLastIndex(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    return index < 0 ? { mode: 'draw' } : { index, mode: 'move' };
  }
  const cursor = target => target.mode === 'resize' ? `${target.edge}-resize` : target.mode === 'move' ? 'move' : 'crosshair';
  function updateDrag(p) {
    if (drag.mode === 'draw') { drag.end = p; return; }
    const r = drag.original, dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (drag.mode === 'move') {
      crops[drag.index] = { ...r, x: Math.max(0, Math.min(canvas.width - r.w, r.x + dx)), y: Math.max(0, Math.min(canvas.height - r.h, r.y + dy)) };
    } else {
      let left = r.x, top = r.y, right = r.x + r.w, bottom = r.y + r.h;
      if (drag.edge.includes('w')) left = Math.max(0, Math.min(right - 5, p.x));
      if (drag.edge.includes('e')) right = Math.min(canvas.width, Math.max(left + 5, p.x));
      if (drag.edge.includes('n')) top = Math.max(0, Math.min(bottom - 5, p.y));
      if (drag.edge.includes('s')) bottom = Math.min(canvas.height, Math.max(top + 5, p.y));
      crops[drag.index] = { x: left, y: top, w: right - left, h: bottom - top };
    }
  }
  const workspace = $('workspace'), touches = new Map();
  let gesture = null, panDrag = null, panMode = false, suppressTouch = false;
  const midpoint = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
  const distance = points => Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
  function discardCropDrag() {
    if (!drag) return;
    if (drag.original) crops[drag.index] = drag.original;
    drag = null; cropControls(); draw();
  }
  function startGesture() {
    discardCropDrag(); panDrag = null; suppressTouch = true;
    const points = [...touches.values()].slice(0, 2), center = midpoint(points), bounds = canvas.getBoundingClientRect();
    gesture = { distance: distance(points), zoom: bounds.width / canvas.width,
      anchorX: (center.x - bounds.left) / bounds.width,
      anchorY: (center.y - bounds.top) / bounds.height };
  }
  function zoomAt(zoom, center, anchor) {
    customZoom = Math.max(.1, Math.min(6, zoom));
    const option = $('zoom').querySelector('[value="custom"]');
    option.hidden = false; option.textContent = `${Math.round(customZoom * 100)}%`;
    $('zoom').value = 'custom'; resize();
    const bounds = canvas.getBoundingClientRect();
    workspace.scrollLeft += bounds.left + anchor.x * bounds.width - center.x;
    workspace.scrollTop += bounds.top + anchor.y * bounds.height - center.y;
  }
  $('pan').onclick = () => {
    panMode = !panMode; $('pan').setAttribute('aria-pressed', String(panMode));
    workspace.classList.toggle('pan-mode', panMode); canvas.style.cursor = panMode ? 'grab' : 'crosshair';
  };
  workspace.addEventListener('pointerdown', e => {
    if (!source || e.button !== 0) return;
    if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size >= 2) {
      e.preventDefault(); e.stopPropagation(); workspace.setPointerCapture(e.pointerId); startGesture(); return;
    }
    if (panMode || suppressTouch) {
      e.preventDefault(); e.stopPropagation(); workspace.setPointerCapture(e.pointerId);
      if (!suppressTouch) panDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: workspace.scrollLeft, top: workspace.scrollTop };
    }
  }, true);
  workspace.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture || panDrag || (suppressTouch && e.pointerType === 'touch')) {
      e.preventDefault(); e.stopPropagation();
      if (gesture && touches.size >= 2) {
        const points = [...touches.values()].slice(0, 2);
        zoomAt(gesture.zoom * distance(points) / gesture.distance, midpoint(points), { x: gesture.anchorX, y: gesture.anchorY });
      } else if (panDrag?.id === e.pointerId) {
        workspace.scrollLeft = panDrag.left + panDrag.x - e.clientX;
        workspace.scrollTop = panDrag.top + panDrag.y - e.clientY;
      }
    } else if (panMode) { e.stopPropagation(); canvas.style.cursor = 'grab'; }
  }, true);
  function endNavigation(e) {
    const intercepted = gesture || panDrag?.id === e.pointerId || (suppressTouch && e.pointerType === 'touch');
    touches.delete(e.pointerId);
    if (panDrag?.id === e.pointerId) panDrag = null;
    if (touches.size < 2) gesture = null;
    else if (intercepted) startGesture();
    if (!touches.size) suppressTouch = false;
    if (intercepted) {
      e.stopPropagation();
      if (e.type !== 'lostpointercapture' && workspace.hasPointerCapture(e.pointerId)) workspace.releasePointerCapture(e.pointerId);
    }
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) workspace.addEventListener(event, endNavigation, true);
  workspace.addEventListener('wheel', e => {
    if (!source || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault(); discardCropDrag();
    const bounds = canvas.getBoundingClientRect();
    zoomAt(bounds.width / canvas.width * Math.exp(-e.deltaY * .01), { x: e.clientX, y: e.clientY },
      { x: (e.clientX - bounds.left) / bounds.width, y: (e.clientY - bounds.top) / bounds.height });
  }, { passive: false });
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !source || drag) return;
    e.preventDefault(); canvas.focus(); canvas.setPointerCapture(e.pointerId);
    const p = point(e), target = e.shiftKey ? { mode: 'draw' } : hit(p, e.pointerType === 'touch');
    active = target.index ?? -1;
    drag = { ...target, pointerId: e.pointerId, start: p, end: p, original: active >= 0 ? { ...crops[active] } : null };
    canvas.style.cursor = cursor(target); cropControls(); draw();
  });
  canvas.addEventListener('pointermove', e => {
    if (drag) {
      if (e.pointerId !== drag.pointerId) return;
      updateDrag(point(e)); draw();
    } else canvas.style.cursor = cursor(hit(point(e), e.pointerType === 'touch'));
  });
  canvas.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    updateDrag(point(e));
    if (drag.mode === 'draw') {
      const r = rect(drag.start, drag.end);
      if (r.w >= 5 && r.h >= 5) { crops.push(r); active = crops.length - 1; }
    }
    drag = null; canvas.releasePointerCapture(e.pointerId);
    cropControls(); draw(); canvas.style.cursor = cursor(hit(point(e)));
  });
  function cancelDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.original) crops[drag.index] = drag.original;
    drag = null; cropControls(); draw();
  }
  canvas.addEventListener('pointercancel', cancelDrag);
  canvas.addEventListener('lostpointercapture', cancelDrag);
  canvas.addEventListener('keydown', e => { if ((e.key === 'Delete' || e.key === 'Backspace') && active >= 0) { e.preventDefault(); crops.splice(active, 1); active = -1; cropControls(); draw(); } });
  $('upload').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    try { const image = await loadImage(url); source = image; sourceName = file.name.replace(/\.[^.]+$/, ''); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; crops = []; active = -1; drag = null; touches.clear(); gesture = null; panDrag = null; suppressTouch = false; $('zoom').value = 'fit'; workspace.scrollLeft = workspace.scrollTop = 0; canvas.hidden = false; $('empty').hidden = true; resize(); cropControls(); status('Drag a rectangle for each crop, then save them together.'); }
    catch (error) { status(error.message); } finally { URL.revokeObjectURL(url); e.target.value = ''; }
  };
  $('zoom').onchange = resize; window.addEventListener('resize', resize);
  $('undo').onclick = () => { crops.pop(); active = crops.length - 1; cropControls(); draw(); };
  $('clear').onclick = () => { crops = []; active = -1; cropControls(); draw(); };
  // randomUUID is unavailable on HTTP LAN addresses in many mobile browsers.
  function imageId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return `crop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
  $('save').onclick = () => {
    if (!source || !crops.length) { status('Draw at least one crop before saving.'); return; }
    try {
      const added = crops.map((r, i) => {
        const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
        const context = c.getContext('2d');
        if (!context) throw new Error('The browser could not allocate an image canvas. Try a smaller crop.');
        context.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        const image = c.toDataURL('image/png');
        if (!image.startsWith('data:image/png')) throw new Error('The crop exceeds this browser’s image size limit. Try a smaller crop.');
        c.width = c.height = 0;
        return { id: imageId(), name: `${sourceName} crop ${i + 1}`, width: r.w, height: r.h, original: image, image, mode: 'Original' };
      });
      if (persist([...items, ...added])) { crops = []; active = -1; cropControls(); draw(); status(`Saved ${added.length} crops to your local library.`); }
    } catch (error) {
      status(`Could not save crops: ${error.message || 'Unknown browser error'}. Your crop selections are still available.`);
    }
  };
  const imageBytes = data => { const base64 = data.slice(data.indexOf(',') + 1); return Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0); };
  const fileSize = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;
  let compressionPreviews = new Map(), previewVersion = 0, previewTimer;
  const compressionTargets = () => items.filter(x => $('scope').value === 'all' || selected.has(x.id));
  function refreshCompression() {
    clearTimeout(previewTimer); const version = ++previewVersion;
    compressionPreviews = new Map(); $('compress').disabled = true;
    document.querySelectorAll('.compression-size').forEach(node => { node.textContent = ''; });
    document.querySelectorAll('.thumbnail img').forEach(img => { const item = items.find(x => x.id === img.dataset.id); if (item) img.src = item.image; });
    const targets = compressionTargets();
    $('compression-summary').textContent = targets.length ? 'Calculating preview…' : 'Select images to compress.';
    previewTimer = setTimeout(() => buildCompressionPreview(version, targets), 180);
  }
  async function buildCompressionPreview(version, targets) {
    const quality = Number($('quality').value) / 100, format = $('compression-format').value;
    try {
      const previews = new Map(); let currentBytes = 0, nextBytes = 0;
      for (const item of targets) {
        const image = await loadImage(item.image);
        if (version !== previewVersion) return;
        const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
        const context = c.getContext('2d'); if (!context) throw Error('Unable to allocate preview canvas.');
        context.fillStyle = 'white'; context.fillRect(0, 0, c.width, c.height); context.drawImage(image, 0, 0);
        const result = c.toDataURL(format, quality); c.width = c.height = 0;
        if (!result.startsWith(`data:${format};`)) throw Error('This browser does not support the selected format.');
        previews.set(item.id, { image: result, source: item.image });
        currentBytes += imageBytes(item.image); nextBytes += imageBytes(result);
      }
      if (version !== previewVersion) return;
      compressionPreviews = previews;
      document.querySelectorAll('.compression-size').forEach(node => { const result = previews.get(node.dataset.id); if (result) node.textContent = `Preview: ${fileSize(imageBytes(result.image))}`; });
      document.querySelectorAll('.thumbnail img').forEach(img => { const result = previews.get(img.dataset.id); if (result) img.src = result.image; });
      $('compression-summary').textContent = targets.length ? `${targets.length} images · Current ${fileSize(currentBytes)} → Preview ${fileSize(nextBytes)}${nextBytes > currentBytes ? ' (larger)' : ''}` : 'Select images to compress.';
      $('compress').disabled = !targets.length;
    } catch (error) { if (version === previewVersion) $('compression-summary').textContent = `Preview failed: ${error.message}`; }
  }
  $('quality').oninput = () => { $('quality-value').value = `${$('quality').value}%`; refreshCompression(); };
  $('compression-format').onchange = refreshCompression; $('scope').onchange = refreshCompression;
  $('compress').onclick = () => {
    const previews = compressionPreviews;
    if (!previews.size) return;
    if (persist(items.map(item => { const preview = previews.get(item.id); return preview && preview.source === item.image ? { ...item, image: preview.image } : item; }))) status(`Compression applied to ${previews.size} images. Originals are preserved.`);
  };
  function download(item) { const a = document.createElement('a'); a.href = item.image; a.download = `${item.name.replace(/[\\/:*?"<>|]/g, '_') || 'crop'}.${item.image.startsWith('data:image/jpeg') ? 'jpg' : item.image.startsWith('data:image/webp') ? 'webp' : 'png'}`; a.click(); }
  async function copy(item) {
    try { if (!navigator.clipboard?.write || !window.ClipboardItem) throw Error(); const image = await loadImage(item.image); const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight; c.getContext('2d').drawImage(image, 0, 0); const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png')); if (!blob) throw Error('Clipboard conversion failed'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); status(`Copied ${item.name} to clipboard.`); }
    catch { status('Clipboard access failed. Use HTTPS or localhost and allow clipboard access, or download the image.'); }
  }
  function renderLibrary() {
    $('library').replaceChildren(); $('library-count').textContent = items.length;
    selected = new Set([...selected].filter(id => items.some(x => x.id === id)));
    for (const id of ['download-all', 'grayscale', 'bw', 'restore', 'select-all']) $(id).disabled = !items.length;
    $('delete-selected').disabled = !selected.size;
    if (!items.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Your saved crops will appear here.'; $('library').append(p); }
    items.forEach(item => {
      const card = document.createElement('article'); card.className = 'card'; card.classList.toggle('selected', selected.has(item.id));
      const preview = document.createElement('div'); preview.className = 'thumbnail'; const img = document.createElement('img'); img.src = item.image; img.dataset.id = item.id; img.alt = item.name; img.loading = 'lazy'; preview.append(img);
      const body = document.createElement('div'); body.className = 'card-body'; const title = document.createElement('label'); title.className = 'card-title';
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(item.id); check.setAttribute('aria-label', `Select ${item.name}`); check.onchange = () => { check.checked ? selected.add(item.id) : selected.delete(item.id); renderLibrary(); };
      const name = document.createElement('input'); name.type = 'text'; name.value = item.name; name.setAttribute('aria-label', 'Image name'); name.onchange = () => persist(items.map(x => x.id === item.id ? { ...x, name: name.value.trim() || 'Untitled crop' } : x)); title.append(check, name);
      const meta = document.createElement('div'); meta.className = 'card-meta'; meta.textContent = `${item.width} × ${item.height} · ${item.mode}`;
      const sizes = document.createElement('div'); sizes.className = 'card-meta'; sizes.textContent = `Current: ${fileSize(imageBytes(item.image))} · Original: ${fileSize(imageBytes(item.original))}`;
      const compression = document.createElement('div'); compression.className = 'card-meta compression-size'; compression.dataset.id = item.id;
      const actions = document.createElement('div'); actions.className = 'card-actions';
      for (const [text, action] of [['Copy image', () => copy(item)], ['Download', () => download(item)], ['Delete', () => { if (persist(items.filter(x => x.id !== item.id))) status('Image deleted.'); }]]) { const b = document.createElement('button'); b.textContent = text; b.onclick = action; actions.append(b); }
      body.append(title, meta, sizes, compression, actions); card.append(preview, body); $('library').append(card);
    });
    refreshCompression();
  }
  async function convert(mode) {
    const targets = items.filter(x => $('scope').value === 'all' || selected.has(x.id));
    if (!targets.length) { status('Select library images first.'); return; }
    const snapshot = items; const threshold = Number($('threshold').value);
    status('Converting images…');
    try {
      const updates = new Map();
      for (const item of targets) {
        if (mode === 'Original') { updates.set(item.id, { ...item, image: item.original, mode }); continue; }
        const image = await loadImage(item.image); const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
        const context = c.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, c.width, c.height); context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < pixels.data.length; i += 4) { let value = Math.round(.2126 * pixels.data[i] + .7152 * pixels.data[i + 1] + .0722 * pixels.data[i + 2]); if (mode === 'Black & white') value = value >= threshold ? 255 : 0; pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; }
        context.putImageData(pixels, 0, 0); updates.set(item.id, { ...item, image: c.toDataURL('image/png'), mode });
      }
      if (items !== snapshot) { status('Library changed during conversion. Please try again.'); return; }
      if (persist(items.map(x => updates.get(x.id) || x))) status(`${targets.length} images updated: ${mode}.`);
    } catch { status('Conversion failed. Library images have not changed.'); }
  }
  $('grayscale').onclick = () => convert('Grayscale'); $('bw').onclick = () => convert('Black & white'); $('restore').onclick = () => convert('Original');
  $('threshold').oninput = () => { $('threshold-value').value = $('threshold').value; };
  $('select-all').onclick = () => { selected = selected.size === items.length ? new Set() : new Set(items.map(x => x.id)); renderLibrary(); };
  $('delete-selected').onclick = () => { if (persist(items.filter(x => !selected.has(x.id)))) status('Selected images deleted.'); };
  $('download-all').onclick = async () => { const downloads = [...items]; for (const item of downloads) { download(item); await new Promise(resolve => setTimeout(resolve, 150)); } status('Downloads requested. Your browser may ask to allow multiple downloads.'); };
  window.addEventListener('storage', e => { if (e.key === key) status('The library changed in another tab. Reload this page before making further changes.'); });
  renderLibrary();
})();
