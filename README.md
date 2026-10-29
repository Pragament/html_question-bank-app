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

## Manual MCQ paper editor

Open `question-paper.html` (or **MCQ Paper Editor** in the bank header). Select class and subject, optionally date and identifier, then write MCQs or reuse published questions. A list name is generated automatically. Use the bank list's **Edit MCQ paper** link to reopen an existing MCQ-only list.

The editor supports shared comprehension passages, checkbox answer keys, all-correct/any-correct scoring, optional collapsed metadata and translations, a single rich-text toolbar, per-paper and per-question option layouts, question/option reordering, randomization, and saving another paper set. Question and passage authors retain content edit rights. Lists store question IDs and presentation settings.

Download CSV, an answer-key CSV, or a DOCX question paper with adjustable 8–20 pt text and 1–4 page columns. Downloads use current form content; saving to Firebase is separate. Use **Keyboard shortcuts** in the editor to see mouse-free controls. New questions default to draft.

Core regression tests: `node --test tests/*.test.cjs`. See `FIRESTORE_SCHEMA.md` for paper fields, bank picker indexes, and integration details for external quiz consumers.

Browser regression (with Playwright installed and the server running at port 8000): `node tests/paper-browser.cjs`. Firebase calls are mocked so it never writes live data. Optional environment variables: `PAPER_TEST_URL`, `PAPER_TEST_OUTPUT`, `PLAYWRIGHT_MODULE`, and `PLAYWRIGHT_EXECUTABLE`.

AI-generated CSV supports inline LaTeX `\( ... \)`, display LaTeX `\[ ... \]`, and Mermaid source enclosed in `[mermaid] ... [/mermaid]` in question, MCQ option, and short-answer cells. The importer converts notation markers and the Markdown data images below into math/diagram content; arbitrary HTML remains escaped. The prompt requests notation only when it helps the topic and preserves the CSV column structure.

The Prompt Builder's diagram radio buttons select Mermaid, Base64 image, or SVG image. CSV accepts Mermaid markers and Markdown data images such as `![Diagram](data:image/png;base64,...)` or `![Diagram](data:image/svg+xml,PERCENT_ENCODED_SVG)`. SVG Markdown images are sanitized before rendering. Raw HTML `<img>` and `<svg>` are displayed as escaped text, not rendered. The selected image format is requested only when appropriate; the prompt forbids fabricated image bytes or placeholder base64.


## Shared rich authoring tools

`rich-authoring.js` and `rich-authoring.css` provide shared insertion tools for the MCQ paper editor and the bank's new/edit question dialog. The bank dialog uses one sticky toolbar for questions, options, passages, and text fields. Paste PNG/JPEG/GIF/WebP images directly into an editable area; asynchronous reads keep the original cursor destination. Other authors' read-only questions remain protected.

**Equation** opens searchable formula categories with favorites, recent/saved equations, a MathLive visual field synchronized with LaTeX, and a live KaTeX preview. **Diagram** opens Mermaid templates, code editing, previews, zoom/fit, and saved diagrams; insertion produces a PNG so existing DOCX export can include it. **Table / Markdown** opens Toast UI with Markdown and WYSIWYG modes for headings, lists, tables, code, and formatted content. **Image** supports upload or URL insertion. Use Ctrl/Command+Enter to insert from the shared dialog, or Escape to cancel. In plain text fields the tools insert text/Markdown equivalents.

MathLive 0.101.1 and Toast UI 3.2.2 load on demand from their CDNs. Formulas, favorites, and diagram templates are stored locally; no backend schema changes are required. `node tests/rich-authoring-browser.cjs` checks real editor libraries with mocked Firebase. It supports the same Playwright/runtime environment variables as the paper browser regression.


Both shared toolbars include **Image Library**, which reads `qb_image_crop_library_v1` saved by `image-utility.html` on the same browser origin. Search saved crops, choose one, optionally edit its description, and insert the current processed image at the saved cursor. The picker provides an Image Utility link and a refresh button, and refreshes when another tab changes the library. It does not alter saved library images.

The AI Prompt Builder optionally requests matching PNG/JPEG question-paper pages alongside the CSV, with answers kept off the student paper. “Set all question types to 0” resets every count; zero excludes a type and blank means Auto. All-zero counts request only a CSV header, with no blank image pages.
