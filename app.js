import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    addDoc,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDocs,
    getFirestore,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
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

const COLLECTIONS = {
    questions: 'qb_questions_v1',
    reactions: 'qb_reactions_v1',
    lists: 'qb_lists_v1'
};

const TYPE_LABELS = {
    mcq: 'MCQ',
    true_false: 'True/False',
    fib: 'Fill in the Blank',
    short_answer: 'Short Answer'
};

const LABELS = ['A', 'B', 'C', 'D'];
const ONBOARDING_PROMPT_STORAGE_KEY = 'qb_hide_onboarding_prompt_v1';
const TEMPLATE_HEADERS = [
    'type',
    'class',
    'subject',
    'chapter',
    'topic',
    'difficulty',
    'question',
    'option_a',
    'option_b',
    'option_c',
    'option_d',
    'correct_options',
    'true_false_answer',
    'fib_banks',
    'short_answer',
    'language',
    'translated_question',
    'translated_answer',
    'translated_option_a',
    'translated_option_b',
    'translated_option_c',
    'translated_option_d'
];

const FORMULA_LIBRARY = [
    { id: 'math_frac', category: 'Mathematics', name: 'Fraction', latex: '\\frac{a}{b}' },
    { id: 'math_sqrt', category: 'Mathematics', name: 'Square Root', latex: '\\sqrt{x}' },
    { id: 'math_quadratic', category: 'Mathematics', name: 'Quadratic Formula', latex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}' },
    { id: 'math_mean', category: 'Mathematics', name: 'Mean', latex: '\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i' },
    { id: 'math_matrix', category: 'Mathematics', name: '2x2 Matrix', latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
    { id: 'phys_newton2', category: 'Physics', name: "Newton's Second Law", latex: 'F = ma' },
    { id: 'phys_ke', category: 'Physics', name: 'Kinetic Energy', latex: 'KE = \\frac{1}{2}mv^2' },
    { id: 'phys_ohms', category: 'Physics', name: "Ohm's Law", latex: 'V = IR' },
    { id: 'phys_wave', category: 'Physics', name: 'Wave Equation', latex: 'v = f\\lambda' },
    { id: 'chem_gas_law', category: 'Chemistry', name: 'Ideal Gas Law', latex: 'PV = nRT' },
    { id: 'chem_ph', category: 'Chemistry', name: 'pH Definition', latex: '\\text{pH} = -\\log_{10}[\\text{H}^+]' },
    { id: 'chem_reaction', category: 'Chemistry', name: 'Reaction Arrow', latex: '\\rightarrow' }
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let questions = [];
let reactions = new Map();
let lists = [];
let activeQuestionId = null;
let activeEditor = null;
let savedSelectionRange = null;
let activeTarget = null;
let selectedTableCell = null;
let importRows = [];
let unsubscribeQuestions = [];
let unsubscribeLists = null;
let toastTimer = null;

function isEligibleInputField(el) {
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return false;
    if (el.closest('#toolDialog') || el.closest('#onboardingPromptDialog') || el.closest('#importDialog')) return false;
    if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'submit' || el.type === 'button') return false;
    if (el.id === 'translationLang' || el.id === 'newListName') return false;
    if (el.classList.contains('fib-answers') || el.classList.contains('fib-label')) return true;
    if (el.classList.contains('translation-question') || el.classList.contains('translation-answer') || el.classList.contains('translation-option')) return true;
    if (el.closest('#answerEditor') || el.closest('.translation-card')) return true;
    return false;
}

function getEditorForRange(range) {
    if (!range) return null;
    try {
        const container = range.commonAncestorContainer;
        if (!container) return null;
        const el = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
        const editor = el?.closest('.rich-editor');
        if (editor && editor.isConnected) {
            return editor;
        }
    } catch {
        return null;
    }
    return null;
}

function saveCurrentTarget(targetEl = null) {
    const activeEl = targetEl || document.activeElement;
    if (isEligibleInputField(activeEl)) {
        activeTarget = {
            type: 'input',
            element: activeEl,
            start: activeEl.selectionStart ?? activeEl.value.length,
            end: activeEl.selectionEnd ?? activeEl.value.length
        };
        activeEditor = activeEl;
        savedSelectionRange = null;
        return;
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const editor = getEditorForRange(range);
        if (editor) {
            activeTarget = {
                type: 'rich',
                element: editor,
                range: range.cloneRange()
            };
            activeEditor = editor;
            savedSelectionRange = range.cloneRange();
            return;
        }
    }

    if (activeEl && activeEl.classList?.contains('rich-editor')) {
        activeEditor = activeEl;
        const range = document.createRange();
        range.selectNodeContents(activeEl);
        range.collapse(false);
        savedSelectionRange = range;
        activeTarget = { type: 'rich', element: activeEl, range };
    }
}

function saveCurrentSelection() {
    saveCurrentTarget();
}

function ensureSavedSelection() {
    if (activeTarget && activeTarget.type === 'input' && activeTarget.element?.isConnected) {
        activeEditor = activeTarget.element;
        return;
    }

    const existingEditor = (activeTarget && activeTarget.type === 'rich' && activeTarget.element?.isConnected)
        ? activeTarget.element
        : getEditorForRange(savedSelectionRange);

    if (existingEditor && existingEditor.isConnected) {
        activeEditor = existingEditor;
        if (!activeTarget || activeTarget.type !== 'rich' || activeTarget.element !== existingEditor) {
            const range = savedSelectionRange || document.createRange();
            if (!savedSelectionRange) {
                range.selectNodeContents(existingEditor);
                range.collapse(false);
                savedSelectionRange = range;
            }
            activeTarget = { type: 'rich', element: existingEditor, range };
        }
        return;
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const selEditor = getEditorForRange(range);
        if (selEditor) {
            activeEditor = selEditor;
            savedSelectionRange = range.cloneRange();
            activeTarget = { type: 'rich', element: selEditor, range: savedSelectionRange };
            return;
        }
    }

    if (!activeEditor || !activeEditor.isConnected) {
        activeEditor = $('qPrompt');
    }
    if (activeEditor) {
        if (isEligibleInputField(activeEditor)) {
            activeTarget = {
                type: 'input',
                element: activeEditor,
                start: activeEditor.selectionStart ?? activeEditor.value.length,
                end: activeEditor.selectionEnd ?? activeEditor.value.length
            };
            savedSelectionRange = null;
        } else {
            const range = document.createRange();
            range.selectNodeContents(activeEditor);
            range.collapse(false);
            savedSelectionRange = range;
            activeTarget = { type: 'rich', element: activeEditor, range };
        }
    }
}

function restoreTargetFocus() {
    if (activeTarget && activeTarget.type === 'input' && activeTarget.element?.isConnected) {
        const input = activeTarget.element;
        input.focus();
        try {
            const pos = activeTarget.start ?? input.value.length;
            input.setSelectionRange(pos, pos);
        } catch {}
        return;
    }
    const editor = (activeTarget && activeTarget.type === 'rich' && activeTarget.element?.isConnected)
        ? activeTarget.element
        : (getEditorForRange(savedSelectionRange) || activeEditor);
    if (editor && editor.isConnected) {
        editor.focus();
        const range = activeTarget?.range || savedSelectionRange;
        if (range) {
            try {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            } catch {}
        }
    }
}

const $ = (id) => document.getElementById(id);
const els = {
    syncStatus: $('syncStatus'),
    loginBtn: $('loginBtn'),
    logoutBtn: $('logoutBtn'),
    onboardingBtn: $('onboardingBtn'),
    newQuestionBtn: $('newQuestionBtn'),
    exportBtn: $('exportBtn'),
    importBtn: $('importBtn'),
    templatesBtn: $('templatesBtn'),
    listFilter: $('listFilter'),
    questionGrid: $('questionGrid'),
    questionCount: $('questionCount'),
    activeUserLabel: $('activeUserLabel'),
    questionDialog: $('questionDialog'),
    questionForm: $('questionForm'),
    questionDialogTitle: $('questionDialogTitle'),
    answerEditor: $('answerEditor'),
    translationsContainer: $('translationsContainer'),
    toolDialog: $('toolDialog'),
    toolDialogTitle: $('toolDialogTitle'),
    toolDialogBody: $('toolDialogBody'),
    onboardingPromptDialog: $('onboardingPromptDialog'),
    importDialog: $('importDialog'),
    importListSelect: $('importListSelect'),
    importPreview: $('importPreview'),
    aiPromptText: $('aiPromptText'),
    listsContainer: $('listsContainer'),
    toast: $('toast')
};

const filterIds = ['searchInput', 'classFilter', 'subjectFilter', 'chapterFilter', 'topicFilter', 'difficultyFilter', 'typeFilter', 'likesFilter', 'dislikesFilter', 'visibilityFilter'];

if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
}

