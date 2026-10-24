# Firestore Schema

This app uses prefixed collections so it can share the Firebase project with other apps without colliding with existing data.

## Collections

### `/qb_questions_v1/{questionId}`

Stores all question bank questions.

Read access:

- Anyone can read questions where `status` is `published`.
- Signed-in authors can also read their own `draft` and `archived` questions.

Write access:

- Signed-in users can create questions where `authorUid` matches their Firebase Auth UID.
- Only the question author can edit or archive their question.
- Questions are archived by setting `status` to `archived`; hard delete is disabled in the starter rules.

Document shape:

```js
{
  type: 'mcq' | 'true_false' | 'fib' | 'short_answer',
  sectionId: 'classSections document id',
  classId: 'class_ix',
  subjectId: 'class_ix__subject_mathematics',
  chapterId: 'class_ix__subject_mathematics__chapter_algebra',
  topicId: 'class_ix__subject_mathematics__chapter_algebra__topic_polynomials',
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Very Hard',
  status: 'published' | 'draft' | 'archived',
  verified: true,

  promptHtml: '<p>Question text with rich HTML</p>',

  // MCQ only. Always four options.
  options: [
    { html: 'Option A rich HTML', correct: true },
    { html: 'Option B rich HTML', correct: false },
    { html: 'Option C rich HTML', correct: true },
    { html: 'Option D rich HTML', correct: false }
  ],

  // True/False only.
  trueAnswer: true,

  // FIB only. Supports multiple answer banks in one question.
  fibBanks: [
    { label: 'Blank 1', answers: ['0', 'zero'] },
    { label: 'Blank 2', answers: ['100', 'one hundred'] }
  ],

  // Short-answer only.
  shortAnswerHtml: '<p>Expected answer</p>',

  explanation: 'Teacher-facing explanation text',
  explanationUrl: 'https://example.com/explanation',
  skill: 'Listening',
  actfl_level: 'Novice',
  actfl_sublevel: 'Low',
  actfl_mode: 'Interpretive',

  // Optional language translations for question, answer, and explanation content.
  translations: {
    Hindi: {
      question: 'प्रश्न का अनुवाद',
      options: ['विकल्प का अनुवाद'],
      answer: 'उत्तर का अनुवाद',
      explanation: 'शिक्षक के लिए उत्तर की व्याख्या'
    }
  },

  authorUid: 'firebase-auth-uid',
  authorName: 'Teacher Name',
  createdAt: Timestamp,
  updatedAt: Timestamp,
  archivedAt: Timestamp
}
```

Notes:

- `explanation` stores optional teacher-facing plain text, separate from `shortAnswerHtml` (the model answer). The create/edit form supports explanations for every question type.
- `translations[language].explanation` stores the optional translated teacher-facing explanation as plain text. CSV import/export uses `translated_explanation`; the AI prompt requests Hindi explanations. Missing explanations are treated as empty.
- `promptHtml`, `options[].html`, and `shortAnswerHtml` can contain rich editor HTML for bold, italic, code blocks, inline images, equations, tables, and Mermaid diagram placeholders/rendered content.
- Inline images are stored inside the document as data URLs. Keep images small because Firestore documents have a 1 MiB size limit.
- New and edited questions store taxonomy reference IDs for class, subject, chapter, and topic. Legacy label fields are still read by the client as a fallback during migration.
- Homepage class selection is mandatory before displaying questions. Filter options come only from `qb_taxonomy_v1`; subjects appear after class selection, chapters after subject selection, and topics after chapter selection. Changing a parent clears its descendants.
- Client-side filtering uses taxonomy IDs, `difficulty`, and `type`.
- `sectionId` references a `classSections` document. `verified` records question verification.
- `skill` stores the LSRW skill. Supported admin filter/import values are `Listening`, `Speaking`, `Reading`, and `Writing`.
- `actfl_level` is optional and stores the proficiency level. Omit the CSV column or leave its cell blank when not applicable. Imports also treat `N/A`, `NA`, `None`, `null`, `not applicable`, and `-` as blank and normalize supported levels to their standard capitalization. Supported admin filter/import values are `Novice`, `Intermediate`, `Advanced`, `Superior`, and `Distinguished`. Level and sublevel are stored separately, for example `actfl_level: 'Novice'` and `actfl_sublevel: 'Low'`. Combined values such as `Novice Low` are rejected on import. Exports preserve the stored level and sublevel without conversion.
- `actfl_sublevel` stores `Low`, `Mid`, or `High`; leave blank for `Superior` or `Distinguished`.
- `actfl_mode` stores `Interpersonal`, `Interpretive`, or `Presentational`.

### `/qb_taxonomy_v1/{taxonomyId}`

Stores hierarchical class, subject, chapter, and topic terms. The client keeps one live snapshot of this collection and cascades filter dropdowns locally, avoiding a Firestore query for every parent selection.

Document shape:

```js
{
  type: 'class' | 'subject' | 'chapter' | 'topic',
  label: 'Polynomials',
  parentId: 'class_ix__subject_mathematics__chapter_algebra',
  classId: 'class_ix',
  subjectId: 'class_ix__subject_mathematics',
  chapterId: 'class_ix__subject_mathematics__chapter_algebra',
  topicId: 'class_ix__subject_mathematics__chapter_algebra__topic_polynomials',
  verified: true,
  updatedAt: Timestamp
}
```

Notes:

- Taxonomy document IDs are deterministic from the label and parent path.
- The question form saves the selected taxonomy document IDs without rewriting taxonomy documents. Creating a chapter or topic writes taxonomy separately. CSV import currently upserts the four taxonomy documents for each imported path and requires taxonomy write permission.
- Class documents use an empty `parentId`.
- `verified` records taxonomy term verification.

