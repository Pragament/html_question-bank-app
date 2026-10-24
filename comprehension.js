import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const PASSAGES_COLLECTION = 'qb_comprehensions_v1';

// Legacy questions already include their passage in promptHtml.
export function referencesPassage(question) {
    return !!question.comprehensionId && !Object.hasOwn(question, 'comprehensionPassageHtml');
}

export async function loadPassages(db, questions) {
    const ids = [...new Set(questions.filter(referencesPassage).map(q => q.comprehensionId))];
    const passages = await Promise.all(ids.map(async id => {
        const snapshot = await getDoc(doc(db, PASSAGES_COLLECTION, id));
        if (!snapshot.exists()) throw new Error('A shared comprehension passage could not be found.');
        return [id, snapshot.data()];
    }));
    return new Map(passages);
}

export function questionPromptHtml(question, passages) {
    if (!referencesPassage(question)) return question.promptHtml || '';
    const passage = passages.get(question.comprehensionId);
    return `${passage?.passageHtml || '<p>Shared passage unavailable.</p>'}<hr>${question.promptHtml || ''}`;
}