bindEvents();
renderPrompt();
promptOnboardingOnRefresh();

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    els.loginBtn.hidden = !!user;
    els.logoutBtn.hidden = !user;
    els.activeUserLabel.textContent = user ? user.displayName || user.email || 'Signed in' : 'Viewing published questions';
    $('visibilityFilter').value = user ? 'all' : 'published';
    listenForQuestions();
    listenForLists();
    render();
});

function bindEvents() {
    els.loginBtn.addEventListener('click', async () => {
        await signInWithPopup(auth, new GoogleAuthProvider());
    });
    els.logoutBtn.addEventListener('click', () => signOut(auth));
    els.onboardingBtn.addEventListener('click', startOnboarding);
    els.newQuestionBtn.addEventListener('click', () => openQuestionDialog());
    els.exportBtn.addEventListener('click', exportFilteredCsv);
    els.importBtn.addEventListener('click', () => {
        renderImportListOptions();
        els.importDialog.showModal();
    });
    els.templatesBtn.addEventListener('click', downloadTemplateCsv);
    $('closeQuestionDialog').addEventListener('click', closeQuestionDialog);
    $('cancelQuestionBtn').addEventListener('click', closeQuestionDialog);
    $('archiveQuestionBtn').addEventListener('click', archiveActiveQuestion);
    els.questionForm.addEventListener('submit', saveQuestion);
    $('qType').addEventListener('change', () => renderAnswerEditor());
    $('addTranslationBtn').addEventListener('click', addTranslationBlock);
    $('closeToolDialog').addEventListener('click', () => {
        els.toolDialog.close();
        restoreTargetFocus();
    });
    $('cancelToolBtn').addEventListener('click', () => {
        els.toolDialog.close();
        restoreTargetFocus();
    });
    els.toolDialog.addEventListener('cancel', () => {
        restoreTargetFocus();
    });
    $('confirmToolBtn').addEventListener('click', confirmToolInsert);
    $('hiddenImageInput').addEventListener('change', insertSelectedImage);
    $('closeOnboardingPrompt').addEventListener('click', closeOnboardingPrompt);
    $('skipOnboardingBtn').addEventListener('click', closeOnboardingPrompt);
    $('startOnboardingPromptBtn').addEventListener('click', startPromptedOnboarding);
    $('closeImportDialog').addEventListener('click', () => els.importDialog.close());
    $('previewImportBtn').addEventListener('click', previewImport);
    $('confirmImportBtn').addEventListener('click', confirmImport);
    $('copyPromptBtn').addEventListener('click', copyPrompt);
    $('downloadTemplateBtn').addEventListener('click', downloadTemplateCsv);
    $('csvFileInput').addEventListener('change', loadCsvFile);
    $('createListBtn').addEventListener('click', createList);
    $('clearFiltersBtn').addEventListener('click', clearFilters);

    ['promptSubject', 'promptClass', 'promptCount', 'promptDifficulty', 'promptTopic'].forEach(id => {
        $(id).addEventListener('input', renderPrompt);
        $(id).addEventListener('change', renderPrompt);
    });
    filterIds.forEach(id => $(id).addEventListener('input', render));
    filterIds.forEach(id => $(id).addEventListener('change', render));
    els.listFilter.addEventListener('change', render);

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchView(tab.dataset.view));
    });
    document.addEventListener('selectionchange', () => saveCurrentTarget());
    document.addEventListener('focusin', (event) => {
        if (isEligibleInputField(event.target)) {
            saveCurrentTarget(event.target);
        } else {
            const editor = event.target.closest('.rich-editor');
            if (editor) {
                activeEditor = editor;
                saveCurrentTarget(editor);
            }
        }
        const cell = event.target.closest('td, th');
        if (cell && cell.closest('.rich-editor')) {
            selectedTableCell = cell;
            showTableTools(cell);
        }
    });
    document.addEventListener('mouseup', (event) => {
        if (isEligibleInputField(event.target)) {
            saveCurrentTarget(event.target);
        } else if (event.target.closest('.rich-editor')) {
            saveCurrentTarget();
        }
    });
    document.addEventListener('keyup', (event) => {
        if (isEligibleInputField(event.target)) {
            saveCurrentTarget(event.target);
        } else if (event.target.closest('.rich-editor')) {
            saveCurrentTarget();
        }
    });
    document.addEventListener('input', (event) => {
        if (isEligibleInputField(event.target)) {
            saveCurrentTarget(event.target);
        } else if (event.target.closest('.rich-editor')) {
            saveCurrentTarget();
        }
    });
    document.addEventListener('select', (event) => {
        if (isEligibleInputField(event.target)) {
            saveCurrentTarget(event.target);
        }
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.table-tools') && !event.target.closest('td, th')) {
            hideTableTools();
        }
    });
    document.addEventListener('mousedown', (event) => {
        const toolbarButton = event.target.closest('.rich-toolbar button');
        if (!toolbarButton) {
            if (isEligibleInputField(event.target)) {
                saveCurrentTarget(event.target);
            }
            return;
        }

        if (isEligibleInputField(document.activeElement)) {
            saveCurrentTarget(document.activeElement);
        } else if (document.activeElement?.closest?.('.rich-editor')) {
            saveCurrentTarget();
        }

        const hasValidTarget = (activeTarget?.type === 'input' && activeTarget.element?.isConnected) ||
                               (activeTarget?.type === 'rich' && activeTarget.element?.isConnected);

        if (!hasValidTarget) {
            const toolbarEditorId = toolbarButton.closest('.rich-toolbar')?.dataset.toolbarFor;
            const toolbarEditor = toolbarEditorId ? $(toolbarEditorId) : null;
            if (toolbarEditor) {
                activeEditor = toolbarEditor;
                ensureSavedSelection();
            }
        }

        event.preventDefault();
    });
    document.addEventListener('click', (event) => {
        const toolbarButton = event.target.closest('.rich-toolbar button');
        if (!toolbarButton) return;

        const hasValidTarget = (activeTarget?.type === 'input' && activeTarget.element?.isConnected) ||
                               (activeTarget?.type === 'rich' && activeTarget.element?.isConnected);

        if (!hasValidTarget) {
            const toolbarEditorId = toolbarButton.closest('.rich-toolbar')?.dataset.toolbarFor;
            const toolbarEditor = toolbarEditorId ? $(toolbarEditorId) : null;
            if (toolbarEditor) {
                activeEditor = toolbarEditor;
                ensureSavedSelection();
            }
        }

        if (toolbarButton.dataset.command) {
            if (activeTarget?.type === 'rich' || (!activeTarget && activeEditor)) {
                applyEditorCommand(toolbarButton.dataset.command);
            }
        }
        if (toolbarButton.dataset.insert) {
            openTool(toolbarButton.dataset.insert);
        }
    });
}

function startOnboarding() {
    if (!window.introJs) {
        toast('Guide is still loading. Try again in a moment.');
        return false;
    }
    if (els.onboardingPromptDialog.open) closeOnboardingPrompt();
    const tour = window.introJs.tour ? window.introJs.tour() : window.introJs();
    const importWasOpen = els.importDialog.open;
    const questionWasOpen = els.questionDialog.open;

    tour.setOptions({
        steps: getOnboardingSteps(),
        nextLabel: 'Next',
        prevLabel: 'Back',
        doneLabel: 'Done',
        hidePrev: true,
        showBullets: false,
        scrollToElement: true,
        exitOnOverlayClick: false
    });

    tour.onbeforechange((target) => prepareOnboardingStep(target));
    tour.oncomplete(() => finishOnboarding(importWasOpen, questionWasOpen));
    tour.onexit(() => finishOnboarding(importWasOpen, questionWasOpen));
    tour.start();
    return true;
}