### `qb_reactions_v1`

Stores likes and dislikes for published questions.

Read access:

- Everyone can read reactions so public counts can be displayed.

Write access:

- Signed-in users can create or update only their own reaction.
- The document ID must be `${questionId}_${uid}`.

Document ID:

```text
{questionId}_{userId}
```

Document shape:

```js
{
  questionId: 'qb_questions_v1 document id',
  userId: 'firebase-auth-uid',
  value: 'like' | 'dislike',
  updatedAt: Timestamp
}
```

Notes:

- A user has at most one reaction per question.
- Updating the same document switches between `like` and `dislike`.

### `qb_lists_v1`

Stores private question lists for signed-in users, such as Favorites, FAQ, revision sets, or custom lists.

Read access:

- Only the list owner can read the list.

Write access:

- Only the list owner can create, update, archive, or unarchive the list.
- Lists are archived by setting `status` to `archived`; hard delete is disabled in the starter rules.

Document shape:

```js
{
  name: 'Favorites',
  ownerUid: 'firebase-auth-uid',
  status: 'active' | 'archived',
  questionIds: [
    'qb_questions_v1 document id'
  ],
  createdAt: Timestamp,
  updatedAt: Timestamp,
  archivedAt: Timestamp
}
```

Notes:

- Lists can contain published questions from any author.
- The app stores references as question document IDs, not embedded question snapshots.
- The app treats missing list `status` as active for legacy list documents.

## Local Browser Storage

Firestore stores shared question bank data. The browser also stores personal editor preferences:

- `qb_recent_formulas_v1` - recently inserted LaTeX formulas.
- `qb_custom_formulas_v1` - user-saved custom formulas.
- `qb_favorite_formulas_v1` - favorite formulas.

These values are local to the browser and are not synced through Firestore.

## Query Patterns

Homepage question queries execute only after Apply Filters or a pagination action (and refresh after mutations). Class selection is required. Taxonomy IDs, difficulty, type, exact `authorName`, visibility, and supported list membership filters are applied in Firestore. Questions use document-ID ordering and snapshot cursors with `limit(pageSize + 1)` to detect the next page. Page size options are 10, 20, 25, and 50; at most 50 questions are displayed. The extra document is a lookahead, not a displayed row. Previous pages reuse saved cursors.

The homepage does not subscribe to or download all questions. CSV export and bulk selection operate on the loaded page. Card/table view changes do not query Firestore. Reaction counts are loaded only for the page; reaction-count filters are hidden. Search matches the full author name exactly and is case-sensitive.

Visibility queries: Published uses `status == published`; My Questions uses the current author's UID and `status in [published, draft]`; My Archived uses the current author's UID and `status == archived`; Published + Mine uses a Firestore OR of published questions and the author's drafts.

List filters use `documentId() in` or `not-in` against IDs in selected list documents. Include supports up to 30 IDs (15 when combined with My Questions or Published + Mine); exclude supports up to 10 IDs and requires Published or My Archived visibility. Unsupported combinations display an error without client-side filtering. Larger list filtering requires a future membership data model change.

Other subscriptions remain taxonomy, the signed-in user's lists, and page-specific reactions.

## Suggested Indexes

Firestore may require composite indexes for combinations of taxonomy, visibility, author-name, and list filters. Query failures are displayed with the Firebase error and its index-creation link text; create required indexes in the Firebase console before retrying. No indexes are deployed automatically. If you later move more filtering into Firestore, useful composite indexes may include:

- `qb_questions_v1`: `status`, `classId`, `subjectId`, `updatedAt desc`
- `qb_questions_v1`: `status`, `type`, `difficulty`, `updatedAt desc`
- `qb_questions_v1`: `authorUid`, `updatedAt desc`
- `qb_lists_v1`: `ownerUid`, `updatedAt desc`

## Security Rules

See `firestore.rules` for a starter ruleset. It enforces:

- public read access only for published questions,
- author-only question create/update/archive,
- signed-in user-only reactions,
- private user-owned active and archived lists,
- no hard delete for questions.

## Shared-project rules deployment

`firestore.rules` includes the shared student, classroom, section, submission, and question-bank rules. The student-only rules previously denied all question and taxonomy writes. The merged rules restore Question Bank Studio's existing policy: public published-question and taxonomy reads, signed-in author-owned question creation and updates, signed-in taxonomy creation and updates, and per-user reactions. Student access to lists and submissions and classroom/section permissions are preserved. Question and taxonomy deletion remain denied.

Publish this complete rules file to the same Firebase project used by the app. Editing this repository does not change deployed Firebase rules. The question form does not require `sectionId` under these rules; classroom section validation remains separate.

### Comprehension creation

The new-question form atomically creates one `/qb_comprehensions_v1/{comprehensionId}` document and 2–100 standard questions. The passage document stores `passageHtml`, `authorUid`, `published`, `createdAt`, and `updatedAt`. Questions store only their own text in `promptHtml`, with `comprehensionId` referencing the passage and `comprehensionIndex` specifying their original order. No passage HTML is duplicated in question documents.

Editing any linked question exposes the shared passage. Saving atomically updates that question and the single passage document, so all linked questions display the edited passage when loaded. Question cards, tables, lists, and CSV exports resolve references before rendering. External quiz consumers must fetch `qb_comprehensions_v1/{question.comprehensionId}` and prepend `passageHtml` for display; they must not assume `promptHtml` contains the passage.

Passages are private to their author until a question is published. `published` is sticky after first publication so archiving or drafting one question does not break other published references. The passage author alone can edit it. Deploy the accompanying Firestore rules before using reference-based comprehensions.

Legacy questions containing `comprehensionPassageHtml` retain their embedded passage and render as before. Existing data is not migrated automatically.
