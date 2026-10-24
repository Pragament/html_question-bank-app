const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(documents) {
    const reads = [];
    const context = vm.createContext({
        doc: (_, collection, id) => ({ collection, id }),
        getDoc: async ref => {
            reads.push(ref);
            return { exists: () => documents.has(ref.id), data: () => documents.get(ref.id) };
        }
    });
    const source = fs.readFileSync(require('node:path').join(__dirname, '../comprehension.js'), 'utf8')
        .replace(/^import .*;\n/m, '').replaceAll('export ', '');
    vm.runInContext(source, context);
    return { context, reads };
}

test('linked questions load one shared passage and resolve later edits', async () => {
    const documents = new Map([['passage', { passageHtml: '<p>Original passage</p>' }]]);
    const { context, reads } = fixture(documents);
    const questions = [
        { comprehensionId: 'passage', promptHtml: 'Question one' },
        { comprehensionId: 'passage', promptHtml: 'Question two' }
    ];
    let passages = await context.loadPassages({}, questions);
    assert.equal(reads.length, 1);
    assert.equal(reads[0].collection, 'qb_comprehensions_v1');
    assert.equal(context.questionPromptHtml(questions[0], passages), '<p>Original passage</p><hr>Question one');
    documents.set('passage', { passageHtml: '<p>Edited passage</p>' });
    passages = await context.loadPassages({}, questions);
    for (const question of questions) {
        assert.equal(context.questionPromptHtml(question, passages), `<p>Edited passage</p><hr>${question.promptHtml}`);
        assert.ok(!question.promptHtml.includes('passage'));
    }
});

test('standalone and legacy embedded passages need no reference reads', async () => {
    const { context, reads } = fixture(new Map());
    const questions = [
        { promptHtml: 'Standalone' },
        { comprehensionId: 'legacy', comprehensionPassageHtml: 'Legacy passage', promptHtml: 'Legacy passage<hr>Question' }
    ];
    const passages = await context.loadPassages({}, questions);
    assert.equal(reads.length, 0);
    for (const question of questions) assert.equal(context.questionPromptHtml(question, passages), question.promptHtml);
});

test('missing passages fail loading instead of silently omitting question context', async () => {
    const { context } = fixture(new Map());
    await assert.rejects(context.loadPassages({}, [{ comprehensionId: 'missing' }]), /could not be found/);
});
