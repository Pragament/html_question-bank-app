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
- `qb_taxonomy_v1` - class, subject, chapter, and topic hierarchy for metadata and cascading filters.

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

Use `Download CSV Template` in the AI prompt dialog to download examples for all four question types. Every column has a populated example, including Telugu translations and the new metadata fields; fields that do not apply to a question type stay blank. Replace `example_class_ix_section_a` with a real `classSections` document ID (or leave it blank), and replace or clear the example.com explanation URLs before importing. The sample rows use `verified=false` pending teacher review.

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
- `sectionId`, `verified`, `explanation`, `explanationUrl`
- `skill`, `actfl_level`, `actfl_sublevel`, `actfl_mode` (supported values are listed in `FIRESTORE_SCHEMA.md`)
- translation columns such as `language`, `translated_question`, and translated options

The AI prompt includes the new metadata columns. Imports validate supported skill and ACTFL values and store `verified` as a boolean (blank defaults to `false`). Older CSV files without metadata columns remain supported. Exports preserve these fields.

For FIB questions, multiple banks use this format:

```text
Blank 1:0|zero;Blank 2:100|one hundred
```

For MCQ questions, multiple correct answers use this format:

```text
A|C
```
