# CsvReader — a faster reader for broken CSV files

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/fiqirealme52-max/CsvReader/rank.svg)](https://make.fun)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/fiqirealme52-max/CsvReader/reward.svg)](https://make.fun)

A drop-in replacement for `csv-reader` 1.0.0 that returns exactly the same
answers — same columns, rows and errors — but reads the files much faster.

## How it stays exact

It reproduces the reference reader's broken-row policy, character for
character:

- a UTF-8 BOM at the very start is dropped;
- records end at LF or CRLF; empty lines are no records;
- a CR outside quotes that is not followed by LF is dropped (`stray_cr`);
- a field that opens with `"` runs to the next non-doubled quote (`""` is one
  quote; CRLF and lone CR inside quotes read as LF); text after the closing
  quote, up to the next comma or line break, is appended as-is (`quote_junk`
  when anything is kept);
- a quote that never closes is a literal character and the text after it is
  re-read as unquoted (`unterminated_quote`);
- a quote inside an unquoted field is literal;
- fields stay strings, never trimmed or converted;
- rows are padded with `""` (`short_row`) or cut (`long_row`) to the first
  record's width; a line that held only stray CRs is no record;
- every error carries `{code, line, row}` in the order it was met, with
  `line` the 1-based line the record starts on and `row` the record's index
  in `rows` (null for the header).

## How it gets faster

The reference reader walks the text one character at a time and builds every
field with string concatenation. This reader scans with `indexOf` and `slice`
instead:

- **Whole-record fast path.** A record with no quote and no stray CR is one
  slice plus `String.split(',')` — no per-field work at all.
- **Field-by-field jumps.** Unquoted fields jump from delimiter to delimiter
  with `indexOf(',')` / `indexOf('\n')` / `indexOf('\r')`; quoted fields jump
  to the closing quote with `indexOf('"')` and slice the content directly
  when it holds no doubled quote, CR or LF.
- **Errors only when they happen.** No error objects are allocated for the
  ~97% of records that are clean; the slow escape/newline pass runs only on
  the quoted fields that actually need it.

## Layout

- `solve.js` — the reader. `run(input)` takes `{text, header}` and returns
  `{columns, rows, errors}`. Dependency-free ES module, no state kept from
  one call to the next.
- `main.ts` — the driver: reads `/input/cases.json`, answers each case with
  `run`, writes `/output/answers.json`. (Same shape as the house driver,
  including `--no-incremental-marking`.)
- `package.json` — `{"type": "module"}`.

## Entry

Built for the make.fun bounty
[Read broken CSV files faster, 21 November 2026](https://make.fun/c/csv-reader-speed-01-run-20261121).
