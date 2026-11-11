# Application Data

- `questions.json` is the question bank consumed by the frontend.
- `question-bank-info.json` contains question-bank summary metadata.
- The app loads questions from `./data/questions.json` relative to the website root.
- Keep subject keys normalized: `biology`, `chemistry`, `physics`, `english`, `gk`.
- Preserve source and year metadata; do not label original practice questions as authentic previous-year questions.
