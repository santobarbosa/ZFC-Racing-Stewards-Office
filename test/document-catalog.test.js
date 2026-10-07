const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  ADDITIONAL_DOCUMENT_EVENTS,
  ADDITIONAL_DOCUMENT_TYPES,
  ALL_DOCUMENT_TYPES,
  BASE_DOCUMENT_TYPES,
  DOCUMENT_GROUPS,
  DOCUMENT_PROCESS_MATRIX,
  EARLY_CLOSURE_REQUIREMENTS
} = require('../document-catalog');

const schema = fs.readFileSync(require.resolve('../supabase_schema.sql'), 'utf8');

test('every listed process has exactly five required documents', () => {
  assert.equal(Object.keys(DOCUMENT_PROCESS_MATRIX).length, 30);
  for (const [processCode, documents] of Object.entries(DOCUMENT_PROCESS_MATRIX)) {
    assert.equal(documents.length, 5, `${processCode} must define five documents`);
    for (const title of documents) {
      assert.ok(ALL_DOCUMENT_TYPES.some(type => type.processCode === processCode && type.title === title));
    }
  }
});

test('catalog contains distinct guided forms for the required report types', () => {
  const byTitle = title => BASE_DOCUMENT_TYPES.find(type => type[0] === title);
  assert.equal(byTitle('Sachverhaltsbericht')[4], 'facts');
  assert.equal(byTitle('Analysebericht')[4], 'analysis');
  assert.equal(byTitle('Gesprächsvermerk')[4], 'conversation');
  assert.equal(byTitle('Verbindliche Entscheidung')[4], 'decision');
  for (const title of ['Sachverhaltsbericht', 'Analysebericht', 'Gesprächsvermerk', 'Verbindliche Entscheidung']) {
    const type = ALL_DOCUMENT_TYPES.find(item => item.title === title);
    assert.ok(type.fields.length >= 8, `${title} must have its dedicated required fields`);
  }
  assert.ok(byTitle('Sachverhaltsbericht')[3].includes('Bewertung / Einordnung'));
});

test('all types have help text, fields, valid groups, and server-matching approval flags', () => {
  const approvalRule = /(entscheidung|freigabe|beschluss|unabhangig|unabhaengig|prufauftrag|pruefauftrag|freigegeben|freigegebene|abschlussfreigabe|offentliche-entscheidungsfassung|oeffentliche-entscheidungsfassung)/;
  assert.equal(ALL_DOCUMENT_TYPES.length, 191);
  for (const type of ALL_DOCUMENT_TYPES) {
    assert.ok(DOCUMENT_GROUPS.includes(type.group), `${type.key} has an unknown group`);
    assert.ok(type.description.trim(), `${type.key} has no purpose text`);
    assert.ok(type.fields.length > 0, `${type.key} has no required fields`);
    assert.equal(type.requiresApproval, approvalRule.test(type.key), `${type.key} disagrees with server approval rule`);
  }
});

test('SQL catalog contains every UI document type and the review function follows its table', () => {
  const sqlSlug = value => value.toLowerCase()
    .replace(/[äöü]/g, character => ({ä:'a',ö:'o',ü:'u'})[character])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  for (const [prefix, types] of [['general', BASE_DOCUMENT_TYPES], ['additional', ADDITIONAL_DOCUMENT_TYPES]]) {
    for (const item of types) {
      const title = Array.isArray(item) ? item[0] : item.title;
      assert.ok(schema.includes(`('${prefix}','${title}')`), `${prefix} catalog omits ${title}`);
      assert.equal(`${prefix}-${sqlSlug(title)}`, ALL_DOCUMENT_TYPES.find(type => type.title === title && type.key.startsWith(`${prefix}-`)).key);
    }
  }
  for (const type of ALL_DOCUMENT_TYPES.filter(item => item.processCode)) {
    assert.ok(schema.includes(`('${type.processCode}', array[`), `SQL process matrix omits ${type.processCode}`);
    assert.ok(schema.includes(`'${type.title}'`), `SQL process requirements omit ${type.title}`);
    assert.equal(`process-${type.processCode}-${type.requirementIndex}-${sqlSlug(type.title)}`, type.key);
  }
  assert.ok(schema.indexOf('create table if not exists public.zfc_case_documents')
    < schema.indexOf('create or replace function public.zfc_case_document_can_review'));
});

test('early closure uses its own five real-document tasks', () => {
  assert.deepEqual(EARLY_CLOSURE_REQUIREMENTS, [
    'Eingangsformular beziehungsweise Antrag',
    'Voraussetzungen- und Vollständigkeitsprüfung',
    'Sachstands- und Unterlagenvermerk',
    'Freigegebene Einstellungs-, Ablehnungs- oder Zusammenführungsentscheidung',
    'Mitteilungs- und Abschlussvermerk'
  ]);
  for (const title of EARLY_CLOSURE_REQUIREMENTS) {
    assert.ok(ALL_DOCUMENT_TYPES.some(type => type.title === title));
  }
  for (const event of ADDITIONAL_DOCUMENT_EVENTS) {
    assert.ok(ALL_DOCUMENT_TYPES.some(type => type.title === event.document), `${event.event} references a missing ${event.document} type`);
  }
});
