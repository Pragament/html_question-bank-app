const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const ids = ['pickMcqCount', 'pickFibCount', 'pickShortAnswerCount', 'pickTrueFalseCount'];
function builder(values) {
    const context = vm.createContext({ $: id => ({ value: values[ids.indexOf(id)] }) });
    vm.runInContext(source.slice(source.indexOf('function promptOutputRequirement('), source.indexOf('function promptDiagramRequirement(')) + source.slice(source.indexOf('function promptTypeRequirement('), source.indexOf('async function copyPrompt(')), context);
    return context;
}
test('zero counts exclude types while blank counts retain Auto', () => {
    const prompt = builder(['5', '0', '', '0']).promptTypeRequirement();
    assert.match(prompt, /create exactly 5 mcq row/);
    assert.match(prompt, /blank type counts, include short_answer/);
    assert.match(prompt, /do not create rows with these types: fib, true_false/);
});
test('all zero produces header only and suppresses image pages', () => {
    const context = builder(['0', '0', '0', '0']);
    assert.match(context.promptTypeRequirement(), /exactly 0 question rows/);
    assert.doesNotMatch(context.promptTypeRequirement(), /balanced mix/);
    for (const image of [false, true]) {
        assert.match(context.promptOutputRequirement(image, true), /Return only the CSV header/);
        assert.match(context.promptOutputRequirement(image, true), /Do not generate blank question-paper images/);
    }
});
test('optional image output matches CSV and keeps answers off student paper', () => {
    const context = builder(['1', '0', '0', '0']);
    assert.equal(context.promptOutputRequirement(false, false), '- Return only valid CSV inside one csv code block.');
    const prompt = context.promptOutputRequirement(true, false);
    assert.match(prompt, /actual PNG or JPEG page attachments/);
    assert.match(prompt, /same order and with identical wording/);
    assert.match(prompt, /answer keys, explanations, and teacher metadata out/);
    assert.match(prompt, /Do not invent base64 image data/);
});
