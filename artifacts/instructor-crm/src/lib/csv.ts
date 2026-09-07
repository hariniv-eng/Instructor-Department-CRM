// Client-side CSV export for the various people tables across the app
// (Instructors register, Overview drill-down, Darwin/TeachOS breakdown
// panels). Everything happens in the browser -- no export endpoint on the
// API server, no new dependency -- since these tables are already fully
// loaded client-side by the time a user wants to download them.

// A cell is quoted only when it needs to be (contains a comma, quote, or
// newline), with an embedded quote doubled -- standard RFC 4180 escaping.
function toCsvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers, ...rows].map((row) => row.map(toCsvCell).join(',')).join('\r\n');
}

// Triggers a browser download of the given CSV text via a throwaway
// <a download> link -- no server round-trip. A UTF-8 BOM is prepended so
// Excel (which otherwise guesses the system codepage) renders names with
// non-ASCII characters correctly; this mirrors the BOM-stripping the
// uploads page already does when *reading* a CSV back in.
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Shared filename convention: lowercase, non-alphanumerics collapsed to a
// single hyphen -- so a title like "Ops / Delivery Support" becomes
// "ops-delivery-support.csv" rather than containing a literal "/".
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
