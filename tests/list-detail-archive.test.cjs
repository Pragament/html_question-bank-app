const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../list-detail.js'), 'utf8');
const functions = source.slice(source.indexOf('function archiveCandidates()'), source.indexOf('if (window.mermaid)'));
function fixture({ fail = false, confirm = true } = {}) {
    const elements = new Map(), writes = [];
    const rows = [
        { id: 'mine', authorUid: 'me', status: 'published' },
        { id: 'draft', authorUid: 'me', status: 'draft' },
        { id: 'foreign', authorUid: 'someone-else', status: 'published' },
        { id: 'archived', authorUid: 'me', status: 'archived' }
    ];
    const context = vm.createContext({
        currentUser: { uid: 'me' }, currentList: { id: 'list' }, loadedQuestions: rows,
        selectedQuestionIds: new Set(rows.map(q => q.id)), archiveSaving: false,
        $: id => { if (!elements.has(id)) elements.set(id, { addEventListener() {} }); return elements.get(id); },
        document: { querySelectorAll: () => [] }, window: { confirm: () => confirm },
        db: {}, COLLECTIONS: { questions: 'qb_questions_v1' },
        doc: (_, collection, id) => ({ collection, id }), serverTimestamp: () => 'timestamp',
        chunk: (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size)),
        writeBatch: () => { const pending = []; return { update: (ref, data) => pending.push({ ref, data }), commit: async () => { if (fail) throw new Error('Permission denied'); writes.push(...pending); } }; },
        renderList() {}, console: { error() {} }
    });
    vm.runInContext(functions, context);
    return { context, rows, writes, elements };
}
test('bulk selection excludes other authors and already archived questions', () => {
    const { context } = fixture();
    context.updateArchiveControls();
    assert.deepEqual([...context.selectedQuestionIds], ['mine', 'draft']);
});
test('bulk archive only writes authored questions and preserves their previous status', async () => {
    const { context, rows, writes } = fixture();
    await context.archiveSelectedQuestions();
    assert.deepEqual(writes.map(w => w.ref.id), ['mine', 'draft']);
    assert.deepEqual(writes.map(w => w.data.previousStatus), ['published', 'draft']);
    assert.ok(writes.every(w => w.data.status === 'archived' && w.data.archivedAt));
    assert.equal(rows[0].status, 'archived');
    assert.equal(rows[2].status, 'published');
    assert.equal(context.archiveSaving, false);
});
test('failed archive keeps questions unchanged and selected for retry', async () => {
    const { context, rows, writes, elements } = fixture({ fail: true });
    await context.archiveSelectedQuestions();
    assert.equal(writes.length, 0);
    assert.equal(rows[0].status, 'published');
    assert.ok(context.selectedQuestionIds.has('mine'));
    assert.match(elements.get('detailArchiveStatus').textContent, /Remaining questions were not archived/);
    assert.equal(context.archiveSaving, false);
});
test('canceling confirmation makes no writes', async () => {
    const { context, writes } = fixture({ confirm: false });
    await context.archiveSelectedQuestions();
    assert.equal(writes.length, 0);
});
