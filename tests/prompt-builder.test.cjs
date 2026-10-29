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

test('prompt detail levels progressively expand instructions while retaining import requirements', () => {
    const context = vm.createContext({ TEMPLATE_HEADERS: Array(31), QUESTION_METADATA_VALUES: {skill:['Reading','Writing'],actfl_level:['Novice','Intermediate'],actfl_mode:['Interpretive']} });
    vm.runInContext(source.slice(source.indexOf('function promptDetailRequirement('), source.indexOf('function promptOutputRequirement(')), context);
    const prompts = ['simplest','simple','intermediate'].map(level => context.promptDetailRequirement(level));
    assert.ok(prompts[0].length < prompts[1].length && prompts[1].length < prompts[2].length);
    for (const prompt of prompts) {
        assert.match(prompt, /exactly 31 cells/);
        assert.match(prompt, /verified=false/);
        assert.match(prompt, /recompute correct letters/);
        assert.ok(prompt.includes(String.raw`\( ... \)`));
        assert.match(prompt, /Leave other types' answer fields blank/);
    }
});

test('rendered prompts honor all four detail choices and preserve selected output settings', () => {
    const fields = Object.fromEntries(ids.map(id => [id,{value:'0'}]));
    Object.assign(fields,{pickMcqCount:{value:'3'},promptDetail:{value:'detailed'},promptImagePaper:{checked:true},promptDifficulty:{value:'Easy'},promptCustomRequirements:{value:'Use mangoes.'},promptCountStatus:{textContent:''}});
    const context = vm.createContext({ $: id => fields[id], TEMPLATE_HEADERS:Array(31).fill('header'), QUESTION_METADATA_VALUES:{skill:['Reading'],actfl_level:['Novice'],actfl_mode:['Interpretive']},els:{aiPromptText:{textContent:''}},document:{querySelector:()=>({value:'none'})} });
    vm.runInContext(source.slice(source.indexOf('function renderPrompt('),source.indexOf('function selectedPromptLabel('))+source.slice(source.indexOf('function promptTypeRequirement('),source.indexOf('async function copyPrompt(')),context);
    context.selectedPromptLabel = id => ({promptClass:'IX',promptSubject:'Maths',promptChapter:'Algebra'})[id];
    context.selectedPromptLabels = () => ['Equations'];
    const lengths = [];
    for(const level of ['simplest','simple','intermediate','detailed']) {
        fields.promptDetail.value=level;
        context.renderPrompt();
        const prompt=context.els.aiPromptText.textContent;
        lengths.push(prompt.length);
        assert.doesNotMatch(prompt, /Selected diagram format:|Do not include diagrams|chosen diagram format/);
        assert.match(prompt, /LaTeX/);
        assert.match(prompt, /Taxonomy selection is complete/);
        assert.match(prompt, /do not ask for additional taxonomy labels, IDs, or confirmation/);
        assert.doesNotMatch(prompt, /If selections are missing|Missing required selections/);
        for(const expected of ['3 mcq','IX','Equations','Use mangoes.','PNG or JPEG'])assert.ok(prompt.includes(expected),`${level}: ${expected}`);
    }
    assert.ok(lengths.every((length,index)=>index===0 || length>lengths[index-1]));
    context.selectedPromptLabels = () => [];
    for (const level of ['simplest','simple','intermediate','detailed']) {
        fields.promptDetail.value = level;
        context.renderPrompt();
        const prompt = context.els.aiPromptText.textContent;
        assert.match(prompt, /Missing required selections: topic\./);
        assert.match(prompt, /Ask only for these missing labels/);
        assert.doesNotMatch(prompt, /Taxonomy selection is complete/);
    }
});
