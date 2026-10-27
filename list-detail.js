import { listOptionOrder } from './paper-core.js';
import { PASSAGES_COLLECTION, referencesPassage, loadPassages, questionPromptHtml } from './comprehension.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    collection,
    doc,
    documentId,
    getDoc,
    getDocs,
    getFirestore,
    query,
    serverTimestamp,
    writeBatch,
    where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
    apiKey: 'AIzaSyAYlezFn0tSSQHA-vRnJeBfJ-Om1YlDghk',
    authDomain: 'eschool-dev-4c6b4.firebaseapp.com',
    projectId: 'eschool-dev-4c6b4',
    storageBucket: 'eschool-dev-4c6b4.firebasestorage.app',
    messagingSenderId: '875648503944',
    appId: '1:875648503944:web:ea0d256e7aa977496f0f3d',
    measurementId: 'G-CF82P2M36M'
};

let comprehensionPassages = new Map();
const displayPrompt = question => questionPromptHtml(question, comprehensionPassages);

const COLLECTIONS = {
    questions: 'qb_questions_v1',
    lists: 'qb_lists_v1',
    taxonomy: 'qb_taxonomy_v1'
};

const TYPE_LABELS = {
    mcq: 'MCQ',
    true_false: 'True/False',
    fib: 'Fill in the Blank',
    short_answer: 'Short Answer'
};

const LABELS = ['A', 'B', 'C', 'D'];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
const listId = new URLSearchParams(window.location.search).get('id');
let taxonomyById = new Map();
let currentUser = null;
let currentList = null;
let loadedQuestions = [];
let selectedQuestionIds = new Set();
let archiveSaving = false;
let loadVersion = 0;

function archiveCandidates() {
    return currentUser ? loadedQuestions.filter(q => q.authorUid === currentUser.uid && q.status !== 'archived') : [];
}
function updateArchiveControls() {
    const candidates = archiveCandidates();
    const eligible = new Set(candidates.map(q => q.id));
    selectedQuestionIds = new Set([...selectedQuestionIds].filter(id => eligible.has(id)));
    $('detailArchiveToolbar').hidden = !currentUser || (!candidates.length && !$('detailArchiveStatus').textContent);
    $('detailSelectAll').checked = candidates.length > 0 && selectedQuestionIds.size === candidates.length;
    $('detailSelectAll').indeterminate = selectedQuestionIds.size > 0 && selectedQuestionIds.size < candidates.length;
    $('detailSelectAll').disabled = archiveSaving || !candidates.length;
    $('detailSelectedCount').textContent = `${selectedQuestionIds.size} selected`;
    $('detailArchiveSelected').disabled = archiveSaving || !selectedQuestionIds.size;
    document.querySelectorAll('[data-detail-archive-select]').forEach(input => {
        input.checked = selectedQuestionIds.has(input.dataset.detailArchiveSelect);
        input.disabled = archiveSaving;
    });
}
$('detailSelectAll').addEventListener('change', event => {
    selectedQuestionIds = new Set(event.target.checked ? archiveCandidates().map(q => q.id) : []);
    updateArchiveControls();
});
$('listItems').addEventListener('change', event => {
    const id = event.target.dataset.detailArchiveSelect;
    if (!id || archiveSaving) return;
    if (event.target.checked) selectedQuestionIds.add(id);
    else selectedQuestionIds.delete(id);
    updateArchiveControls();
});
$('detailArchiveSelected').addEventListener('click', archiveSelectedQuestions);

