// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns, for every input {text, header}, exactly the answer csv-reader 1.0.0
// returns: {columns, rows, errors}. Same broken-row policy, same error codes,
// same line/row bookkeeping — only the scanning is different.
//
// Strategy (indexOf/slice scanner, no per-character loop in the hot path):
// - Whole-record fast path: a record with no '"' and no stray CR is one slice
//   plus String.split(','), instead of one function call per character.
// - Field-by-field slow path (only for records holding a quote or a CR):
//   unquoted fields jump with indexOf(',')/indexOf('\n')/indexOf('\r');
//   quoted fields jump to the closing quote with indexOf('"') and slice the
//   content directly when it holds no doubled quote, CR or LF.
// - Errors are only allocated when one actually occurs, and no object is
//   allocated per field: the field helpers report through out-parameters.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next. Deterministic: same input, same output, byte for byte.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Errors inside the record use these.
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and (for the unquoted
  // path) how many characters were kept.
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break. The field ends at the first ',' or '\n': a CR before it is
  // dropped (stray_cr), except a CR right before the LF that ends the
  // field, which is the CRLF that ends it. Reports through
  // fValue/fEnded/fAdded (fAdded counts the characters kept).
  function readUnquoted(value) {
    const ci = text.indexOf(',', pos);
    const ni = text.indexOf('\n', pos);
    let m;
    let ended;
    if (ci === -1) {
      if (ni === -1) { m = n; ended = END; }
      else { m = ni; ended = LINE_BREAK; }
    } else if (ni === -1) {
      m = ci;
      ended = COMMA;
    } else if (ci < ni) {
      m = ci;
      ended = COMMA;
    } else {
      m = ni;
      ended = LINE_BREAK;
    }
    let v = text.slice(pos, m);
    const ri = v.indexOf('\r');
    if (ri !== -1) {
      // Strip the CRs; each is a stray_cr except a trailing one before the
      // LF that ends the field (the CRLF).
      let clean = '';
      let start = 0;
      for (let i = ri; i < v.length; i++) {
        if (v.charCodeAt(i) === 13) {
          clean += v.slice(start, i);
          start = i + 1;
          if (!(ended === LINE_BREAK && i === v.length - 1)) pushError('stray_cr');
        }
      }
      clean += v.slice(start);
      v = clean;
    }
    if (ended === LINE_BREAK) line += 1;
    pos = ended === END ? n : m + 1;
    fValue = value === '' ? v : value + v;
    fEnded = ended;
    fAdded = v.length;
  }

  // Reads a quoted field whose opening quote is at pos. Reports through
  // fValue/fEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    // The closing quote: the next '"' that is not doubled.
    let q = text.indexOf('"', pos);
    while (q !== -1 && text.charCodeAt(q + 1) === 34) {
      q = text.indexOf('"', q + 2);
    }
    if (q === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      pushError('unterminated_quote');
      readUnquoted('"');
      return;
    }
    // The quoted content is text[pos..q). Fast when it holds no doubled
    // quote, CR or LF: a plain slice.
    let value;
    const firstQ = text.indexOf('"', pos);
    const firstR = text.indexOf('\r', pos);
    const firstN = text.indexOf('\n', pos);
    if ((firstQ === -1 || firstQ >= q) && (firstR === -1 || firstR >= q) && (firstN === -1 || firstN >= q)) {
      value = text.slice(pos, q);
    } else {
      // Escapes and line breaks inside: "" is one quote, each CRLF or lone
      // CR is one LF, each LF is one LF. Every line break counts once.
      let v = '';
      let i = pos;
      while (i < q) {
        const c = text.charCodeAt(i);
        if (c === 34) {
          v += '"';
          i += 2;
        } else if (c === 13) {
          v += '\n';
          line += 1;
          i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
        } else if (c === 10) {
          v += '\n';
          line += 1;
          i += 1;
        } else {
          let m = q;
          const j1 = text.indexOf('"', i);
          if (j1 !== -1 && j1 < m) m = j1;
          const j2 = text.indexOf('\r', i);
          if (j2 !== -1 && j2 < m) m = j2;
          const j3 = text.indexOf('\n', i);
          if (j3 !== -1 && j3 < m) m = j3;
          v += text.slice(i, m);
          i = m;
        }
      }
      value = v;
    }
    pos = q + 1;
    if (pos >= n) {
      fValue = value;
      fEnded = END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fValue = value;
      fEnded = COMMA;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fValue = value;
      fEnded = LINE_BREAK;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value;
      fEnded = LINE_BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    readUnquoted(value);
    if (fAdded > 0) pushError('quote_junk');
  }

  // Finishes a record's fields: the single-empty-unquoted-field rule, the
  // width, the header, and the short/long-row padding and cutting.
  // `quoted` is the last field's quoted flag (only read when one field).
  function finishRecord(fields, quoted) {
    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the whole record is plain when it holds no quote and no
    // stray CR before its line break (a CR right before the LF is the
    // CRLF that ends it). One slice plus split(',').
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? n : nl;
    const fq = text.indexOf('"', pos);
    const fr = text.indexOf('\r', pos);
    if ((fq === -1 || fq >= end) && (fr === -1 || fr >= end || (nl !== -1 && fr === end - 1))) {
      const spanEnd = nl !== -1 && end > pos && text.charCodeAt(end - 1) === 13 ? end - 1 : end;
      const fields = text.slice(pos, spanEnd).split(',');
      finishRecord(fields, false);
      pos = nl === -1 ? n : nl + 1;
      line += 1;
      continue;
    }

    // Slow path: field by field.
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === COMMA);
    finishRecord(fields, quoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
