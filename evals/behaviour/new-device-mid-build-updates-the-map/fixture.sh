#!/usr/bin/env bash
# A reading library planned for a laptop browser, with its brief and journey map recorded.
set -euo pipefail
git init -q .
mkdir -p .engineering/super-outer src
cat > .engineering/super-outer/product-brief.md <<'MD'
---
schema: super-outer-product-brief/1
kind: personal reading library with search
daily_users: 1
launch_spike: false
updated: 2026-11-01
---

# Product brief: Library

## Facts
| Fact | Value | Status |
|---|---|---|
| Who uses it | The owner, reading and searching their own books | decided 2026-11-01 |
| Device | A laptop browser | decided 2026-11-01 |
| Most common action | Search across the books and open a passage | decided 2026-11-01 |
| Must never go wrong | A book that was uploaded cannot be found again | decided 2026-11-01 |

## Journey
| Phase for Asha, the owner | What happens | What she can do here, and how she can tell | Where she could get stuck, or what could break | Data it creates, and who can see it | What the product needs | When |
|---|---|---|---|---|---|---|
| First use | Uploads PDF books from her laptop | Drop a file on the page. A row appears with the title and "Ready to search" | A scanned PDF has no text to search | The book file and its text: Asha | Upload, and text taken out of PDF files | Launch |
| Main use | Searches a phrase and opens the passage | Type in the search box. Matching passages list under it with the book title | A long book takes minutes before it can be searched | Search words: Asha | Search across every book | Launch |
| Comes back | Opens the library the next day on the same laptop | Her books are listed as she left them | Nothing | None new | The list of books | Launch |

## Stack
PDF text is taken out with one PDF parsing library, chosen for PDF files on a laptop upload.
MD
cat > src/parse.js <<'JS'
// Takes the text out of an uploaded PDF so it can be searched.
export async function parse(file, pdfParser) {
  return pdfParser.extractText(file);
}
JS
git add -A && git -c user.email=eval@example.com -c user.name=eval commit -qm "fixture"