async function archiveSelectedQuestions() {
    if (archiveSaving || !currentUser) return;
    const ownerUid = currentUser.uid;
    const rows = archiveCandidates().filter(q => selectedQuestionIds.has(q.id));
    if (!rows.length) return;
    if (!window.confirm(`Archive ${rows.length} of your authored questions? This archives them in the question bank and every list using them. They remain referenced in this list.`)) return;
    archiveSaving = true;
    updateArchiveControls();
    let archived = 0;
    try {
        for (const group of chunk(rows, 400)) {
            if (currentUser?.uid !== ownerUid) throw new Error('The signed-in account changed.');
            const batch = writeBatch(db);
            group.forEach(q => batch.update(doc(db, COLLECTIONS.questions, q.id), {
                status: 'archived', previousStatus: q.status || 'published',
                updatedAt: serverTimestamp(), archivedAt: serverTimestamp()
            }));
            await batch.commit();
            archived += group.length;
            group.forEach(q => { q.previousStatus = q.status || 'published'; q.status = 'archived'; selectedQuestionIds.delete(q.id); });
        }
        $('detailArchiveStatus').textContent = `${archived} question${archived === 1 ? '' : 's'} archived.`;
    } catch (error) {
        console.error('List bulk archive failed', error);
        $('detailArchiveStatus').textContent = `${archived} archived. Remaining questions were not archived: ${error.message}`;
    } finally {
        archiveSaving = false;
        if (currentUser?.uid === ownerUid && currentList) renderList(currentList, loadedQuestions);
        else updateArchiveControls();
    }
}

if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
}

$('detailLoginBtn').addEventListener('click', async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
});
$('detailLogoutBtn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    loadVersion++;
    currentList = null;
    loadedQuestions = [];
    selectedQuestionIds.clear();
    $('detailArchiveStatus').textContent = '';
    updateArchiveControls();
    $('detailLoginBtn').hidden = !!user;
    $('detailLogoutBtn').hidden = !user;
    $('detailUserLabel').textContent = user ? user.displayName || user.email || 'Signed in' : '';
    if (!user) {
        $('listStatus').textContent = 'Sign in with Google to view this private list.';
        $('listItems').innerHTML = '<div class="empty-card">Sign in to view list questions.</div>';
        return;
    }
    loadListDetail();
});

async function loadListDetail() {
    const version = ++loadVersion;
    if (!listId) {
        renderError('No list id was provided in the URL.');
        return;
    }

    try {
        const listSnap = await withTimeout(getDoc(doc(db, COLLECTIONS.lists, listId)), 12000);
        if (version !== loadVersion) return;
        if (!listSnap.exists()) {
            renderError('List not found.');
            return;
        }

        const list = { id: listSnap.id, ...listSnap.data() };
        await loadTaxonomy();
        const questions = await loadQuestions(list.questionIds || []);
        if (version !== loadVersion) return;
        renderList(list, questions);
    } catch (error) {
        if (version !== loadVersion) return;
        renderError(`Could not load list: ${error.message}`);
    }
}

async function loadQuestions(questionIds) {
    if (!questionIds.length) return [];
    const byId = new Map();
    for (const ids of chunk(questionIds, 10)) {
        const snap = await withTimeout(getDocs(query(collection(db, COLLECTIONS.questions), where(documentId(), 'in', ids))), 12000);
        snap.forEach(docSnap => byId.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
    }
    const questions = questionIds.map(id => byId.get(id)).filter(Boolean);
    comprehensionPassages = await loadPassages(db, questions);
    return questions;
}

async function loadTaxonomy() {
    const snap = await withTimeout(getDocs(collection(db, COLLECTIONS.taxonomy)), 12000);
    taxonomyById = new Map(snap.docs.map(docSnap => [docSnap.id, { id: docSnap.id, ...docSnap.data() }]));
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('Firestore request timed out. Check your connection and permissions.')), ms);
        })
    ]);
}

function renderList(list, questions) {
    currentList = list;
    loadedQuestions = questions;
    $('listTitle').textContent = list.name || 'Question List';
    $('listStatus').textContent = `List ID: ${list.id}`;
    $('listOwnerLabel').textContent = list.ownerUid ? `Owner: ${list.ownerUid}` : '';
    $('listQuestionCount').textContent = `${questions.length} question${questions.length === 1 ? '' : 's'}`;
    $('listItems').innerHTML = questions.length
        ? questions.map(q => questionCard(q.type === 'mcq' ? { ...q, options: listOptionOrder(list, q.id).map(index => q.options?.[index]).filter(Boolean) } : q)).join('')
        : '<div class="empty-card">No questions in this list.</div>';
    updateArchiveControls();
    renderMathAndDiagrams($('listItems'));
}

