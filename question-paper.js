import { createRichAuthoring } from './rich-authoring.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, getDoc, getDocs, getFirestore, query, where, or, and, limit, orderBy, documentId, startAfter, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { PASSAGES_COLLECTION, referencesPassage, loadPassages } from './comprehension.js';
import { LETTERS, LAYOUTS, listName, listOptionOrder, move, shuffle, correctLetters, preserveSkippedQuestions, csv, xml } from './paper-core.js';
import { downloadPaperDocx } from './paper-docx.js';

const app = initializeApp({ apiKey:'AIzaSyAYlezFn0tSSQHA-vRnJeBfJ-Om1YlDghk', authDomain:'eschool-dev-4c6b4.firebaseapp.com', projectId:'eschool-dev-4c6b4', storageBucket:'eschool-dev-4c6b4.firebasestorage.app', messagingSenderId:'875648503944', appId:'1:875648503944:web:ea0d256e7aa977496f0f3d' });
const auth = getAuth(app), db = getFirestore(app);
const $ = id => document.getElementById(id);
let user = null, taxonomy = [], lists = [], items = [], passages = new Map(), listId = null, listOwner = null;
let skippedQuestionIds = [], sourceQuestionIds = [];
let dirty = false, busy = false, activeEditor = null, selection = null, bankRows = [], bankCursor = null;
const esc = xml;
// Generate an ID locally through Firebase, including browsers without randomUUID.
// Creating a document reference does not write anything to Firestore.
const uid = () => doc(collection(db, 'qb_questions_v1')).id;
const paperAuthoring = createRichAuthoring({
    selector: '.editor[contenteditable="true"]',
    clean,
    onError: message => status(message, true),
    onTarget: label => { $('editorTarget').textContent = `${label} · Paste images directly at the cursor.`; }
});
const status = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); };
const canEditList = () => !listOwner || listOwner === user?.uid;
const canEditQuestion = item => canEditList() && (!item.id || item.data.authorUid === user?.uid);
const canEditPassage = passage => canEditList() && (!passage.saved || passage.authorUid === user?.uid);
const label = id => taxonomy.find(node => node.id === id)?.label || '';
const text = html => { const div = document.createElement('div'); div.innerHTML = clean(html); return div.textContent.trim(); };
function clean(html) {
    const root = document.createElement('template'); root.innerHTML = String(html || '');
    const allowed = new Set(['P','DIV','SPAN','B','STRONG','I','EM','U','S','SUB','SUP','CODE','PRE','BR','HR','UL','OL','LI','TABLE','THEAD','TBODY','TR','TD','TH','IMG','BLOCKQUOTE']);
    root.content.querySelectorAll('[data-latex]').forEach(token => { token.textContent = token.dataset.latex; });
    root.content.querySelectorAll('script,style,iframe,object,embed,svg,math,form,input,button,select,textarea').forEach(el => el.remove());
    root.content.querySelectorAll('*').forEach(el => {
        if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
        [...el.attributes].forEach(attr => {
            const safe = ['alt','title','colspan','rowspan'].includes(attr.name) || (el.tagName === 'IMG' && attr.name === 'src' && /^(https?:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(attr.value)) || (el.tagName === 'SPAN' && ['data-latex','data-code'].includes(attr.name)) || (el.tagName === 'SPAN' && el.hasAttribute('data-latex') && attr.name === 'contenteditable' && attr.value === 'false');
            if (!safe) el.removeAttribute(attr.name);
        });
    });
    return root.innerHTML;
}
function hasContent(html) { const div = document.createElement('div'); div.innerHTML = clean(html); return !!div.textContent.trim() || !!div.querySelector('img'); }
function markDirty() { dirty = true; }
function settings() { return { classId:$('paperClass').value, subjectId:$('paperSubject').value, date:$('paperDate').value, identifier:$('paperIdentifier').value.trim(), defaultOptionsLayout:$('defaultLayout').value, textSize:Number($('textSize').value), imageSize:Number($('imageSize').value), columns:Number($('paperColumns').value) }; }
function updateName() { $('paperName').value = listName({ className:label($('paperClass').value), subjectName:label($('paperSubject').value), date:$('paperDate').value, identifier:$('paperIdentifier').value }); }
function choices(type, parentId, value = '', optional = true) {
    return `<option value="">${optional ? 'Not set' : 'Choose '+type}</option>` + taxonomy.filter(node => node.type === type && (!parentId || node.parentId === parentId)).map(node => `<option value="${esc(node.id)}" ${node.id === value ? 'selected' : ''}>${esc(node.label)}</option>`).join('');
}
function populateSubjects(value = '') { $('paperSubject').innerHTML = $('paperClass').value ? choices('subject', $('paperClass').value, value, false) : '<option value="">Choose class first</option>'; }
function newQuestion(comprehensionId = '') {
    return { key:uid(), id:null, dirty:true, order:[0,1,2,3], layout:'', data:{ type:'mcq', promptHtml:'', options:LETTERS.map(() => ({html:'',correct:false})), explanation:'', translations:{}, chapterId:'', topicId:'', difficulty:'Medium', status:'draft', multipleCorrectMode:'all', ...(comprehensionId ? {comprehensionId} : {}) } };
}
function editor(html, name, attributes, editable = true) {
    return `<div class="editor" role="textbox" aria-multiline="true" aria-label="${esc(name)}" contenteditable="${editable}" tabindex="0" ${attributes}>${clean(html)}</div>`;
}
function questionMarkup(item, index) {
    const q = item.data, editable = canEditQuestion(item), disabled = editable ? '' : 'disabled';
    const effectiveLayout = item.layout || $('defaultLayout').value;
    const passageOptions = [...passages].map(([id, p]) => `<option value="${esc(id)}" ${q.comprehensionId === id ? 'selected' : ''}>${esc(text(p.passageHtml).slice(0,65) || 'New passage')}</option>`).join('');
    return `<article class="question-card" data-key="${item.key}" aria-label="Question ${index+1}">
        <div class="question-head"><h2>Question ${index+1}</h2>${q.comprehensionId ? '<span class="tag">Comprehension</span>' : ''}${!editable ? '<span class="tag">Author content is read only</span>' : ''}<button type="button" data-action="up" aria-label="Move question ${index+1} up" ${!index || !canEditList() ? 'disabled':''}>↑</button><button type="button" data-action="down" aria-label="Move question ${index+1} down" ${index === items.length-1 || !canEditList() ? 'disabled':''}>↓</button><button type="button" data-action="remove" ${!canEditList() ? 'disabled':''}>Remove</button></div>
        ${editor(q.promptHtml, `Question ${index+1} text`, 'data-field="promptHtml"', editable)}
        <div class="actions"><span class="muted">${item.order.every((original, position) => original === position) ? 'Original question option order' : 'Option order overridden for this list'}</span><button type="button" data-action="resetOptionOrder" ${!canEditList() || item.order.every((original, position) => original === position) ? 'disabled' : ''}>Original option order</button></div>
        <div class="options layout-${effectiveLayout}">${item.order.map((original, position) => {
            const option = q.options[original];
            return `<div class="option" data-option="${original}"><div class="option-top"><label><input type="checkbox" data-correct="${original}" aria-label="Question ${index+1}, option ${LETTERS[position]} is correct" ${option.correct?'checked':''} ${disabled}>${LETTERS[position]} · correct</label><button type="button" data-action="optionUp" ${!position || !canEditList()?'disabled':''} aria-label="Move option ${LETTERS[position]} earlier">←</button><button type="button" data-action="optionDown" ${position===3 || !canEditList()?'disabled':''} aria-label="Move option ${LETTERS[position]} later">→</button></div>${editor(option.html, `Question ${index+1}, option ${LETTERS[position]}`, `data-option-text="${original}"`, editable)}</div>`;
        }).join('')}</div>
        <fieldset data-scoring-rules ${q.options.filter(option => option.correct).length > 1 ? '' : 'hidden'} ${disabled}><legend>For multiple correct options, how should marks be given?</legend><label class="radio-label"><input type="radio" name="scoring-${item.key}" data-field="multipleCorrectMode" value="all" ${q.multipleCorrectMode!=='any'?'checked':''}>Student must select all correct options</label><label class="radio-label"><input type="radio" name="scoring-${item.key}" data-field="multipleCorrectMode" value="any" ${q.multipleCorrectMode==='any'?'checked':''}>Any one correct option is sufficient for full marks</label><p class="muted">A wrong option selected along with a correct option will still be marked wrong.</p></fieldset>
        <details><summary>Optional settings · explanation, translations, taxonomy, layout</summary><div class="extra-grid">
            <label>Chapter <select data-field="chapterId" ${disabled}>${choices('chapter',$('paperSubject').value,q.chapterId)}</select></label>
            <label>Topic <select data-field="topicId" ${disabled}>${q.chapterId ? choices('topic',q.chapterId,q.topicId) : '<option value="">Choose chapter first</option>'}</select></label>
            <label>Difficulty <select data-field="difficulty" ${disabled}>${['Easy','Medium','Hard','Very Hard'].map(d=>`<option ${q.difficulty===d?'selected':''}>${d}</option>`).join('')}</select></label>
            <label class="radio-label"><input type="checkbox" data-field="published" ${q.status==='published'?'checked':''} ${disabled}>Published in question bank</label>
            <label>Options layout <select data-layout ${!canEditList()?'disabled':''}><option value="">Use default</option>${LAYOUTS.map(layout=>`<option value="${layout}" ${item.layout===layout?'selected':''}>${layout.replace('x',' × ')}</option>`).join('')}</select></label>
            <label>Comprehension passage <select data-field="comprehensionId" ${disabled}><option value="">None</option>${passageOptions}</select></label>
            <label class="wide">Explanation ${editor(q.explanationHtml || esc(q.explanation || ''), `Question ${index+1} explanation`, 'data-field="explanationHtml"', editable)}</label>
        </div><div class="translations">${Object.entries(q.translations || {}).map(([lang,tr]) => translationMarkup(item,lang,tr,editable)).join('')}</div><div class="actions"><label>Language code <input data-new-language placeholder="e.g. hi" maxlength="20" ${disabled}></label><button type="button" data-action="addTranslation" ${disabled}>Add translation</button></div></details>
    </article>`;
}
function translationMarkup(item, lang, tr, editable) {
    return `<section class="translation" data-language="${esc(lang)}"><div class="actions"><h3>${esc(lang)}</h3><button type="button" data-action="removeTranslation" ${editable?'':'disabled'}>Remove translation</button></div><label>Question${editor(tr.question || '',`${lang} question`,'data-translation-field="question"',editable)}</label>${LETTERS.map((l,i)=>`<label>Original option ${l}${editor(tr.options?.[i] || '',`${lang} option ${l}`,`data-translation-option="${i}"`,editable)}</label>`).join('')}<label>Explanation${editor(tr.explanation || '',`${lang} explanation`,'data-translation-field="explanation"',editable)}</label></section>`;
}
function render() {
    activeEditor = null; selection = null;
    $('questions').innerHTML = items.map(questionMarkup).join('');
    $('passages').innerHTML = [...passages].map(([id,p],i) => `<article class="passage-card" data-passage="${esc(id)}"><div class="actions"><h2>Comprehension passage ${i+1}</h2><button type="button" data-add-passage-question="${esc(id)}" ${canEditList()?'':'disabled'}>+ Linked question</button></div><p class="muted">Stored once. Editing this passage affects every question that references it.</p>${editor(p.passageHtml,`Comprehension passage ${i+1}`,'data-passage-text',canEditPassage(p))}</article>`).join('');
    $('empty').hidden = !!items.length;
    $('stats').textContent = `${items.length} question${items.length===1?'':'s'} · ${passages.size} passage${passages.size===1?'':'s'}`;
    paperAuthoring.enhance($('questions'));
    paperAuthoring.enhance($('passages'));
    refreshOutputs();
}
function refreshOutputs() {
    $('answerKey').innerHTML = items.map((item,i) => `<tr><td>${i+1}</td><td>${correctLetters(item.data,item.order).join(', ') || 'Not set'}</td><td>${item.data.multipleCorrectMode==='any'?'Any one correct option':'All correct options'}</td></tr>`).join('');
    const seen = new Set();
    $('paperPreview').style.fontSize = `${$('textSize').value}pt`;
    $('paperPreview').innerHTML = items.map((item,i) => {
        const p = item.data.comprehensionId && passages.get(item.data.comprehensionId);
        const passage = p && !seen.has(item.data.comprehensionId) ? `<div class="preview-passage"><strong>Read the passage for questions marked P${[...passages.keys()].indexOf(item.data.comprehensionId)+1}.</strong>${clean(p.passageHtml)}</div>` : '';
        if (p) seen.add(item.data.comprehensionId);
        return `${passage}<div class="preview-question"><strong>${i+1}.${p?` [P${[...passages.keys()].indexOf(item.data.comprehensionId)+1}]`:''}</strong> ${clean(item.data.promptHtml)}<div class="preview-options layout-${item.layout || $('defaultLayout').value}">${item.order.map((original,position)=>`<div>${LETTERS[position]}. ${clean(item.data.options[original].html)}</div>`).join('')}</div></div>`;
    }).join('');
    $('paperPreview').querySelectorAll('img').forEach(image => {
        const resize = () => { image.style.width = `${image.naturalWidth * Number($('imageSize').value) / 100}px`; image.style.maxWidth = '100%'; image.style.height = 'auto'; };
        image.addEventListener('load', resize, { once: true });
        if (image.complete && image.naturalWidth) resize();
    });
    if (window.katex) $('paperPreview').querySelectorAll('[data-latex]').forEach(token => {
        window.katex.render(token.dataset.latex,token,{throwOnError:false});
    });
}
function focusQuestion(key) { document.querySelector(`[data-key="${key}"] [data-field="promptHtml"]`)?.focus(); }
function addQuestions(count, passageId = '') {
    if (!canEditList()) return;
    if (!Number.isInteger(count) || count < 1 || count > 100 || items.length + count > 100) throw new Error('Use 1–100 questions per paper.');
    const added = Array.from({length:count},()=>newQuestion(passageId)); items.push(...added); markDirty(); render(); focusQuestion(added[0].key);
}
function addPassage() {
    if (!canEditList()) return;
    if (items.length > 98) throw new Error('Leave room for two comprehension questions (maximum 100 questions).');
    const id = uid(); passages.set(id,{ passageHtml:'', saved:false, dirty:true });
    addQuestions(2,id);
    document.querySelector(`[data-passage="${id}"] .editor`)?.focus();
}
function itemFor(target) { const card = target.closest('[data-key]'); return items.find(item=>item.key === card?.dataset.key); }
function trackInput(event) {
    const target = event.target, item = itemFor(target);
    if (item) {
        if (target.hasAttribute('data-layout') && canEditList()) { item.layout = target.value; markDirty(); const options = target.closest('.question-card').querySelector('.options'); options.className = `options layout-${item.layout || $('defaultLayout').value}`; refreshOutputs(); return; }
        if (!canEditQuestion(item)) return;
        const translation = target.closest('[data-language]');
        if (translation) {
            const tr = item.data.translations[translation.dataset.language];
            if (target.hasAttribute('data-translation-field')) tr[target.dataset.translationField] = clean(target.innerHTML);
            if (target.hasAttribute('data-translation-option')) tr.options[Number(target.dataset.translationOption)] = clean(target.innerHTML);
        } else if (target.hasAttribute('data-option-text')) item.data.options[Number(target.dataset.optionText)].html = clean(target.innerHTML);
        else if (target.hasAttribute('data-correct')) {
            item.data.options[Number(target.dataset.correct)].correct = target.checked;
            target.closest('.question-card').querySelector('[data-scoring-rules]').hidden = item.data.options.filter(option => option.correct).length <= 1;
        }
        else if (target.dataset.field) {
            const field = target.dataset.field;
            if (field === 'published') item.data.status = target.checked?'published':'draft';
            else item.data[field] = target.isContentEditable ? clean(target.innerHTML) : target.value;
            if (field === 'explanationHtml') item.data.explanation = text(item.data.explanationHtml);
            if (field === 'chapterId') { item.data.topicId = ''; target.closest('details').querySelector('[data-field="topicId"]').innerHTML = target.value ? choices('topic',target.value) : '<option value="">Choose chapter first</option>'; }
        } else return;
        item.dirty = true; markDirty(); refreshOutputs();
    } else if (target.hasAttribute('data-passage-text')) {
        const p = passages.get(target.closest('[data-passage]').dataset.passage);
        if (!canEditPassage(p)) return;
        p.passageHtml = clean(target.innerHTML); p.dirty = true; markDirty(); refreshOutputs();
    }
}
$('questions').addEventListener('input',trackInput); $('questions').addEventListener('change',trackInput); $('passages').addEventListener('input',trackInput);
$('questions').addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const item = itemFor(button); if (!item || !canEditList()) return;
    const index = items.indexOf(item), action = button.dataset.action;
    if (action === 'remove') items.splice(index,1);
    else if (action === 'up' || action === 'down') move(items,index,index+(action==='up'?-1:1));
    else if (action === 'resetOptionOrder') item.order = [0, 1, 2, 3];
    else if (action === 'optionUp' || action === 'optionDown') { const from = item.order.indexOf(Number(button.closest('[data-option]').dataset.option)); move(item.order,from,from+(action==='optionUp'?-1:1)); }
    else if (canEditQuestion(item) && action === 'addTranslation') {
        const language = button.closest('details').querySelector('[data-new-language]').value.trim().toLowerCase();
        if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(language)) return status('Enter a language code such as hi, en, or ta.',true);
        if (Object.hasOwn(item.data.translations,language)) return status('That translation already exists.',true);
        Object.defineProperty(item.data.translations,language,{ value:{question:'',options:['','','',''],explanation:''}, enumerable:true, configurable:true, writable:true }); item.dirty = true;
        button.closest('details').querySelector('.translations').insertAdjacentHTML('beforeend',translationMarkup(item,language,item.data.translations[language],true)); markDirty(); return;
    } else if (canEditQuestion(item) && action === 'removeTranslation') { delete item.data.translations[button.closest('[data-language]').dataset.language]; item.dirty = true; button.closest('[data-language]').remove(); markDirty(); return; }
    else return;
    markDirty(); render(); focusQuestion(item.key);
});
$('passages').addEventListener('click',event=>{ const button = event.target.closest('[data-add-passage-question]'); if (button) attempt(()=>addQuestions(1,button.dataset.addPassageQuestion)); });

