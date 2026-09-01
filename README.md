# Question Bank Studio

An independent Firebase-backed question bank app for creating, publishing, filtering, importing, exporting, reacting to, and organizing reusable school questions.

## Files

- `index.html` - static app shell and dialogs.
- `styles.css` - responsive layout for phone, tablet, and desktop.
- `app.js` - Firebase Auth, Firestore, rich editor, question CRUD, CSV import/export, reactions, and lists.
- `firestore.rules` - starter rules for the prefixed Firestore collections.
- `FIRESTORE_SCHEMA.md` - Firestore collection, field, query, and rules documentation.

## Firestore Collections

All collections are prefixed with `qb_` to keep this app distinct from existing collections:

- `qb_questions_v1` - question records.
- `qb_reactions_v1` - one like/dislike record per user per question.
- `qb_lists_v1` - private user-owned question lists.

See `FIRESTORE_SCHEMA.md` for the full schema.

## Question Types

- `mcq` - four options, with one or more correct answers.
- `true_false` - true/false answer.
- `fib` - fill-in-the-blank, with multiple answer banks per question.
- `short_answer` - rich short-answer content.

## Run Locally

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/question-bank-app/
```

The app loads Firebase, KaTeX, and Mermaid from CDNs, so internet access is required.

## Firebase Setup

The app uses Google login with the Firebase config in `app.js`.

Before production use:

- Enable Google as a Firebase Auth provider.
- Add your local/deployed domain to Firebase Auth authorized domains.
- Publish security rules based on `firestore.rules`.
- Confirm Firestore is enabled in the Firebase project.

## CSV Import

Use the in-app `Templates` button to download the CSV template.

Important columns:

- `type`
- `class`
- `subject`
- `chapter`
- `topic`
- `difficulty`
- `question`
- `option_a` through `option_d`
- `correct_options`
- `true_false_answer`
- `fib_banks`
- `short_answer`
- translation columns such as `language`, `translated_question`, and translated options

For FIB questions, multiple banks use this format:

```text
Blank 1:0|zero;Blank 2:100|one hundred
```

For MCQ questions, multiple correct answers use this format:

```text
A|C
```