function renderError(message) {
    currentList = null;
    loadedQuestions = [];
    selectedQuestionIds.clear();
    updateArchiveControls();
    $('listStatus').textContent = message;
    $('listItems').innerHTML = `<div class="empty-card">${esc(message)}</div>`;
}

function questionCard(q) {
    return `
        <article class="question-card">
            <div class="question-card-head">
                ${currentUser && q.authorUid === currentUser.uid && q.status !== 'archived' ? `<label><input type="checkbox" data-detail-archive-select="${esc(q.id)}" aria-label="Select authored question for archiving" ${selectedQuestionIds.has(q.id) ? 'checked' : ''} ${archiveSaving ? 'disabled' : ''}> Select</label>` : ''}
                <span class="type-chip">${TYPE_LABELS[q.type] || esc(q.type || 'Question')}</span>
                <span class="status-chip ${esc(q.status || 'published')}">${esc(q.status || 'published')}</span>
            </div>
            <div class="rich-content">${sanitizeRich(displayPrompt(q))}</div>
            <div class="question-meta">
                <span>${esc(taxonomyLabel(q, 'class') || 'Class')}</span>
                <span>${esc(taxonomyLabel(q, 'subject') || 'Subject')}</span>
                <span>${esc(taxonomyLabel(q, 'chapter') || 'Chapter')}</span>
                <span>${esc(taxonomyLabel(q, 'topic') || 'Topic')}</span>
                <span>${esc(q.difficulty || 'Medium')}</span>
            </div>
            <div class="card-answer"><strong>Answer:</strong> ${answerHtml(q)}</div>
            ${translationSummary(q)}
        </article>
    `;
}

function taxonomyLabel(q, type) {
    if (type === 'class') return taxonomyById.get(q.classId)?.label || q.className || '';
    if (type === 'subject') return taxonomyById.get(q.subjectId)?.label || q.subject || '';
    if (type === 'chapter') return taxonomyById.get(q.chapterId)?.label || q.chapter || '';
    return taxonomyById.get(q.topicId)?.label || q.topic || '';
}

function answerHtml(q) {
    if (q.type === 'mcq') {
        return (q.options || []).map((opt, i) => `${LABELS[i]}. ${sanitizeRich(opt.html || '')}${opt.correct ? ' (correct)' : ''}`).join('<br>');
    }
    if (q.type === 'true_false') return q.trueAnswer ? 'True' : 'False';
    if (q.type === 'fib') {
        return (q.fibBanks || []).map(bank => `${esc(bank.label || 'Blank')}: ${esc((bank.answers || []).join(' / '))}`).join('<br>');
    }
    return sanitizeRich(q.shortAnswerHtml || '');
}

function translationSummary(q) {
    const langs = Object.keys(q.translations || {});
    if (!langs.length) return '';
    return `<div class="question-meta">${langs.map(lang => `<span>${esc(lang)}</span>`).join('')}</div>`;
}

async function renderMathAndDiagrams(root) {
    root.querySelectorAll('.math-token').forEach(token => {
        const latex = token.dataset.latex;
        if (latex && window.katex) token.innerHTML = window.katex.renderToString(latex, { throwOnError: false });
    });
    if (!window.mermaid) return;
    for (const token of root.querySelectorAll('.mermaid-token')) {
        const code = token.dataset.code || token.textContent;
        try {
            const { svg } = await window.mermaid.render(`qb_detail_${Date.now()}_${Math.random().toString(16).slice(2)}`, code);
            token.innerHTML = svg;
        } catch {
            token.innerHTML = '<code>Diagram error</code>';
        }
    }
}

function sanitizeRich(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    template.content.querySelectorAll('script, iframe, object, embed').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
        [...node.attributes].forEach(attr => {
            if (/^on/i.test(attr.name) || attr.name === 'style') node.removeAttribute(attr.name);
        });
    });
    return template.innerHTML;
}

function esc(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function chunk(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
}