function getOnboardingSteps() {
    return [
        {
            element: currentUser ? '#logoutBtn' : '#loginBtn',
            intro: currentUser
                ? 'You are signed in, so you can create lists, import questions, and save changes to Firestore.'
                : 'Start here: sign in with Google before creating lists or importing your own questions.'
        },
        {
            element: '#listsTab',
            intro: 'Open Lists when you want to group questions for a worksheet, exam, chapter, or revision set.'
        },
        {
            element: '#newListName',
            intro: 'Type a list name here. Use something concrete, like "IX Algebra Practice".'
        },
        {
            element: '#createListBtn',
            intro: 'Create the list. After it exists, it becomes available in question cards and the import dialog.'
        },
        {
            element: '#bankTab',
            intro: 'Return to the Bank to pick from existing questions.'
        },
        {
            element: '#questionGrid',
            intro: 'Existing questions show an "Add to list" dropdown on each card when you are signed in and have at least one list.'
        },
        {
            element: '#importBtn',
            intro: 'Use Import when you want to create many questions from CSV, including CSV generated by an AI assistant.'
        },
        {
            element: '.prompt-panel',
            intro: 'The AI prompt builder creates a CSV-ready instruction using the exact headers this app accepts.'
        },
        {
            element: '#copyPromptBtn',
            intro: 'Copy the prompt, paste it into your AI tool, and ask it to return only valid CSV.'
        },
        {
            element: '#csvPasteInput',
            intro: 'Paste the generated CSV here, or upload a CSV file above.'
        },
        {
            element: '#importListSelect',
            intro: 'Choose a list here to automatically add every imported question to that list.'
        },
        {
            element: '#previewImportBtn',
            intro: 'Preview checks the CSV and shows how many rows are valid before anything is saved.'
        },
        {
            element: '#confirmImportBtn',
            intro: 'Import Valid Rows saves the questions. If a list is selected, the imported questions are added there too.'
        }
    ];
}

function prepareOnboardingStep(target) {
    const selector = target?.id ? `#${target.id}` : '';
    const inImportDialog = target?.closest?.('#importDialog');

    if (selector === '#newListName' || selector === '#createListBtn') {
        closeDialogForTour(els.importDialog);
        closeDialogForTour(els.questionDialog);
        switchView('lists');
        return;
    }

    if (selector === '#bankTab' || selector === '#questionGrid' || selector === '#importBtn') {
        closeDialogForTour(els.importDialog);
        closeDialogForTour(els.questionDialog);
        switchView('bank');
        return;
    }

    if (inImportDialog) {
        closeDialogForTour(els.questionDialog);
        switchView('bank');
        renderImportListOptions();
        if (!els.importDialog.open) els.importDialog.show();
        document.querySelector('.prompt-panel')?.setAttribute('open', '');
    }
}

function finishOnboarding(importWasOpen, questionWasOpen) {
    if (!importWasOpen) closeDialogForTour(els.importDialog);
    if (!questionWasOpen) closeDialogForTour(els.questionDialog);
}

function closeDialogForTour(dialog) {
    if (dialog?.open) dialog.close();
}

function promptOnboardingOnRefresh() {
    if (localStorage.getItem(ONBOARDING_PROMPT_STORAGE_KEY) === 'true') return;
    window.setTimeout(() => {
        if (!els.onboardingPromptDialog.open) els.onboardingPromptDialog.showModal();
    }, 500);
}

function startPromptedOnboarding() {
    saveOnboardingPromptPreference();
    if (window.introJs) {
        els.onboardingPromptDialog.close();
        startOnboarding();
    } else {
        toast('Guide is still loading. Try again in a moment.');
    }
}

function closeOnboardingPrompt() {
    saveOnboardingPromptPreference();
    els.onboardingPromptDialog.close();
}

function saveOnboardingPromptPreference() {
    if ($('hideOnboardingPrompt').checked) {
        localStorage.setItem(ONBOARDING_PROMPT_STORAGE_KEY, 'true');
    }
}

function listenForQuestions() {
    unsubscribeQuestions.forEach(unsubscribe => unsubscribe());
    unsubscribeQuestions = [];
    const byId = new Map();
    const refresh = async () => {
        questions = Array.from(byId.values()).sort((a, b) => {
            const aTime = a.updatedAt?.toMillis?.() || 0;
            const bTime = b.updatedAt?.toMillis?.() || 0;
            return bTime - aTime;
        });
        els.syncStatus.textContent = `Firestore: ${COLLECTIONS.questions}`;
        await loadReactions();
        render();
    };
    const base = collection(db, COLLECTIONS.questions);
    unsubscribeQuestions.push(onSnapshot(query(base, where('status', '==', 'published')), async (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'removed') byId.delete(change.doc.id);
            else byId.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
        });
        await refresh();
    }, (error) => {
        els.syncStatus.textContent = `Firestore error: ${error.message}`;
        render();
    }));
    if (currentUser) {
        unsubscribeQuestions.push(onSnapshot(query(base, where('authorUid', '==', currentUser.uid)), async (snapshot) => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'removed') byId.delete(change.doc.id);
                else byId.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
            });
            await refresh();
        }));
    }
}

function listenForLists() {
    if (unsubscribeLists) unsubscribeLists();
    if (!currentUser) {
        lists = [];
        renderListFilterOptions();
        renderImportListOptions();
        renderLists();
        return;
    }
    const q = query(collection(db, COLLECTIONS.lists), where('ownerUid', '==', currentUser.uid));
    unsubscribeLists = onSnapshot(q, (snapshot) => {
        lists = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
            const aTime = a.updatedAt?.toMillis?.() || 0;
            const bTime = b.updatedAt?.toMillis?.() || 0;
            return bTime - aTime;
        });
        renderListFilterOptions();
        renderImportListOptions();
        renderLists();
        render();
    });
}

async function loadReactions() {
    reactions = new Map();
    if (!questions.length) return;
    const chunks = chunk(questions.map(q => q.id), 10);
    for (const ids of chunks) {
        const snap = await getDocs(query(collection(db, COLLECTIONS.reactions), where('questionId', 'in', ids)));
        snap.forEach(d => {
            const reaction = d.data();
            const current = reactions.get(reaction.questionId) || { likes: 0, dislikes: 0, mine: null };
            if (reaction.value === 'like') current.likes += 1;
            if (reaction.value === 'dislike') current.dislikes += 1;
            if (currentUser && reaction.userId === currentUser.uid) current.mine = reaction.value;
            reactions.set(reaction.questionId, current);
        });
    }
}

function render() {
    const visible = getFilteredQuestions();
    els.questionCount.textContent = `${visible.length} question${visible.length === 1 ? '' : 's'}`;
    els.questionGrid.innerHTML = visible.length ? visible.map(questionCard).join('') : `<div class="empty-card">No matching questions.</div>`;
    bindQuestionCardActions();
    renderMathAndDiagrams(els.questionGrid);
    renderLists();
}

function getFilteredQuestions() {
    const filters = Object.fromEntries(filterIds.map(id => [id, $(id).value.trim()]));
    const queryText = filters.searchInput.toLowerCase();
    const minLikes = parseOptionalNumber(filters.likesFilter);
    const minDislikes = parseOptionalNumber(filters.dislikesFilter);
    const selectedListIds = getSelectedListIds();
    const selectedQuestionIds = selectedListIds.length ? new Set(
        lists
            .filter(list => selectedListIds.includes(list.id))
            .flatMap(list => list.questionIds || [])
    ) : null;
    return questions.filter(q => {
        const reaction = reactions.get(q.id) || { likes: 0, dislikes: 0 };
        const isMine = currentUser && q.authorUid === currentUser.uid;
        const visibleByStatus = q.status === 'published' || (isMine && filters.visibilityFilter !== 'published');
        const visibilityOk = filters.visibilityFilter === 'mine' ? isMine : visibleByStatus;
        if (!visibilityOk) return false;
        if (filters.classFilter && !same(q.className, filters.classFilter)) return false;
        if (filters.subjectFilter && !same(q.subject, filters.subjectFilter)) return false;
        if (filters.chapterFilter && !contains(q.chapter, filters.chapterFilter)) return false;
        if (filters.topicFilter && !contains(q.topic, filters.topicFilter)) return false;
        if (filters.difficultyFilter && q.difficulty !== filters.difficultyFilter) return false;
        if (filters.typeFilter && q.type !== filters.typeFilter) return false;
        if (minLikes !== null && reaction.likes < minLikes) return false;
        if (minDislikes !== null && reaction.dislikes < minDislikes) return false;
        if (selectedQuestionIds && !selectedQuestionIds.has(q.id)) return false;
        if (!queryText) return true;
        return [
            q.promptHtml,
            answerText(q),
            q.className,
            q.subject,
            q.chapter,
            q.topic,
            q.authorName
        ].some(value => stripHtml(value).toLowerCase().includes(queryText));
    });
}