async function loadQuestion(id, context = {}) {
    const details = { questionId: id, ...context };
    console.info('[Paper editor] Loading question', details);
    try {
        const snapshot = await getDoc(doc(db, 'qb_questions_v1', id));
        if (!snapshot.exists()) throw new Error(`Question ${id} was not found.`);
        const data = snapshot.data();
        const summary = {
            ...details,
            type: data.type ?? '(missing)',
            optionsIsArray: Array.isArray(data.options),
            optionCount: Array.isArray(data.options) ? data.options.length : null,
            optionFieldType: data.options === null ? 'null' : typeof data.options,
            optionShapes: Array.isArray(data.options) ? data.options.map(option =>
                option && typeof option === 'object' ? Object.keys(option) : typeof option
            ) : [],
            status: data.status ?? '(missing)',
            comprehensionId: data.comprehensionId || null
        };
        console.info('[Paper editor] Question document shape', summary);
        if (data.type !== 'mcq' && context.skipOtherTypes) {
            console.info('[Paper editor] Skipping non-MCQ question', summary);
            return null;
        }
        if (data.type !== 'mcq' || !Array.isArray(data.options) || data.options.length !== 4) {
            throw new Error(`Question ${id}${context.position ? ` (position ${context.position})` : ''}: expected an MCQ with four options; found type "${summary.type}" and ${summary.optionCount ?? 'non-array'} options.`);
        }
        return {key:uid(),id:snapshot.id,data,dirty:false,order:[0,1,2,3],layout:''};
    } catch (error) {
        console.error('[Paper editor] Question load failed', { ...details, code: error.code || null, message: error.message }, error);
        throw error;
    }
}
async function addExisting(item) {
    if (!canEditList()) throw new Error('Only the list author can change this paper.');
    if (items.some(row=>row.id === item.id)) throw new Error('That question is already in the paper.');
    if (items.length >= 100) throw new Error('A paper can contain up to 100 questions.');
    if (item.data.classId !== $('paperClass').value || item.data.subjectId !== $('paperSubject').value) throw new Error('Choose a question with the same class and subject as this paper.');
    const loaded = await loadPassages(db,[item.data]);
    for (const [id,p] of loaded) if (!passages.has(id)) passages.set(id,{...p,saved:true,dirty:false});
    items.push(item); markDirty(); render();
}
function validate() {
    const s = settings();
    if (items.some(item=>item.data.type!=='mcq')) throw new Error('This editor supports MCQ questions only.');
    if (!s.classId || !s.subjectId) throw new Error('Choose the list class and subject.');
    if (!items.length) throw new Error('Add at least one question.');
    if (items.length > 100) throw new Error('A paper can contain up to 100 questions.');
    items.forEach((item,i)=>{
        const q = item.data;
        if (!hasContent(q.promptHtml)) throw new Error(`Question ${i+1}: add question text.`);
        if (!q.options?.every(o=>hasContent(o.html))) throw new Error(`Question ${i+1}: fill in all four options.`);
        if (!q.options.some(o=>o.correct)) throw new Error(`Question ${i+1}: select a correct option.`);
        if (item.id && (q.classId !== s.classId || q.subjectId !== s.subjectId)) throw new Error(`Question ${i+1} belongs to a different class or subject. Remove it or restore the paper taxonomy.`);
        if (q.comprehensionId && referencesPassage(q) && !hasContent(passages.get(q.comprehensionId)?.passageHtml)) throw new Error(`Question ${i+1}: add its shared passage.`);
    });
}
async function savePaper(copy = false) {
    if (!user) throw new Error('Sign in with Google to save your paper.');
    if (!canEditList()) throw new Error('Only the list author can save this list.');
    validate();
    const batch = writeBatch(db), assigned = new Map(), usedPassages = new Set(items.filter(item=>referencesPassage(item.data)).map(item=>item.data.comprehensionId));
    const timestamp = serverTimestamp(), s = settings();
    for (const id of usedPassages) {
        const p = passages.get(id);
        if (!p) throw new Error('Shared passage unavailable. Reload the list.');
        const needsPublication = items.some(item=>item.data.comprehensionId===id && item.data.status==='published') && !p.published;
        if (!p.saved || p.dirty || needsPublication) {
            if (!canEditPassage(p)) throw new Error('Only the passage author can edit or publish this shared passage.');
            batch.set(doc(db,PASSAGES_COLLECTION,id),{ passageHtml:clean(p.passageHtml), authorUid:p.authorUid || user.uid, published:!!p.published || needsPublication, ...(!p.saved?{createdAt:timestamp}:{}), updatedAt:timestamp },{merge:true});
        }
    }
    for (const item of items) {
        if (item.id && (!item.dirty || !canEditQuestion(item))) continue;
        const ref = item.id ? doc(db,'qb_questions_v1',item.id) : doc(collection(db,'qb_questions_v1'));
        const q = item.data;
        const payload = { type:'mcq', classId:s.classId,subjectId:s.subjectId,chapterId:q.chapterId || '',topicId:q.topicId || '',promptHtml:clean(q.promptHtml),options:q.options.map(o=>({html:clean(o.html),correct:!!o.correct})),explanation:q.explanation || '',explanationHtml:clean(q.explanationHtml || ''),translations:q.translations || {},difficulty:q.difficulty || 'Medium',status:q.status || 'draft',multipleCorrectMode:q.multipleCorrectMode==='any'?'any':'all',updatedAt:timestamp };
        if (q.comprehensionId) payload.comprehensionId = q.comprehensionId;
        else payload.comprehensionId = '';
        if (!item.id) Object.assign(payload,{authorUid:user.uid,authorName:user.displayName || user.email || 'Teacher',createdAt:timestamp,verified:false});
        batch.set(ref,payload,{merge:true}); assigned.set(item.key,ref.id);
    }
    const ref = !copy && listId ? doc(db,'qb_lists_v1',listId) : doc(collection(db,'qb_lists_v1'));
    const editedQuestionIds = items.map(item=>assigned.get(item.key) || item.id);
    const questionIds = copy ? editedQuestionIds : preserveSkippedQuestions(editedQuestionIds, sourceQuestionIds, skippedQuestionIds);
    const questionSettings = Object.fromEntries(items.map((item,i)=>[editedQuestionIds[i],{optionOrder:item.order,optionsLayout:item.layout || ''}]));
    const payload = { ...s,name:$('paperName').value,ownerUid:user.uid,status:'active',questionIds,questionSettings,updatedAt:timestamp,...(!listId || copy?{createdAt:timestamp}:{}) };
    if (copy && listId) payload.sourceListId = listId;
    batch.set(ref,payload,{merge:true});
    await batch.commit();
    items.forEach(item=>{ item.id = assigned.get(item.key) || item.id; if (!item.data.authorUid) item.data.authorUid = user.uid; item.data.classId = s.classId; item.data.subjectId = s.subjectId; item.dirty = false; });
    for (const id of usedPassages) { const p=passages.get(id); p.saved=true;p.dirty=false;p.authorUid ||= user.uid;p.published ||= items.some(item=>item.data.comprehensionId===id && item.data.status==='published'); }
    sourceQuestionIds=[...questionIds];if(copy)skippedQuestionIds=[];
    listId=ref.id;listOwner=user.uid;dirty=false;
    history.replaceState(null,'',`${location.pathname}?id=${encodeURIComponent(listId)}`);
    await loadLists(); render(); status(copy?'Saved as another list. Change the custom identifier to name the next paper set.':'List and authored questions saved.');
}
async function loadLists() {
    if (!user) { lists=[]; } else { const snapshot=await getDocs(query(collection(db,'qb_lists_v1'),where('ownerUid','==',user.uid))); lists=snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(l=>l.status!=='archived').sort((a,b)=>a.name.localeCompare(b.name)); }
    $('savedLists').innerHTML='<option value="">Choose a saved list</option>'+lists.map(l=>`<option value="${esc(l.id)}" ${l.id===listId?'selected':''}>${esc(l.name)}</option>`).join('');
}
async function openPaper(id) {
    if (!id) throw new Error('Choose a list to open.');
    if (dirty && !confirm('Discard unsaved changes and open this list?')) return;
    console.info('[Paper editor] Opening list', { listId: id });
    const snapshot=await getDoc(doc(db,'qb_lists_v1',id));
    if (!snapshot.exists()) throw new Error('List not found.');
    const list=snapshot.data();
    if (list.ownerUid!==user?.uid) throw new Error('Only the list author can open this private editor.');
    console.info('[Paper editor] List loaded', { listId: id, name: list.name, questionCount: list.questionIds?.length || 0 });
    console.table((list.questionIds || []).map((questionId, index) => ({ listId: id, position: index + 1, questionId })));
    const results = await Promise.allSettled((list.questionIds || []).map((questionId, index) =>
        loadQuestion(questionId, { listId: id, position: index + 1, skipOtherTypes: true })
    ));
    const failures = results.flatMap((result, index) => result.status === 'rejected'
        ? [{ listId: id, position: index + 1, questionId: list.questionIds[index], error: result.reason?.message || String(result.reason) }]
        : []);
    if (failures.length) {
        console.error('[Paper editor] List cannot open: question loading failed', { listId: id, failed: failures.length, total: results.length });
        console.table(failures);
        throw new Error(`List ${id}: ${failures.length} question(s) could not be loaded. ${failures[0].error} See the console table for all failed question IDs.`);
    }
    const loaded = results.map(result => result.value).filter(Boolean);
    const skipped = results.flatMap((result,index) => result.value === null ? [list.questionIds[index]] : []);
    const loadedPassages=await loadPassages(db,loaded.map(item=>item.data));
    console.info('[Paper editor] List questions and passages ready', { listId: id, questionCount: loaded.length, passageCount: loadedPassages.size });
    const classId=list.classId || loaded[0]?.data.classId || '', subjectId=list.subjectId || loaded[0]?.data.subjectId || '';
    $('paperClass').value=classId;populateSubjects(subjectId);$('paperDate').value=list.date || '';$('paperIdentifier').value=list.identifier || '';
    $('defaultLayout').value=LAYOUTS.includes(list.defaultOptionsLayout)?list.defaultOptionsLayout:'2x2';
    $('imageSize').value=Math.max(25,Math.min(200,Number(list.imageSize) || 100));$('imageSizeValue').value=`${$('imageSize').value}%`;
    $('textSize').value=Math.max(8,Math.min(20,list.textSize || 11));$('textSizeValue').value=`${$('textSize').value} pt`;$('paperColumns').value=Math.max(1,Math.min(4,list.columns || 1));
    items=loaded.map(item=>({...item,order:listOptionOrder(list, item.id),layout:LAYOUTS.includes(list.questionSettings?.[item.id]?.optionsLayout)?list.questionSettings[item.id].optionsLayout:''}));
    console.table(items.map(item => ({ questionId: item.id, savedOptionOrder: JSON.stringify(list.questionSettings?.[item.id]?.optionOrder ?? null), displayedOptionOrder: item.order.join(', '), orderSource: item.order.every((original, position) => original === position) ? 'original question' : 'list override' })));
    passages=new Map([...loadedPassages].map(([id,p])=>[id,{...p,saved:true,dirty:false}]));
    skippedQuestionIds=skipped;sourceQuestionIds=[...(list.questionIds || [])];
    listId=id;listOwner=list.ownerUid;dirty=false;updateName();render();history.replaceState(null,'',`${location.pathname}?id=${encodeURIComponent(id)}`);status(skipped.length ? `Loaded ${loaded.length} MCQs; skipped ${skipped.length} non-MCQ questions. Skipped questions stay in the original list when saved; paper copies and downloads contain only MCQs.` : 'List loaded.');
}
async function browse(reset = false) {
    if (!user) throw new Error('Sign in to browse questions.');
    if (!$('paperClass').value || !$('paperSubject').value) throw new Error('Choose class and subject first.');
    if (reset) { bankRows=[];bankCursor=null; $('bankSearch').value=''; }
    if (!$('bankDialog').open) $('bankDialog').showModal();
    $('bankStatus').textContent='Loading questions…';
    try {
        const constraints = [
            and(
                where('classId', '==', $('paperClass').value),
                where('subjectId', '==', $('paperSubject').value),
                where('type', '==', 'mcq'),
                or(where('status', '==', 'published'), where('authorUid', '==', user.uid))
            ),
            orderBy(documentId()),
            limit(30)
        ];
        if (bankCursor) constraints.push(startAfter(bankCursor));
        const snapshot=await getDocs(query(collection(db,'qb_questions_v1'),...constraints));
        bankCursor=snapshot.docs.at(-1) || bankCursor;bankRows.push(...snapshot.docs.map(d=>({id:d.id,...d.data()})));
        $('moreBank').disabled=snapshot.docs.length<30;$('bankStatus').textContent=`${bankRows.length} questions loaded`;renderBank();
    } catch(error) { $('bankStatus').textContent=`Could not browse: ${error.message}. You can also add a question by its ID.`; }
}
function renderBank() {
    const search=$('bankSearch').value.toLowerCase();
    $('bankResults').innerHTML=bankRows.filter(q=>`${text(q.promptHtml)} ${q.authorName || ''}`.toLowerCase().includes(search)).map(q=>`<article class="bank-result">${clean(q.promptHtml)}<p class="muted">${esc(q.authorName || 'Teacher')} · ${esc(q.status)}</p><button type="button" data-bank-id="${esc(q.id)}" ${items.some(item=>item.id===q.id)?'disabled':''}>Add to paper</button></article>`).join('');
}

