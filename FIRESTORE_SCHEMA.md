# Firestore Schema

This app uses prefixed collections so it can share the Firebase project with other apps without colliding with existing data.

## Collections

### `qb_questions_v1`

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
  className: 'IX',
  subject: 'Mathematics',
  chapter: 'Algebra',
  topic: 'Polynomials',
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Very Hard',
  status: 'published' | 'draft' | 'archived',

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

  // Optional language translations for question and answer content.
  translations: {
    hi: {
      question: 'Translated question',
      answer: 'Translated answer',
      options: ['Translated A', 'Translated B', 'Translated C', 'Translated D']
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

- `promptHtml`, `options[].html`, and `shortAnswerHtml` can contain rich editor HTML for bold, italic, code blocks, inline images, equations, tables, and Mermaid diagram placeholders/rendered content.
- Inline images are stored inside the document as data URLs. Keep images small because Firestore documents have a 1 MiB size limit.
- Client-side filtering uses `className`, `subject`, `chapter`, `topic`, `difficulty`, and `type`.

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

- Only the list owner can create, update, or delete the list.

Document shape:

```js
{
  name: 'Favorites',
  ownerUid: 'firebase-auth-uid',
  questionIds: [
    'qb_questions_v1 document id'
  ],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Notes:

- Lists can contain published questions from any author.
- The app stores references as question document IDs, not embedded question snapshots.

## Local Browser Storage

Firestore stores shared question bank data. The browser also stores personal editor preferences:

- `qb_recent_formulas_v1` - recently inserted LaTeX formulas.
- `qb_custom_formulas_v1` - user-saved custom formulas.
- `qb_favorite_formulas_v1` - favorite formulas.

These values are local to the browser and are not synced through Firestore.

## Query Patterns

Current app subscriptions:

- Anonymous users:
  - `qb_questions_v1 where status == "published"`
- Signed-in users:
  - `qb_questions_v1 where status == "published"`
  - `qb_questions_v1 where authorUid == currentUser.uid`
  - `qb_lists_v1 where ownerUid == currentUser.uid`
- Reactions:
  - `qb_reactions_v1 where questionId in [visible question ids]`

The app sorts question and list results by `updatedAt` on the client.

## Suggested Indexes

The current implementation avoids compound ordered queries for easier setup. If you later move more filtering into Firestore, useful composite indexes may include:

- `qb_questions_v1`: `status`, `className`, `subject`, `updatedAt desc`
- `qb_questions_v1`: `status`, `type`, `difficulty`, `updatedAt desc`
- `qb_questions_v1`: `authorUid`, `updatedAt desc`
- `qb_lists_v1`: `ownerUid`, `updatedAt desc`

## Security Rules

See `firestore.rules` for a starter ruleset. It enforces:

- public read access only for published questions,
- author-only question create/update/archive,
- signed-in user-only reactions,
- private user-owned lists,
- no hard delete for questions.