function parseOptionalNumber(value) {
    if (value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function getSelectedListIds() {
    return Array.from(els.listFilter.selectedOptions).map(option => option.value).filter(Boolean);
}

function questionCard(q) {
    const reaction = reactions.get(q.id) || { likes: 0, dislikes: 0, mine: null };
    const mine = currentUser && q.authorUid === currentUser.uid;
    const listButtons = currentUser && lists.length
        ? `<select data-add-to-list="${q.id}">
                <option value="">Add to list</option>
                ${lists.map(list => `<option value="${list.id}">${esc(list.name)}</option>`).join('')}
           </select>`
        : '';
    return `
        <article class="question-card">
            <div class="question-card-head">
                <span class="type-chip">${TYPE_LABELS[q.type] || q.type}</span>
                <span class="status-chip ${q.status || 'published'}">${esc(q.status || 'published')}</span>
            </div>
            <div class="rich-content">${sanitizeRich(q.promptHtml || '')}</div>
            <div class="question-meta">
                <span>${esc(q.className || 'Class')}</span>
                <span>${esc(q.subject || 'Subject')}</span>
                <span>${esc(q.chapter || 'Chapter')}</span>
                <span>${esc(q.topic || 'Topic')}</span>
                <span>${esc(q.difficulty || 'Medium')}</span>
            </div>
            <div class="card-answer"><strong>Answer:</strong> ${answerHtml(q)}</div>
            ${translationSummary(q)}
            <div class="card-footer">
                <div class="reaction-row">
                    <button class="pill-btn" data-react="like" data-id="${q.id}" ${!currentUser ? 'disabled' : ''}>Like ${reaction.likes}</button>
                    <button class="pill-btn" data-react="dislike" data-id="${q.id}" ${!currentUser ? 'disabled' : ''}>Dislike ${reaction.dislikes}</button>
                    ${listButtons}
                </div>
                <span class="spacer"></span>
                ${mine ? `<button class="pill-btn" data-edit="${q.id}">Edit</button><button class="pill-btn danger" data-archive="${q.id}">Archive</button>` : ''}
            </div>
        </article>
    `;
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

function answerText(q) {
    if (q.type === 'mcq') return (q.options || []).map((opt, i) => `${LABELS[i]} ${stripHtml(opt.html)} ${opt.correct ? 'correct' : ''}`).join(' ');
    if (q.type === 'fib') return (q.fibBanks || []).map(b => `${b.label} ${(b.answers || []).join(' ')}`).join(' ');
    if (q.type === 'true_false') return q.trueAnswer ? 'True' : 'False';
    return stripHtml(q.shortAnswerHtml);
}

function translationSummary(q) {
    const langs = Object.keys(q.translations || {});
    if (!langs.length) return '';
    return `<div class="question-meta">${langs.map(lang => `<span>${esc(lang)}</span>`).join('')}</div>`;
}

function bindQuestionCardActions() {
    document.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
        openQuestionDialog(questions.find(q => q.id === btn.dataset.edit));
    }));
    document.querySelectorAll('[data-archive]').forEach(btn => btn.addEventListener('click', () => archiveQuestion(btn.dataset.archive)));
    document.querySelectorAll('[data-react]').forEach(btn => btn.addEventListener('click', () => setReaction(btn.dataset.id, btn.dataset.react)));
    document.querySelectorAll('[data-add-to-list]').forEach(select => select.addEventListener('change', () => {
        if (select.value) addQuestionToList(select.value, select.dataset.addToList);
        select.value = '';
    }));
}

function openQuestionDialog(question = null) {
    if (!currentUser) {
        toast('Sign in with Google to create questions');
        return;
    }
    activeQuestionId = question?.id || null;
    els.questionDialogTitle.textContent = activeQuestionId ? 'Edit Question' : 'New Question';
    $('archiveQuestionBtn').hidden = !activeQuestionId;
    $('qClass').value = question?.className || '';
    $('qSubject').value = question?.subject || '';
    $('qChapter').value = question?.chapter || '';
    $('qTopic').value = question?.topic || '';
    $('qDifficulty').value = question?.difficulty || 'Medium';
    $('qType').value = question?.type || 'mcq';
    $('qStatus').value = question?.status || 'published';
    $('qPrompt').innerHTML = sanitizeRich(question?.promptHtml || '');
    renderAnswerEditor(question);
    renderTranslations(question?.translations || {});
    activeEditor = null;
    savedSelectionRange = null;
    activeTarget = null;
    els.questionDialog.showModal();
}

function closeQuestionDialog() {
    activeQuestionId = null;
    activeEditor = null;
    savedSelectionRange = null;
    activeTarget = null;
    els.questionDialog.close();
}

function renderAnswerEditor(question = null) {
    const type = $('qType').value;
    if (type === 'mcq') {
        const options = question?.options || LABELS.map(() => ({ html: '', correct: false }));
        els.answerEditor.innerHTML = `
            <div class="section-head"><h3>Options</h3><span class="question-meta"><span>Multiple correct supported</span></span></div>
            ${LABELS.map((label, index) => `
                <div class="option-row">
                    <label><input type="checkbox" class="option-correct" data-option="${index}" ${options[index]?.correct ? 'checked' : ''}> ${label}</label>
                    <div class="rich-toolbar" data-toolbar-for="option${index}">
                        <button type="button" data-command="bold"><b>B</b></button>
                        <button type="button" data-command="italic"><i>I</i></button>
                        <button type="button" data-command="code">Code</button>
                        <button type="button" data-insert="equation">Equation</button>
                        <button type="button" data-insert="image">Image</button>
                        <button type="button" data-insert="table">Table</button>
                        <button type="button" data-insert="diagram">Diagram</button>
                    </div>
                    <div id="option${index}" class="rich-editor" contenteditable="true">${sanitizeRich(options[index]?.html || '')}</div>
                </div>`).join('')}
        `;
        return;
    }
    if (type === 'true_false') {
        els.answerEditor.innerHTML = `
            <div class="tf-editor">
                <h3>Answer</h3>
                <label><input type="radio" name="tfAnswer" value="true" ${question?.trueAnswer !== false ? 'checked' : ''}> True</label>
                <label><input type="radio" name="tfAnswer" value="false" ${question?.trueAnswer === false ? 'checked' : ''}> False</label>
            </div>
        `;
        return;
    }
    if (type === 'fib') {
        const banks = question?.fibBanks?.length ? question.fibBanks : [{ label: 'Blank 1', answers: [''] }];
        els.answerEditor.innerHTML = `
            <div class="section-head"><h3>Blank Answer Banks</h3><button class="btn" type="button" id="addFibBankBtn">Add Bank</button></div>
            <div id="fibBankList" class="fib-bank-list">${banks.map(fibBankRow).join('')}</div>
        `;
        $('addFibBankBtn').addEventListener('click', () => {
            $('fibBankList').insertAdjacentHTML('beforeend', fibBankRow({ label: `Blank ${document.querySelectorAll('.blank-bank').length + 1}`, answers: [''] }));
        });
        return;
    }
    els.answerEditor.innerHTML = `
        <div class="section-head">
            <h3>Short Answer</h3>
            <div class="rich-toolbar" data-toolbar-for="shortAnswer">
                <button type="button" data-command="bold"><b>B</b></button>
                <button type="button" data-command="italic"><i>I</i></button>
                <button type="button" data-command="code">Code</button>
                <button type="button" data-insert="equation">Equation</button>
                <button type="button" data-insert="image">Image</button>
                <button type="button" data-insert="table">Table</button>
                <button type="button" data-insert="diagram">Diagram</button>
            </div>
        </div>
        <div id="shortAnswer" class="rich-editor" contenteditable="true">${sanitizeRich(question?.shortAnswerHtml || '')}</div>
    `;
}

function fibBankRow(bank) {
    return `
        <div class="blank-bank">
            <input class="fib-label" value="${esc(bank.label || '')}" placeholder="Blank label">
            <input class="fib-answers" value="${esc((bank.answers || []).join(' | '))}" placeholder="Accepted answers separated by |">
            <button class="pill-btn danger" type="button" onclick="this.closest('.blank-bank').remove()">Remove</button>
        </div>
    `;
}

function renderTranslations(translations) {
    els.translationsContainer.innerHTML = Object.entries(translations).map(([lang, value]) => translationBlock(lang, value)).join('');
}

function addTranslationBlock() {
    const lang = $('translationLang').value.trim();
    if (!lang) return toast('Add a language code');
    if (document.querySelector(`[data-translation="${cssEscape(lang)}"]`)) return toast('Language already exists');
    els.translationsContainer.insertAdjacentHTML('beforeend', translationBlock(lang, {}));
    $('translationLang').value = '';
}

function translationBlock(lang, value) {
    const type = $('qType').value;
    const optionInputs = type === 'mcq'
        ? LABELS.map((label, i) => `<label class="field"><span>Option ${label}</span><input class="translation-option" data-index="${i}" value="${esc(value.options?.[i] || '')}"></label>`).join('')
        : '';
    return `
        <div class="translation-card" data-translation="${esc(lang)}">
            <div class="translation-head">
                <strong>${esc(lang)}</strong>
                <span class="spacer"></span>
                <button class="pill-btn danger" type="button" onclick="this.closest('.translation-card').remove()">Remove</button>
            </div>
            <label class="field"><span>Question</span><textarea class="translation-question" rows="2">${esc(value.question || '')}</textarea></label>
            <label class="field"><span>Answer</span><textarea class="translation-answer" rows="2">${esc(value.answer || '')}</textarea></label>
            ${optionInputs}
        </div>
    `;
}