// A single toolbar keeps a saved range while keyboard focus moves to its buttons.
document.addEventListener('focusin',event=>{ if(event.target.matches('.editor[contenteditable="true"]')) {activeEditor=event.target;$('editorTarget').textContent=activeEditor.getAttribute('aria-label');} });
document.addEventListener('selectionchange',()=>{ const range=window.getSelection(); if(activeEditor && range.rangeCount && activeEditor.contains(range.anchorNode) && activeEditor.contains(range.focusNode)) selection=range.getRangeAt(0).cloneRange(); });
function restoreSelection() { if(!activeEditor?.isConnected || activeEditor.contentEditable!=='true') throw new Error('Focus an editable text area first.');activeEditor.focus();if(selection && activeEditor.contains(selection.commonAncestorContainer)) {const s=window.getSelection();s.removeAllRanges();s.addRange(selection);} }
function insertHtml(html) {restoreSelection();document.execCommand('insertHTML',false,html);activeEditor.dispatchEvent(new Event('input',{bubbles:true}));}
$('formatToolbar').addEventListener('mousedown',event=>{if(event.target.closest('button'))event.preventDefault();});
$('formatToolbar').addEventListener('click', event => {
    const command = event.target.closest('[data-format]')?.dataset.format;
    if (!command) return;
    if (['bold', 'italic', 'code'].includes(command)) paperAuthoring.command(command);
    else paperAuthoring.open(command);
});
document.addEventListener('paste', event => {
    const editor = event.target.closest?.('.editor[contenteditable="true"]');
    if (!editor || event.defaultPrevented || !event.clipboardData) return;
    event.preventDefault();
    insertHtml(clean(event.clipboardData.getData('text/html') || esc(event.clipboardData.getData('text/plain')).replaceAll('\n','<br>')));
});
async function attempt(action) {try {await action();}catch(error){console.error(error);status(error.message || 'Unable to complete the action.',true);}}
async function exclusive(action) {if(busy)return;busy=true;const controls=[...document.querySelectorAll('button,input,select,textarea,[contenteditable="true"]')];const previous=controls.map(el=>({el,disabled:el.disabled,editable:el.getAttribute('contenteditable')}));controls.forEach(el=>{if(el.hasAttribute('contenteditable'))el.contentEditable='false';else el.disabled=true;});try{await action();}catch(error){console.error(error);status(error.message || 'Unable to complete the action.',true);}finally{previous.forEach(({el,disabled,editable})=>{if(!el.isConnected)return;if(editable!==null)el.setAttribute('contenteditable',editable);else el.disabled=disabled;});busy=false;}}
function download(blob,filename) {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function fileName(suffix) {return ($('paperName').value || 'Question paper').replace(/[^\p{L}\p{N} ._-]/gu,'-')+suffix;}
function exportCsv(keyOnly = false) {
    validate();
    const rows=keyOnly ? [['question','correct_options','multiple_correct_mode']] : [['type','class','subject','chapter','topic','difficulty','question','option_a','option_b','option_c','option_d','correct_options','multiple_correct_mode','comprehension_id','passage','options_layout','explanation','translations']];
    items.forEach((item,i)=>{const q=item.data,answers=correctLetters(q,item.order).join('|');rows.push(keyOnly ? [i+1,answers,q.multipleCorrectMode || 'all'] : ['mcq',label($('paperClass').value),label($('paperSubject').value),label(q.chapterId),label(q.topicId),q.difficulty,text(q.promptHtml),...item.order.map(o=>text(q.options[o].html)),answers,q.multipleCorrectMode || 'all',q.comprehensionId || '',text(passages.get(q.comprehensionId)?.passageHtml || q.comprehensionPassageHtml || ''),item.layout || $('defaultLayout').value,q.explanation || '',JSON.stringify(q.translations || {})]);});
    download(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}),fileName(keyOnly?' - answer key.csv':'.csv'));
}
$('bulkAdd').addEventListener('click',()=>attempt(()=>addQuestions(Number($('bulkCount').value))));
$('addPassage').addEventListener('click',()=>attempt(addPassage));
$('save').addEventListener('click',()=>exclusive(()=>savePaper(false)));$('saveCopy').addEventListener('click',()=>exclusive(()=>savePaper(true)));
$('login').addEventListener('click',()=>attempt(()=>signInWithPopup(auth,new GoogleAuthProvider())));$('logout').addEventListener('click',()=>attempt(async()=>{if(dirty&&!confirm('Sign out with unsaved changes?'))return;await signOut(auth);}));
$('paperClass').addEventListener('change',()=>{populateSubjects();updateName();markDirty();render();});$('paperSubject').addEventListener('change',()=>{updateName();markDirty();render();});
for(const id of ['paperDate','paperIdentifier'])$(id).addEventListener('input',()=>{updateName();markDirty();});
$('defaultLayout').addEventListener('change',()=>{markDirty();render();});$('textSize').addEventListener('input',()=>{$('textSizeValue').value=`${$('textSize').value} pt`;markDirty();refreshOutputs();});$('paperColumns').addEventListener('change',markDirty);
$('imageSize').addEventListener('input',()=>{$('imageSizeValue').value=`${$('imageSize').value}%`;markDirty();refreshOutputs();});
$('randomize').addEventListener('click',()=>{if(!canEditList())return;shuffle(items);markDirty();render();});
$('openList').addEventListener('click',()=>exclusive(()=>openPaper($('savedLists').value)));
$('newPaper').addEventListener('click',()=>{if(dirty&&!confirm('Discard unsaved changes and start a new paper?'))return;items=[];passages=new Map();skippedQuestionIds=[];sourceQuestionIds=[];listId=null;listOwner=null;dirty=false;$('paperIdentifier').value='';$('paperDate').value='';updateName();render();history.replaceState(null,'',location.pathname);status('New paper.');});
$('browseBank').addEventListener('click',()=>attempt(()=>browse(true)));$('moreBank').addEventListener('click',()=>attempt(()=>browse()));$('closeBank').addEventListener('click',()=>$('bankDialog').close());$('bankSearch').addEventListener('input',renderBank);
$('bankResults').addEventListener('click',event=>{const button=event.target.closest('[data-bank-id]');if(button)exclusive(async()=>{await addExisting(await loadQuestion(button.dataset.bankId));renderBank();$('bankStatus').textContent='Question added.';});});
$('reuseQuestion').addEventListener('click',()=>exclusive(async()=>{const id=$('reuseId').value.trim();if(!id || id.includes('/'))throw new Error('Enter a valid question document ID.');await addExisting(await loadQuestion(id));$('reuseId').value='';status('Question added by reference.');}));
$('downloadCsv').addEventListener('click',()=>attempt(()=>exportCsv()));$('downloadKey').addEventListener('click',()=>attempt(()=>exportCsv(true)));
$('downloadDocx').addEventListener('click',()=>exclusive(async()=>{validate();status('Building DOCX…');await downloadPaperDocx({title:$('paperName').value,items,passages,settings:settings(),clean,download,filename:fileName('.docx')});status('Question paper downloaded.');}));
document.addEventListener('keydown',event=>{
    if(busy || document.querySelector('#richAuthoringDialog[open]'))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();exclusive(()=>savePaper(false));return;}
    if(event.altKey && !event.ctrlKey && !event.metaKey && !document.querySelector('dialog[open]')){
        if(event.key.toLowerCase()==='n'){event.preventDefault();attempt(()=>addQuestions(Number($('bulkCount').value)));}
        if(event.key.toLowerCase()==='p'){event.preventDefault();attempt(addPassage);}
        const item=itemFor(event.target);if(item && canEditList() && ['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const direction=event.key==='ArrowUp'?-1:1;if(event.shiftKey){const option=event.target.closest('[data-option]');if(!option)return;const from=item.order.indexOf(Number(option.dataset.option));move(item.order,from,from+direction);markDirty();render();document.querySelector(`[data-key="${item.key}"] [data-option="${option.dataset.option}"] .editor`)?.focus();}else{move(items,items.indexOf(item),items.indexOf(item)+direction);markDirty();render();focusQuestion(item.key);}}
    }
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
const resize=new ResizeObserver(()=>document.documentElement.style.setProperty('--top-bar-height',`${document.querySelector('.floating-bar').getBoundingClientRect().height+6}px`));resize.observe(document.querySelector('.floating-bar'));
const taxonomyReady=getDocs(collection(db,'qb_taxonomy_v1')).then(snapshot=>{taxonomy=snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));$('paperClass').innerHTML=choices('class','', '',false);status('Ready. Choose a class and subject to start.');}).catch(error=>{status(`Could not load taxonomy: ${error.message}`,true);throw error;});
onAuthStateChanged(auth,async next=>{const changed=user && user.uid!==next?.uid;user=next;$('login').hidden=!!user;$('logout').hidden=!user;if(changed){items=[];passages=new Map();skippedQuestionIds=[];sourceQuestionIds=[];listId=null;listOwner=null;dirty=false;}await attempt(async()=>{await taxonomyReady;await loadLists();const requested=new URLSearchParams(location.search).get('id');if(user&&requested&&!listId)await openPaper(requested);else render();});});
render();
