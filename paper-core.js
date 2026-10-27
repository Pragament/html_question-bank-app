export const LETTERS = ['A', 'B', 'C', 'D'];
export const LAYOUTS = ['1x4', '2x2', '4x1'];
export function listName({ className, subjectName, date, identifier }) {
    return [className, subjectName, date, identifier?.trim()].filter(Boolean).join(' · ');
}
export function optionOrder(order) {
    return Array.isArray(order) && order.length === 4 && new Set(order).size === 4 && order.every(i => Number.isInteger(i) && i >= 0 && i < 4) ? [...order] : [0, 1, 2, 3];
}
// Only this question's explicit list setting may change the source option order.
export function listOptionOrder(list, questionId) {
    const settings = list?.questionSettings;
    if (!settings || !Object.hasOwn(settings, questionId)) return [0, 1, 2, 3];
    const questionSettings = settings[questionId];
    return questionSettings && Object.hasOwn(questionSettings, 'optionOrder')
        ? optionOrder(questionSettings.optionOrder)
        : [0, 1, 2, 3];
}
export function move(items, from, to) {
    if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
    const [item] = items.splice(from, 1); items.splice(to, 0, item); return items;
}
export function shuffle(items, random = Math.random) {
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    return items;
}
export function correctLetters(question, order) {
    return optionOrder(order).flatMap((i, position) => question.options?.[i]?.correct ? [LETTERS[position]] : []);
}
export function earnsFullMarks(question, selected) {
    const answers = [...new Set(selected)];
    const correct = (question.options || []).flatMap((o, i) => o.correct ? [i] : []);
    if (!answers.length || answers.some(i => !correct.includes(i))) return false;
    return question.multipleCorrectMode === 'any' || correct.every(i => answers.includes(i));
}
export function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
export function csv(rows) { return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'); }
export function xml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }

// A standards-compliant uncompressed ZIP: keeps DOCX generation local and dependency-free.
export function zip(files) {
    const encoder = new TextEncoder();
    const parts = [], directory = [];
    let offset = 0;
    const record = size => { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; };
    const crc32 = bytes => {
        let crc = 0xffffffff;
        for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
        return (crc ^ 0xffffffff) >>> 0;
    };
    for (const [path, content] of Object.entries(files)) {
        const name = encoder.encode(path), data = typeof content === 'string' ? encoder.encode(content) : content;
        const crc = crc32(data), local = record(30), central = record(46);
        local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint32(14, crc, true);
        local.view.setUint32(18, data.length, true); local.view.setUint32(22, data.length, true); local.view.setUint16(26, name.length, true);
        central.view.setUint32(0, 0x02014b50, true); central.view.setUint16(4, 20, true); central.view.setUint16(6, 20, true);
        central.view.setUint32(16, crc, true); central.view.setUint32(20, data.length, true); central.view.setUint32(24, data.length, true);
        central.view.setUint16(28, name.length, true); central.view.setUint32(42, offset, true);
        parts.push(local.bytes, name, data); directory.push(central.bytes, name); offset += 30 + name.length + data.length;
    }
    const directorySize = directory.reduce((n, p) => n + p.length, 0), end = record(22);
    end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, Object.keys(files).length, true); end.view.setUint16(10, Object.keys(files).length, true);
    end.view.setUint32(12, directorySize, true); end.view.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end.bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// Keep hidden non-MCQs in the source list while applying the visible MCQ order.
export function preserveSkippedQuestions(visibleIds, originalIds, skippedIds) {
    const skipped = new Set(skippedIds);
    let index = 0;
    const result = [];
    for (const id of originalIds) {
        if (skipped.has(id)) result.push(id);
        else if (index < visibleIds.length) result.push(visibleIds[index++]);
    }
    return [...result, ...visibleIds.slice(index)];
}
