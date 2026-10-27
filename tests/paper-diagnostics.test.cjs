const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../question-paper.js'), 'utf8');
const loader = source.slice(source.indexOf('async function loadQuestion('), source.indexOf('\nasync function addExisting'));
function fixture(data, failure) {
    const logs = [];
    const context = vm.createContext({
        db: {}, uid: () => 'editor-key',
        doc: (_, collection, id) => ({ collection, id }),
        getDoc: async ref => {
            if (failure) throw failure;
            return { id: ref.id, exists: () => data !== undefined, data: () => data };
        },
        console: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) }
    });
    vm.runInContext(loader, context);
    return { load: context.loadQuestion, logs };
}
test('invalid question diagnostic identifies list position, type and option shape', async () => {
    const { load, logs } = fixture({ type: 'fib', options: [] });
    await assert.rejects(load('bad-question', { listId: 'paper-id', position: 2 }), /bad-question \(position 2\).*type "fib" and 0 options/);
    const summary = logs.find(entry => entry[0].includes('document shape'))[1];
    assert.equal(summary.listId, 'paper-id');
    assert.equal(summary.position, 2);
    assert.equal(summary.optionsIsArray, true);
    assert.equal(summary.optionCount, 0);
});
test('non-array options are reported even when their length property is four', async () => {
    const { load } = fixture({ type: 'mcq', options: { length: 4 } });
    await assert.rejects(load('malformed'), /non-array options/);
});
test('Firestore failures retain their code and question context', async () => {
    const error = Object.assign(new Error('Permission denied'), { code: 'permission-denied' });
    const { load, logs } = fixture(null, error);
    await assert.rejects(load('private-question', { listId: 'paper-id', position: 3 }), /Permission denied/);
    const failure = logs.find(entry => entry[0].includes('load failed'))[1];
    assert.equal(failure.code, 'permission-denied');
    assert.equal(failure.questionId, 'private-question');
    assert.equal(failure.position, 3);
});
test('valid MCQs retain the existing editor representation', async () => {
    const data = { type: 'mcq', options: Array.from({ length: 4 }, () => ({ html: 'Option', correct: false })) };
    const { load } = fixture(data);
    const result = await load('valid');
    assert.equal(result.id, 'valid');
    assert.equal(result.data, data);
    assert.equal(result.dirty, false);
});

test('mixed-list loading skips non-MCQs without error logs', async () => {
    for (const type of ['short_answer', 'fib', 'true_false']) {
        const { load, logs } = fixture({ type, options: [] });
        assert.equal(await load('other', { skipOtherTypes: true, position: 2 }), null);
        assert.ok(logs.some(entry => entry[0].includes('Skipping non-MCQ')));
        assert.ok(!logs.some(entry => entry[0].includes('load failed')));
    }
});
test('mixed-list loading still rejects malformed MCQs', async () => {
    const { load } = fixture({ type: 'mcq', options: [] });
    await assert.rejects(load('bad', { skipOtherTypes: true }), /expected an MCQ with four options/);
});