async function saveQuestion(event) {
    event.preventDefault();
    if (!currentUser) return toast('Sign in required');
    const type = $('qType').value;
    const existing = activeQuestionId ? questions.find(q => q.id === activeQuestionId) : null;
    if (existing && existing.authorUid !== currentUser.uid) return toast('Only the author can edit this question');
    const payload = {
        type,
        className: $('qClass').value.trim(),
        subject: $('qSubject').value.trim(),
        chapter: $('qChapter').value.trim(),
        topic: $('qTopic').value.trim(),
        difficulty: $('qDifficulty').value,
        status: $('qStatus').value,
        promptHtml: sanitizeRich($('qPrompt').innerHTML),
        options: [],
        trueAnswer: true,
        fibBanks: [],
        shortAnswerHtml: '',
        translations: collectTranslations(),
        authorUid: currentUser.uid,
        authorName: currentUser.displayName || currentUser.email || 'Teacher',
        updatedAt: serverTimestamp()
    };
    if (type === 'mcq') {
        payload.options = LABELS.map((_, i) => ({
            html: sanitizeRich($(`option${i}`).innerHTML),
            correct: document.querySelector(`.option-correct[data-option="${i}"]`)?.checked || false
        }));
        if (!payload.options.some(option => option.correct)) return toast('Select at least one correct option');
    } else if (type === 'true_false') {
        payload.trueAnswer = document.querySelector('input[name="tfAnswer"]:checked')?.value !== 'false';
    } else if (type === 'fib') {
        payload.fibBanks = Array.from(document.querySelectorAll('.blank-bank')).map(row => ({
            label: row.querySelector('.fib-label').value.trim() || 'Blank',
            answers: row.querySelector('.fib-answers').value.split('|').map(v => v.trim()).filter(Boolean)
        })).filter(bank => bank.answers.length);
        if (!payload.fibBanks.length) return toast('Add at least one answer bank');
    } else {
        payload.shortAnswerHtml = sanitizeRich($('shortAnswer').innerHTML);
    }
    if (!payload.className || !payload.subject || !payload.chapter || !payload.topic || !stripHtml(payload.promptHtml)) {
        return toast('Class, subject, chapter, topic, and question are required');
    }
    if (activeQuestionId) {
        await updateDoc(doc(db, COLLECTIONS.questions, activeQuestionId), payload);
        toast('Question updated');
    } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, COLLECTIONS.questions), payload);
        toast('Question created');
    }
    closeQuestionDialog();
}

function collectTranslations() {
    const out = {};
    document.querySelectorAll('.translation-card').forEach(card => {
        const lang = card.dataset.translation;
        out[lang] = {
            question: card.querySelector('.translation-question').value.trim(),
            answer: card.querySelector('.translation-answer').value.trim(),
            options: Array.from(card.querySelectorAll('.translation-option')).map(input => input.value.trim())
        };
    });
    return out;
}

async function archiveActiveQuestion() {
    if (activeQuestionId) await archiveQuestion(activeQuestionId);
    closeQuestionDialog();
}

async function archiveQuestion(id) {
    const question = questions.find(q => q.id === id);
    if (!currentUser || !question || question.authorUid !== currentUser.uid) return toast('Only the author can archive');
    await updateDoc(doc(db, COLLECTIONS.questions, id), { status: 'archived', updatedAt: serverTimestamp(), archivedAt: serverTimestamp() });
    toast('Question archived');
}

async function setReaction(questionId, value) {
    if (!currentUser) return toast('Sign in to react');
    const id = `${questionId}_${currentUser.uid}`;
    await setDoc(doc(db, COLLECTIONS.reactions, id), {
        questionId,
        userId: currentUser.uid,
        value,
        updatedAt: serverTimestamp()
    });
    await loadReactions();
    render();
}

async function createList() {
    if (!currentUser) return toast('Sign in to create lists');
    const name = $('newListName').value.trim();
    if (!name) return toast('Enter a list name');
    await addDoc(collection(db, COLLECTIONS.lists), {
        name,
        ownerUid: currentUser.uid,
        questionIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    $('newListName').value = '';
    toast('List created');
}

async function addQuestionToList(listId, questionId) {
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    const ids = Array.from(new Set([...(list.questionIds || []), questionId]));
    await updateDoc(doc(db, COLLECTIONS.lists, listId), { questionIds: ids, updatedAt: serverTimestamp() });
    toast('Added to list');
}

async function removeQuestionFromList(listId, questionId) {
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    await updateDoc(doc(db, COLLECTIONS.lists, listId), {
        questionIds: (list.questionIds || []).filter(id => id !== questionId),
        updatedAt: serverTimestamp()
    });
}

async function deleteList(listId) {
    await deleteDoc(doc(db, COLLECTIONS.lists, listId));
}

function renderLists() {
    if (!currentUser) {
        els.listsContainer.innerHTML = `<div class="empty-card">Sign in to manage lists.</div>`;
        return;
    }
    els.listsContainer.innerHTML = lists.length ? lists.map(list => {
        const items = (list.questionIds || []).map(id => questions.find(q => q.id === id)).filter(Boolean);
        return `
            <article class="list-card">
                <div class="list-head">
                    <h3>${esc(list.name)}</h3>
                    <button class="pill-btn danger" data-delete-list="${list.id}">Delete</button>
                </div>
                <div class="list-items">
                    ${items.length ? items.map(q => `
                        <div class="mini-question">
                            <span>${esc(stripHtml(q.promptHtml).slice(0, 120))}</span>
                            <button class="pill-btn danger" data-remove-from-list="${list.id}" data-question="${q.id}">Remove</button>
                        </div>
                    `).join('') : '<div class="empty-card">No questions in this list.</div>'}
                </div>
            </article>
        `;
    }).join('') : `<div class="empty-card">No lists yet.</div>`;
    document.querySelectorAll('[data-delete-list]').forEach(btn => btn.addEventListener('click', () => deleteList(btn.dataset.deleteList)));
    document.querySelectorAll('[data-remove-from-list]').forEach(btn => btn.addEventListener('click', () => removeQuestionFromList(btn.dataset.removeFromList, btn.dataset.question)));
}

function switchView(view) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
    $('bankView').hidden = view !== 'bank';
    $('listsView').hidden = view !== 'lists';
}

function applyEditorCommand(command) {
    const editor = (activeTarget && activeTarget.type === 'rich' && activeTarget.element?.isConnected)
        ? activeTarget.element
        : (getEditorForRange(savedSelectionRange) || activeEditor);
    if (!editor || !editor.classList?.contains('rich-editor')) return;
    editor.focus();
    if (command === 'code') {
        document.execCommand('formatBlock', false, 'pre');
    } else {
        document.execCommand(command, false, null);
    }
}

function openTool(kind, initialVal) {
    if (!activeTarget || !activeTarget.element?.isConnected) {
        ensureSavedSelection();
    }
    if (!activeTarget || !activeTarget.element?.isConnected) {
        return toast('Place the cursor in an editor or field first');
    }
    els.toolDialog.dataset.tool = kind;
    els.toolDialogTitle.textContent = `Insert ${kind[0].toUpperCase()}${kind.slice(1)}`;
    if (kind === 'equation') {
        const currentLatex = initialVal !== undefined ? initialVal : (FORMULA_LIBRARY[0]?.latex || '\\frac{a}{b}');
        els.toolDialogBody.innerHTML = `
            <label class="field"><span>LaTeX Expression</span><input id="latexInput" value="${esc(currentLatex)}"></label>
            <div class="form-grid">
                <label class="field"><span>Save Name</span><input id="customFormulaName" placeholder="Custom formula name"></label>
                <label class="field"><span>Category</span><input id="customFormulaCategory" value="Custom"></label>
                <label class="field"><span>Action</span><button class="btn" id="saveCustomFormulaBtn" type="button">Save Custom Equation</button></label>
            </div>
            <label class="field" style="margin-top: 6px;"><span>Formula Library (Click to select, double-click to insert)</span></label>
            <div class="formula-grid">${formulaCardsHtml(currentLatex)}</div>
            <label class="field" style="margin-top: 6px;"><span>Preview</span></label>
            <div id="formulaPreview" class="diagram-preview"></div>
        `;

        const latexInput = $('latexInput');
        const cards = els.toolDialogBody.querySelectorAll('.formula-card[data-latex]');

        function updateSelectionHighlight(val) {
            cards.forEach(card => {
                if (card.dataset.latex === val) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            });
        }

        latexInput.addEventListener('input', () => {
            updateSelectionHighlight(latexInput.value.trim());
            renderFormulaPreview();
        });

        latexInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                confirmToolInsert();
            }
        });

        $('saveCustomFormulaBtn').addEventListener('click', saveCustomFormulaFromModal);

        cards.forEach(btn => {
            btn.addEventListener('click', (event) => {
                if (event.target.closest('[data-favorite]')) return;
                cards.forEach(c => c.classList.remove('selected'));
                btn.classList.add('selected');
                latexInput.value = btn.dataset.latex;
                const nameInput = $('customFormulaName');
                if (nameInput && !nameInput.value.trim()) {
                    nameInput.value = btn.querySelector('strong')?.textContent || '';
                }
                saveRecentFormula(btn.dataset.latex);
                renderFormulaPreview();
            });

            btn.addEventListener('dblclick', (event) => {
                if (event.target.closest('[data-favorite]')) return;
                cards.forEach(c => c.classList.remove('selected'));
                btn.classList.add('selected');
                latexInput.value = btn.dataset.latex;
                saveRecentFormula(btn.dataset.latex);
                confirmToolInsert();
            });
        });

        els.toolDialogBody.querySelectorAll('[data-favorite]').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const latex = btn.dataset.favorite;
                toggleFavoriteFormula(latex);
                const currentVal = $('latexInput')?.value || latex;
                openTool('equation', currentVal);
            });
        });

        renderFormulaPreview();
    } else if (kind === 'diagram') {
        els.toolDialogBody.innerHTML = `
            <label class="field"><span>Mermaid</span><textarea id="diagramInput" rows="8">flowchart TD
    A[Question] --> B{Answer}
    B --> C[Correct]
    B --> D[Review]</textarea></label>
            <div id="diagramPreview" class="diagram-preview"></div>
        `;
        $('diagramInput').addEventListener('input', renderDiagramPreview);
        renderDiagramPreview();
    } else if (kind === 'table') {
        els.toolDialogBody.innerHTML = `
            <div class="form-grid">
                <label class="field"><span>Rows</span><input id="tableRows" type="number" min="1" max="12" value="2"></label>
                <label class="field"><span>Columns</span><input id="tableCols" type="number" min="1" max="8" value="2"></label>
            </div>
        `;
    } else if (kind === 'image') {
        $('hiddenImageInput').value = '';
        $('hiddenImageInput').click();
        return;
    }
    if (!els.toolDialog.open) els.toolDialog.showModal();
}

