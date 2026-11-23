import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pages/RenewalsPanel.tsx', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const style = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
test('renewals UI CSS is imported in bundled entry', () => {
  assert.match(entry, /import '\.\/styles\.css';/);
  assert.match(style, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(style, /grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(style, /grid-template-columns: 1fr;/);
});
test('renewals UI provides search, status, frequency, sort, KPI shortcuts and clear', () => {
  for (const term of ['renewal-kpi', 'renewal-search', 'renewal-select-wrap', 'renewal-filter-chips', 'renewal-empty', 'clearFilters', 'chooseMetric']) {
    assert.ok(source.includes(term), `Missing ${term}`);
  }
});
test('renewals list requests current company scope instead of an unscoped list', () => {
  assert.match(source, /params:\{companyId:company\}/);
});