let isConfirmingTool = false;

function confirmToolInsert() {
    if (isConfirmingTool) return;
    isConfirmingTool = true;
    try {
        const kind = els.toolDialog.dataset.tool;
        let htmlToInsert = null;
        let textToInsert = null;
        let latexToSave = null;

        if (kind === 'equation') {
            const latex = $('latexInput')?.value.trim();
            if (!latex) return toast('Please select or enter a formula');
            htmlToInsert = renderMathToken(latex);
            textToInsert = latex;
            latexToSave = latex;
        } else if (kind === 'diagram') {
            const code = $('diagramInput')?.value.trim();
            if (!code) return toast('Please enter Mermaid diagram code');
            htmlToInsert = `<div class="mermaid-token" data-code="${esc(code)}"><pre>${esc(code)}</pre></div><p></p>`;
            textToInsert = code;
        } else if (kind === 'table') {
            const rows = Number($('tableRows')?.value || 2);
            const cols = Number($('tableCols')?.value || 2);
            htmlToInsert = createTableHtml(rows, cols);
            textToInsert = `[Table ${rows}x${cols}]`;
        }

        els.toolDialog.close();

        if (htmlToInsert || textToInsert) {
            insertContentAtTarget(htmlToInsert, textToInsert);
        }
        if (latexToSave) {
            saveRecentFormula(latexToSave);
        }
    } finally {
        setTimeout(() => {
            isConfirmingTool = false;
        }, 200);
    }
}

function insertSelectedImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const html = `<img src="${reader.result}" alt="">`;
        const text = reader.result;
        insertContentAtTarget(html, text);
    };
    reader.readAsDataURL(file);
}

function insertContentAtTarget(html, text = '') {
    if (activeTarget && activeTarget.type === 'input' && activeTarget.element?.isConnected) {
        const input = activeTarget.element;
        const val = input.value ?? '';
        const start = Math.min(activeTarget.start ?? val.length, val.length);
        const end = Math.min(activeTarget.end ?? val.length, val.length);
        const insertion = text !== undefined && text !== null ? text : (html ? html.replace(/<[^>]+>/g, '') : '');

        const before = val.slice(0, start);
        const after = val.slice(end);
        input.value = before + insertion + after;

        const nextPos = start + insertion.length;
        input.focus();
        try {
            input.setSelectionRange(nextPos, nextPos);
        } catch {}

        activeTarget.start = nextPos;
        activeTarget.end = nextPos;

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return;
    }

    const editor = (activeTarget && activeTarget.type === 'rich' && activeTarget.element?.isConnected)
        ? activeTarget.element
        : (getEditorForRange(savedSelectionRange) || activeEditor || $('qPrompt'));

    if (!editor || !editor.isConnected) return;
    activeEditor = editor;
    editor.focus();

    const sel = window.getSelection();
    let range = null;

    if (activeTarget && activeTarget.type === 'rich' && activeTarget.range && editor.contains(activeTarget.range.commonAncestorContainer)) {
        range = activeTarget.range;
    } else if (savedSelectionRange && editor.contains(savedSelectionRange.commonAncestorContainer)) {
        range = savedSelectionRange;
    } else if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        range = sel.getRangeAt(0);
    } else {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
    }

    sel.removeAllRanges();
    sel.addRange(range);

    range.deleteContents();

    const template = document.createElement('template');
    template.innerHTML = html || esc(text);
    const frag = template.content;
    const lastNode = frag.lastChild;

    range.insertNode(frag);

    if (lastNode) {
        const newRange = document.createRange();
        newRange.setStartAfter(lastNode);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedSelectionRange = newRange.cloneRange();
        activeTarget = { type: 'rich', element: editor, range: savedSelectionRange };
    } else if (sel && sel.rangeCount > 0) {
        savedSelectionRange = sel.getRangeAt(0).cloneRange();
        activeTarget = { type: 'rich', element: editor, range: savedSelectionRange };
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertHtml(html, text = '') {
    insertContentAtTarget(html, text);
}

function renderFormulaPreview() {
    const latex = $('latexInput')?.value || '';
    const previewEl = $('formulaPreview');
    if (!previewEl) return;
    if (!latex.trim()) {
        previewEl.innerHTML = '<span style="color: var(--muted); font-size: 13px;">Preview will appear here</span>';
        return;
    }
    try {
        if (window.katex) {
            previewEl.innerHTML = window.katex.renderToString(latex, { throwOnError: false, displayMode: true });
        } else {
            previewEl.innerHTML = `<code>${esc(latex)}</code>`;
        }
    } catch {
        previewEl.innerHTML = `<code>${esc(latex)}</code>`;
    }
}

async function renderDiagramPreview() {
    const target = $('diagramPreview');
    const code = $('diagramInput')?.value || '';
    if (!window.mermaid || !target) return;
    try {
        await window.mermaid.parse(code);
        const { svg } = await window.mermaid.render(`qb_diag_${Date.now()}`, code);
        target.innerHTML = svg;
    } catch {
        target.textContent = 'Unable to render diagram';
    }
}

function showTableTools(cell) {
    hideTableTools();
    const rect = cell.getBoundingClientRect();
    const tools = document.createElement('div');
    tools.className = 'table-tools';
    tools.style.cssText = `position: fixed; left: ${Math.max(8, rect.left)}px; top: ${Math.max(8, rect.top - 42)}px; z-index: 30; display: flex; gap: 4px; background: #fff; border: 1px solid var(--line); border-radius: 7px; padding: 4px; box-shadow: var(--shadow);`;
    tools.innerHTML = `
        <button class="pill-btn" data-table-tool="row">Row</button>
        <button class="pill-btn" data-table-tool="col">Col</button>
        <button class="pill-btn" data-table-tool="merge">Merge</button>
        <button class="pill-btn" data-table-tool="split">Split</button>
        <button class="pill-btn" data-table-tool="fit">Fit</button>
        <button class="pill-btn" data-table-tool="resize">Resize</button>
    `;
    document.body.appendChild(tools);
    tools.querySelectorAll('[data-table-tool]').forEach(btn => btn.addEventListener('click', () => applyTableTool(btn.dataset.tableTool)));
}

function hideTableTools() {
    document.querySelector('.table-tools')?.remove();
}

function applyTableTool(tool) {
    if (!selectedTableCell) return;
    const table = selectedTableCell.closest('table');
    const row = selectedTableCell.closest('tr');
    const cellIndex = Array.from(row.children).indexOf(selectedTableCell);
    if (tool === 'row') {
        const newRow = row.cloneNode(true);
        newRow.querySelectorAll('td, th').forEach(cell => cell.innerHTML = '');
        row.after(newRow);
    }
    if (tool === 'col') {
        Array.from(table.rows).forEach(tableRow => {
            const newCell = document.createElement('td');
            newCell.contentEditable = 'true';
            tableRow.children[cellIndex]?.after(newCell);
        });
    }
    if (tool === 'merge') {
        const next = selectedTableCell.nextElementSibling;
        if (next) {
            selectedTableCell.colSpan = (selectedTableCell.colSpan || 1) + (next.colSpan || 1);
            selectedTableCell.innerHTML += ` ${next.innerHTML}`;
            next.remove();
        }
    }
    if (tool === 'split' && selectedTableCell.colSpan > 1) {
        selectedTableCell.colSpan -= 1;
        const newCell = document.createElement('td');
        newCell.contentEditable = 'true';
        selectedTableCell.after(newCell);
    }
    if (tool === 'fit') {
        table.style.width = '100%';
        table.style.tableLayout = 'fixed';
    }
    if (tool === 'resize') {
        const width = prompt('Table width', table.style.width || '100%');
        if (width) table.style.width = width;
    }
}

function createTableHtml(rows, cols) {
    let html = '<table style="width:100%;table-layout:fixed"><tbody>';
    for (let r = 0; r < rows; r += 1) {
        html += '<tr>';
        for (let c = 0; c < cols; c += 1) html += '<td contenteditable="true"></td>';
        html += '</tr>';
    }
    return `${html}</tbody></table>`;
}

function renderMathToken(latex) {
    try {
        const rendered = window.katex ? window.katex.renderToString(latex, { throwOnError: false }) : esc(latex);
        return `<span class="math-token" data-latex="${esc(latex)}" contenteditable="false">${rendered}</span>\u00A0`;
    } catch {
        return `<code class="math-token" data-latex="${esc(latex)}" contenteditable="false">${esc(latex)}</code>\u00A0`;
    }
}

function formulaCardsHtml(selectedLatex = '') {
    const favorites = getFavoriteFormulas();
    const recentLatex = JSON.parse(localStorage.getItem('qb_recent_formulas_v1') || '[]');
    const recent = recentLatex.map((latex, index) => ({ id: `recent_${index}`, category: 'Recently Used', name: latex, latex }));
    const formulas = [...getCustomFormulas(), ...recent, ...FORMULA_LIBRARY];
    return formulas.map(f => {
        const isSelected = selectedLatex && f.latex === selectedLatex;
        const isFav = favorites.includes(f.latex);
        return `
            <button class="formula-card${isSelected ? ' selected' : ''}" type="button" data-latex="${esc(f.latex)}">
                <div class="formula-card-top">
                    <strong>${esc(f.name)}</strong>
                    <span class="pill-btn${isFav ? ' active' : ''}" data-favorite="${esc(f.latex)}">${isFav ? '★ Favorited' : 'Favorite'}</span>
                </div>
                <small>${esc(f.category || 'Formula')}</small>
                <code>${esc(f.latex)}</code>
            </button>
        `;
    }).join('');
}

function getCustomFormulas() {
    return JSON.parse(localStorage.getItem('qb_custom_formulas_v1') || '[]');
}

function saveCustomFormulaFromModal() {
    const name = $('customFormulaName').value.trim();
    const category = $('customFormulaCategory').value.trim() || 'Custom';
    const latex = $('latexInput').value.trim();
    if (!name || !latex) return toast('Name and LaTeX are required');
    const formulas = getCustomFormulas().filter(f => f.latex !== latex);
    formulas.unshift({ id: `custom_${Date.now()}`, name, category, latex });
    localStorage.setItem('qb_custom_formulas_v1', JSON.stringify(formulas));
    toast('Custom equation saved');
    openTool('equation', latex);
}

function getFavoriteFormulas() {
    return JSON.parse(localStorage.getItem('qb_favorite_formulas_v1') || '[]');
}

function toggleFavoriteFormula(latex) {
    const favorites = getFavoriteFormulas();
    const next = favorites.includes(latex) ? favorites.filter(v => v !== latex) : [latex, ...favorites];
    localStorage.setItem('qb_favorite_formulas_v1', JSON.stringify(next));
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
            const { svg } = await window.mermaid.render(`qb_card_${Date.now()}_${Math.random().toString(16).slice(2)}`, code);
            token.innerHTML = svg;
        } catch {
            token.innerHTML = '<code>Diagram error</code>';
        }
    }
}

function previewImport() {
    const csv = $('csvPasteInput').value.trim();
    const result = parseCsvQuestions(csv);
    importRows = result.rows;
    $('confirmImportBtn').disabled = !importRows.length || !currentUser;
    els.importPreview.innerHTML = `
        <strong>${importRows.length} valid row${importRows.length === 1 ? '' : 's'}</strong>
        ${result.errors.length ? `<div class="card-answer">${formatImportErrors(result.errors)}</div>` : ''}
    `;
}

async function confirmImport() {
    if (!currentUser) return toast('Sign in to import');
    const selectedListId = els.importListSelect.value;
    const importedQuestionIds = [];
    for (const row of importRows) {
        const createdQuestion = await addDoc(collection(db, COLLECTIONS.questions), {
            ...row,
            authorUid: currentUser.uid,
            authorName: currentUser.displayName || currentUser.email || 'Teacher',
            status: 'published',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        importedQuestionIds.push(createdQuestion.id);
    }
    if (selectedListId && importedQuestionIds.length) {
        await updateDoc(doc(db, COLLECTIONS.lists, selectedListId), {
            questionIds: arrayUnion(...importedQuestionIds),
            updatedAt: serverTimestamp()
        });
    }
    els.importDialog.close();
    $('csvPasteInput').value = '';
    $('csvFileInput').value = '';
    els.importListSelect.value = '';
    importRows = [];
    toast(selectedListId ? 'Questions imported and added to list' : 'Questions imported');
}

function renderImportListOptions() {
    if (!els.importListSelect) return;
    const selected = els.importListSelect.value;
    els.importListSelect.innerHTML = `
        <option value="">Do not add to a list</option>
        ${lists.map(list => `<option value="${list.id}">${esc(list.name)}</option>`).join('')}
    `;
    els.importListSelect.value = lists.some(list => list.id === selected) ? selected : '';
    els.importListSelect.disabled = !currentUser || !lists.length;
}

function renderListFilterOptions() {
    const selected = new Set(getSelectedListIds());
    els.listFilter.innerHTML = lists.length
        ? lists.map(list => `<option value="${list.id}">${esc(list.name)}</option>`).join('')
        : '<option value="" disabled>No lists available</option>';
    Array.from(els.listFilter.options).forEach(option => {
        option.selected = selected.has(option.value);
    });
    els.listFilter.disabled = !currentUser || !lists.length;
}

function parseCsvQuestions(text) {
    const rows = parseCsv(text);
    const errors = [];
    if (rows.length < 2) return { rows: [], errors: ['No CSV rows found'] };
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const parsed = [];
    rows.slice(1).forEach((cells, index) => {
        if (!cells.some(Boolean)) return;
        const row = Object.fromEntries(headers.map((h, i) => [h, cells[i] || '']));
        const type = normalizeType(row.type || 'mcq');
        const question = {
            type,
            className: row.class || '',
            subject: row.subject || '',
            chapter: row.chapter || '',
            topic: row.topic || '',
            difficulty: row.difficulty || 'Medium',
            promptHtml: esc(row.question || ''),
            options: [],
            trueAnswer: true,
            fibBanks: [],
            shortAnswerHtml: '',
            translations: {}
        };
        if (!question.className || !question.subject || !question.chapter || !question.topic || !row.question) {
            errors.push(`Row ${index + 2}: missing class, subject, chapter, topic, or question`);
            return;
        }
        if (type === 'mcq') {
            const correct = splitMulti(row.correct_options).map(v => v.toUpperCase());
            question.options = LABELS.map(label => ({
                html: esc(row[`option_${label.toLowerCase()}`] || ''),
                correct: correct.includes(label)
            }));
            if (question.options.some(o => !stripHtml(o.html)) || !question.options.some(o => o.correct)) {
                errors.push(`Row ${index + 2}: MCQ needs four options and at least one correct option`);
                return;
            }
        } else if (type === 'true_false') {
            question.trueAnswer = String(row.true_false_answer || '').toLowerCase() !== 'false';
        } else if (type === 'fib') {
            question.fibBanks = parseFibBanks(row.fib_banks);
            if (!question.fibBanks.length) {
                errors.push(fibBankImportError(index + 2, row));
                return;
            }
        } else {
            question.shortAnswerHtml = esc(row.short_answer || row.translated_answer || '');
        }
        if (row.language) {
            question.translations[row.language] = {
                question: row.translated_question || '',
                answer: row.translated_answer || '',
                options: LABELS.map(label => row[`translated_option_${label.toLowerCase()}`] || '')
            };
        }
        parsed.push(question);
    });
    return { rows: parsed, errors };
}

function fibBankImportError(rowNumber, row) {
    const value = String(row.fib_banks || '').trim();
    const details = [
        'FIB needs answer banks in the fib_banks column.',
        'Use one bank per blank and separate banks with semicolons.',
        'Inside a bank, write a label, colon, then accepted answers separated by |.',
        'Example: Blank 1:0|zero;Blank 2:100|one hundred'
    ];
    if (!value) {
        details.unshift('The fib_banks cell is empty.');
    } else if (!value.includes(':')) {
        details.unshift(`Received "${value}", but no blank label separator ":" was found.`);
    } else {
        details.unshift(`Received "${value}", but no accepted answers could be parsed.`);
    }
    return {
        row: rowNumber,
        field: 'fib_banks',
        message: 'FIB needs answer banks',
        details
    };
}

function formatImportErrors(errors) {
    return errors.map(error => {
        if (typeof error === 'string') return `<div>${esc(error)}</div>`;
        return `
            <div class="import-error">
                <strong>Row ${esc(error.row)}: ${esc(error.message)}</strong>
                <div>Column: <code>${esc(error.field)}</code></div>
                <ul>${(error.details || []).map(detail => `<li>${esc(detail)}</li>`).join('')}</ul>
            </div>
        `;
    }).join('');
}

function parseFibBanks(value) {
    return String(value || '').split(';').map((bank, index) => {
        const [label, answers] = bank.includes(':') ? bank.split(/:(.*)/).filter(Boolean) : [`Blank ${index + 1}`, bank];
        return { label: label.trim(), answers: splitMulti(answers) };
    }).filter(bank => bank.answers.length);
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];
        if (ch === '"' && quoted && next === '"') {
            cell += '"';
            i += 1;
        } else if (ch === '"') {
            quoted = !quoted;
        } else if (ch === ',' && !quoted) {
            row.push(cell);
            cell = '';
        } else if ((ch === '\n' || ch === '\r') && !quoted) {
            if (ch === '\r' && next === '\n') i += 1;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += ch;
        }
    }
    row.push(cell);
    rows.push(row);
    return rows;
}

function loadCsvFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        $('csvPasteInput').value = reader.result;
        previewImport();
    };
    reader.readAsText(file);
}

function exportFilteredCsv() {
    const rows = [TEMPLATE_HEADERS];
    getFilteredQuestions().forEach(q => {
        const base = [
            q.type,
            q.className,
            q.subject,
            q.chapter,
            q.topic,
            q.difficulty,
            stripHtml(q.promptHtml),
            stripHtml(q.options?.[0]?.html),
            stripHtml(q.options?.[1]?.html),
            stripHtml(q.options?.[2]?.html),
            stripHtml(q.options?.[3]?.html),
            (q.options || []).map((o, i) => o.correct ? LABELS[i] : '').filter(Boolean).join('|'),
            q.type === 'true_false' ? (q.trueAnswer ? 'true' : 'false') : '',
            q.type === 'fib' ? (q.fibBanks || []).map(b => `${b.label}:${(b.answers || []).join('|')}`).join(';') : '',
            stripHtml(q.shortAnswerHtml),
            '',
            '',
            '',
            '',
            '',
            '',
            ''
        ];
        rows.push(base);
        Object.entries(q.translations || {}).forEach(([lang, t]) => {
            const translated = [...base];
            translated[15] = lang;
            translated[16] = t.question || '';
            translated[17] = t.answer || '';
            LABELS.forEach((_, i) => translated[18 + i] = t.options?.[i] || '');
            rows.push(translated);
        });
    });
    downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), 'question-bank-export.csv');
}

function downloadTemplateCsv() {
    const sample = [
        TEMPLATE_HEADERS,
        ['mcq', 'IX', 'Mathematics', 'Algebra', 'Polynomials', 'Medium', 'Which expressions are polynomials?', 'x^2 + 1', '1 / x', 'x + 3', 'sqrt(x)', 'A|C', '', '', '', 'hi', 'Kaun se expressions polynomials hain?', 'A aur C', 'x^2 + 1', '1 / x', 'x + 3', 'sqrt(x)'],
        ['fib', 'VIII', 'Science', 'Matter', 'States', 'Easy', 'Water freezes at ____ degree Celsius and boils at ____ degree Celsius.', '', '', '', '', '', '', 'Blank 1:0|zero;Blank 2:100|one hundred', '', '', '', '', '', '', '', ''],
        ['true_false', 'VII', 'Science', 'Plants', 'Photosynthesis', 'Easy', 'Plants release oxygen during photosynthesis.', '', '', '', '', '', 'true', '', '', '', '', '', '', '', '', ''],
        ['short_answer', 'X', 'Physics', 'Electricity', 'Ohm Law', 'Medium', 'State Ohm law.', '', '', '', '', '', '', '', 'Voltage is directly proportional to current when resistance is constant.', '', '', '', '', '', '', '']
    ];
    downloadBlob(new Blob([toCsv(sample)], { type: 'text/csv;charset=utf-8' }), 'question-bank-template.csv');
}

function renderPrompt() {
    const headers = TEMPLATE_HEADERS.join(',');
    const subject = $('promptSubject')?.value || 'Mathematics';
    const className = $('promptClass')?.value || 'IX';
    const count = $('promptCount')?.value || '10';
    const difficulty = $('promptDifficulty')?.value || 'Medium';
    const topic = $('promptTopic')?.value || '';
    els.aiPromptText.textContent = `Create ${count} import-ready question bank rows as CSV.
Use exactly these headers:
${headers}

Requirements:
- class must be "${className}".
- subject must be "${subject}".
- difficulty must be "${difficulty}".
- include chapter and topic${topic ? `, focused on "${topic}"` : ''}.
- type must be one of mcq, true_false, fib, short_answer.
- MCQ rows must have option_a through option_d and correct_options as A, B, C, D, or multiple letters separated by |.
- FIB rows may contain multiple answer banks in fib_banks like "Blank 1:answer one|answer two;Blank 2:answer".
- For translated content, fill language, translated_question, translated_answer, and translated_option_a through translated_option_d when relevant.
- Escape commas and quotation marks correctly according to CSV rules.
- Return only valid CSV inside one csv code block.`;
}

async function copyPrompt() {
    await navigator.clipboard.writeText(els.aiPromptText.textContent);
    toast('Prompt copied');
}

function clearFilters() {
    filterIds.forEach(id => {
        if (id === 'visibilityFilter') $(id).value = currentUser ? 'all' : 'published';
        else $(id).value = '';
    });
    Array.from(els.listFilter.options).forEach(option => {
        option.selected = false;
    });
    render();
}

function normalizeType(value) {
    const v = String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (['tf', 'truefalse', 'true_false'].includes(v)) return 'true_false';
    if (['fill_in_the_blank', 'fill_blank', 'fib'].includes(v)) return 'fib';
    if (['short', 'short_answer'].includes(v)) return 'short_answer';
    return 'mcq';
}

function saveRecentFormula(latex) {
    const key = 'qb_recent_formulas_v1';
    const recent = JSON.parse(localStorage.getItem(key) || '[]').filter(v => v !== latex);
    recent.unshift(latex);
    localStorage.setItem(key, JSON.stringify(recent.slice(0, 12)));
}

function sanitizeRich(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    template.content.querySelectorAll('script, iframe, object, embed').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
        Array.from(node.attributes).forEach(attr => {
            if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
        });
    });
    return template.innerHTML;
}

function stripHtml(value = '') {
    const div = document.createElement('div');
    div.innerHTML = String(value || '');
    return div.textContent || div.innerText || '';
}

function splitMulti(value) {
    return String(value || '').split(/[|,]/).map(v => v.trim()).filter(Boolean);
}

function toCsv(rows) {
    return rows.map(row => row.map(value => {
        const text = String(value ?? '');
        return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    }).join(',')).join('\n');
}

function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

function same(a, b) {
    return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function contains(a, b) {
    return String(a || '').toLowerCase().includes(String(b || '').toLowerCase());
}

function esc(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}
