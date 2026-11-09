const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
const schema = fs.readFileSync(require.resolve('../supabase_schema.sql'), 'utf8');

function createAppContext(){
  const context=vm.createContext({
    window:{addEventListener(){}},
    document:{},
    location:{hash:'',search:'',pathname:'/',origin:'http://localhost'},
    crypto:webcrypto,
    console
  });
  vm.runInContext(appSource,context,{timeout:5000});
  return context;
}

test('parallel changes to separate case fields and history entries are merged',()=>{
  const context=createAppContext();
  const base={cases:[{id:'case-1',description:'Original',processFields:{subject:'Alt',incident:'Alt'},history:[]}]};
  const local={cases:[{id:'case-1',description:'Original',processFields:{subject:'Lokal',incident:'Alt'},history:[{id:'local-event',action:'created'}]}]};
  const remote={cases:[{id:'case-1',description:'Original',processFields:{subject:'Alt',incident:'Remote'},history:[{id:'remote-event',action:'reviewed'}]}]};
  const result=JSON.parse(JSON.stringify(vm.runInContext(`mergeState(${JSON.stringify(base)},${JSON.stringify(local)},${JSON.stringify(remote)})`,context)));
  assert.equal(result.cases[0].processFields.subject,'Lokal');
  assert.equal(result.cases[0].processFields.incident,'Remote');
  assert.deepEqual(result.cases[0].history.map(item=>item.id).sort(),['local-event','remote-event']);
});

test('Tier 2 process creation always awaits Tier 3 review and Tier 3 creation is direct',()=>{
  const context=createAppContext();
  vm.runInContext(`AUTH.profile={id:'tier-2',display_name:'Tier 2',access_tier:2};`,context);
  const tier2=JSON.parse(JSON.stringify(vm.runInContext(`makeProcessWorkflow('D1')`,context)));
  assert.equal(tier2.ownerTier,3);
  assert.equal(tier2.requiredApprovalTier,3);
  assert.equal(tier2.approvalStatus,'Tier-3-Prüfung ausstehend');
  vm.runInContext(`AUTH.profile={id:'tier-3',display_name:'Tier 3',access_tier:3};`,context);
  const tier3=JSON.parse(JSON.stringify(vm.runInContext(`makeProcessWorkflow('D1')`,context)));
  assert.equal(tier3.ownerTier,0);
  assert.equal(tier3.approvalStatus,'Freigegeben');
  assert.equal(tier3.history.length,1);
});

test('driver license numbers are unique four-digit random values',()=>{
  const context=createAppContext();
  vm.runInContext(`DB.drivers=[{licenseNo:'1234'},{licenseNo:'ZFC-LIC-123'}];`,context);
  const number=vm.runInContext('nextLicenseNo()',context);
  assert.match(number,/^\d{4}$/);
  assert.notEqual(number,'1234');
});

test('Tier 2 cannot start Tier 3-only processes, and process link requests require review',()=>{
  const context=createAppContext();
  vm.runInContext(`AUTH.profile={id:'tier-2',display_name:'Tier 2',access_tier:2};`,context);
  assert.equal(vm.runInContext(`canStartProcess('D1')`,context),true);
  assert.equal(vm.runInContext(`canStartProcess('D9')`,context),false);
  assert.match(schema,/Eine Prozessanfrage darf nur einmalig durch Tier 2 an Tier 3 vorgelegt werden/);
  assert.match(schema,/Ein neuer Prozess darf erst nach der Bestätigung durch Tier 3 aktiviert werden/);
});

test('Tier 2 can view Tier 1 areas and Tier 3 can view every registered area',()=>{
  const context=createAppContext();
  vm.runInContext(`AUTH.profile={id:'tier-1',access_tier:1};`,context);
  assert.equal(vm.runInContext(`canAccessPage('dashboard')`,context),true);
  assert.equal(vm.runInContext(`canAccessPage('archive')`,context),false);
  assert.equal(vm.runInContext(`canAccessPage('finance')`,context),false);

  vm.runInContext(`AUTH.profile={id:'tier-2',access_tier:2};`,context);
  assert.equal(vm.runInContext(`canAccessPage('dashboard')`,context),true);
  assert.equal(vm.runInContext(`canAccessPage('cases')`,context),true);
  assert.equal(vm.runInContext(`canAccessPage('archive')`,context),true);
  assert.equal(vm.runInContext(`canAccessPage('finance')`,context),false);
  assert.equal(vm.runInContext(`canAccessPage('tier-office-t3')`,context),false);

  vm.runInContext(`AUTH.profile={id:'tier-3',access_tier:3};`,context);
  assert.equal(vm.runInContext(`Object.keys(PAGE_TIERS).every(canAccessPage)`,context),true);
});

test('Tier 3 HR profile includes staff lifecycle, checklists, training, and review workflows',()=>{
  const context=createAppContext();
  vm.runInContext(`AUTH.profile={id:'reviewer',access_tier:3};HR.loaded=true;HR.profiles=[{id:'employee-1',display_name:'Racing Steward',email:'staff@example.test',position:'Steward',access_tier:1,created_at:'2026-01-01'}];HR.staffRecords=[];HR.reviews=[];HR.training=[];HR.activity=[];`,context);
  const page=vm.runInContext(`pageHR('employee-1')`,context);
  for(const section of ['Staff-Stammdaten','Onboarding-Checkliste','Schulungen &amp; Nachweise','Check-in / Gespräch dokumentieren','Offboarding']) {
    assert.ok(page.includes(section),`HR page should expose ${section}`);
  }
  assert.match(page,/id="hr_employment_status"/);
  assert.match(page,/saveHRStaffRecord/);
  assert.match(page,/saveHRTraining/);
  assert.match(page,/saveHRReview/);
});

test('HR data schema is tier-3-only and supports realtime synchronization',()=>{
  for(const table of ['zfc_hr_staff_records','zfc_hr_reviews','zfc_hr_training']) {
    assert.match(schema,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(schema,new RegExp(`create policy ${table}_tier3_all[\\s\\S]*?public\\.zfc_current_tier\\(\\) >= 3`));
    assert.match(schema,new RegExp(`tablename='${table}'`));
  }
  assert.match(schema,/create or replace function public\.zfc_hr_activity_summary\(\)[\s\S]*?if public\.zfc_current_tier\(\) < 3 then/);
  assert.match(schema,/create trigger zfc_stamp_hr_review/);
});

test('Driver classification has been removed from application code and navigation',()=>{
  const index=fs.readFileSync(require.resolve('../index.html'),'utf8');
  const styles=fs.readFileSync(require.resolve('../styles.css'),'utf8');
  assert.doesNotMatch(appSource,/function pageDriverClassification|Driver Classification|Klassifizierung/i);
  assert.match(appSource,/function normalizeRoute\(page,id\)[\s\S]*?page==='driver-classification'[\s\S]*?return \{page:'dashboard',id:null\}/);
  assert.doesNotMatch(appSource,/label:\s*['"][^'"]*classification/i);
  assert.doesNotMatch(index,/classification|driver-classification/i);
  assert.doesNotMatch(styles,/classification|driver-classification/i);
  assert.doesNotMatch(schema,/classification|driver-classification/i);
  const retirementMigration=fs.readFileSync(require.resolve('../supabase/migrations/20261109030000_disable_driver_classification.sql'),'utf8');
  assert.match(retirementMigration,/revoke all on public\.zfc_driver_classifications/);
  assert.match(retirementMigration,/preserving its historical data/);
});

test('Removed driver classification URL redirects to dashboard without changing driver data',()=>{
  const context=createAppContext();
  vm.runInContext(`AUTH.profile={id:'tier-3',access_tier:3};render=()=>{};window.scrollTo=()=>{};DB.drivers=[{id:'driver-1',firstName:'Test',lastName:'Driver'}];go('driver-classification');`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('ROUTE',context))),{page:'dashboard',id:null});
  assert.equal(vm.runInContext('location.hash',context),'#dashboard');
  assert.equal(vm.runInContext('DB.drivers.length',context),1);
});

test('Authenticated account badge exposes the top-right sign-out action',()=>{
  const context=createAppContext();
  vm.runInContext(`AUTH.profile={id:'user-1',display_name:'Steward',position:'Race Director',access_tier:3};const badgeElement={innerHTML:''};document.getElementById=()=>badgeElement;renderAccountBadge();`,context);
  const badge=vm.runInContext(`badgeElement.innerHTML`,context);
  assert.match(badge,/class="btn account-session-action"/);
  assert.match(badge,/onclick="logout\(\)">Abmelden/);
});

test('Case financial assessments are isolated and restricted to Tier 2 and Tier 3',()=>{
  const migration=fs.readFileSync(require.resolve('../supabase/migrations/20261109000000_driver_classification_and_case_financial_assessments.sql'),'utf8');
  assert.match(schema,/create table if not exists public\.zfc_case_financial_assessments/);
  assert.match(schema,/create policy zfc_case_financial_assessments_tier2_all[\s\S]*?public\.zfc_current_tier\(\) >= 2/);
  assert.match(schema,/grant select, insert, update on public\.zfc_case_financial_assessments to authenticated/);
  assert.match(migration,/create table if not exists public\.zfc_case_financial_assessments/);

  const context=createAppContext();
  vm.runInContext(`AUTH.profile={id:'tier-1',access_tier:1};let accessMessage='';showAccessNotice=message=>{accessMessage=message;};`,context);
  vm.runInContext(`saveCaseFinancialAssessment('case-1')`,context);
  assert.match(vm.runInContext('accessMessage',context),/nur von Tier 2 und Tier 3/);
});

test('Archive submission is direct and final archive or deletion is Tier-3-only',async()=>{
  const context=createAppContext();
  const caseData={id:'case-archive-1',stw:'STW-1',event:'GP Test',category:'Kontakt',status:'Entschieden',archiveWorkflow:{status:'submitted',history:[]}};
  vm.runInContext(`DB.cases=[${JSON.stringify(caseData)}];DB.caseActivityLog=[];DB.deletedCaseLog=[];AUTH.profile={id:'tier-2',display_name:'Tier 2',access_tier:2};`,context);
  const archiveHtml=vm.runInContext('pageArchive()',context);
  assert.match(archiveHtml,/STW-1/);
  assert.match(archiveHtml,/Zur Archivierung eingereicht/);

  vm.runInContext(`const table={};document.getElementById=id=>id==='saveToast'||id==='saveToastMessage'?null:table[id]||(table[id]={value:'',innerHTML:''});renderCaseTable();`,context);
  assert.match(vm.runInContext(`document.getElementById('caseTableWrap').innerHTML`,context),/Keine Akten gefunden/);

  const tier2Panel=vm.runInContext(`archiveActionPanel(DB.cases[0])`,context);
  assert.match(tier2Panel,/Endgültiger Abschluss durch Tier 3/);
  assert.doesNotMatch(tier2Panel,/Endgültig archivieren/);
  vm.runInContext(`window.prompt=()=> 'Abschluss geprüft';let accessMessage='';showAccessNotice=message=>{accessMessage=message;};persistCaseMutation=async()=>true;addCaseActivity=()=>{};go=()=>{};`,context);
  await vm.runInContext(`finalizeCaseArchive('case-archive-1')`,context);
  assert.match(vm.runInContext('accessMessage',context),/Nur Tier 3 darf/);

  vm.runInContext(`AUTH.profile={id:'tier-3',display_name:'Tier 3',access_tier:3};`,context);
  assert.match(vm.runInContext(`archiveActionPanel(DB.cases[0])`,context),/Endgültig archivieren/);
  await vm.runInContext(`finalizeCaseArchive('case-archive-1')`,context);
  assert.equal(vm.runInContext(`DB.cases[0].archiveWorkflow.status`,context),'archived');
  assert.equal(vm.runInContext(`DB.cases[0].archiveWorkflow.archivedByTier`,context),3);
  assert.match(vm.runInContext(`archiveActionPanel(DB.cases[0])`,context),/Akte endgültig löschen/);
  vm.runInContext(`AUTH.profile={id:'tier-2',display_name:'Tier 2',access_tier:2};`,context);
  assert.doesNotMatch(vm.runInContext(`archiveActionPanel(DB.cases[0])`,context),/onclick="deleteCase/);
  assert.match(vm.runInContext(`pageCaseForm(DB.cases[0])`,context),/Direkter Archivabschluss/);

  const caseForm=vm.runInContext(`pageCaseForm({id:'active',status:'Offen',history:[]})`,context);
  assert.match(caseForm,/Akte schliessen &amp; zum Archiv einsenden/);
  const archiveMigration=fs.readFileSync(require.resolve('../supabase/migrations/20261109020000_direct_case_archive_tier3.sql'),'utf8');
  assert.match(archiveMigration,/Eine Akte kann nur einmalig durch Tier 2 oder Tier 3 eingereicht werden/);
  assert.match(archiveMigration,/Die endgültige Archivierung ist ausschließlich Tier 3 vorbehalten/);
  assert.match(archiveMigration,/archivierte Akten darf nur Tier 3 endgültig löschen/);
  assert.match(schema,/zfc_reject_retired_a1_process/);
  assert.match(schema,/Endgültig archivierte Akten sind unveränderlich/);
});

test('Tier-3 document and case deletion RPCs exist in the schema and upgrade migration',()=>{
  const migration=fs.readFileSync(require.resolve('../supabase/migrations/20261109040000_case_document_deletion_rpc.sql'),'utf8');
  for(const sql of [schema,migration]){
    assert.match(sql,/create or replace function public\.zfc_delete_case_documents\(p_case_id text default null, p_document_id uuid default null\)/);
    assert.match(sql,/public\.zfc_current_tier\(\) < 3/);
    assert.match(sql,/delete from public\.zfc_case_document_events doc_event[\s\S]*?delete from public\.zfc_case_documents doc/);
    assert.match(sql,/grant execute on function public\.zfc_delete_case_documents\(text, uuid\) to authenticated/);
    assert.match(sql,/create or replace function public\.zfc_delete_case\(p_case_id text\)[\s\S]*?deletedCaseLog[\s\S]*?grant execute on function public\.zfc_delete_case\(text\) to authenticated/);
  }
  const deleteCaseSource=appSource.slice(appSource.indexOf('async function deleteCase('),appSource.indexOf('\nfunction addCaseActivity',appSource.indexOf('async function deleteCase(')));
  assert.match(deleteCaseSource,/rpc\('zfc_delete_case'/);
  assert.doesNotMatch(deleteCaseSource,/persist\.cases\(\)|persist\.deletedCaseLog\(\)/);
});

test('Archive submission refreshes the server status and does not resubmit an already submitted case',async()=>{
  const context=createAppContext();
  const submitted={id:'case-archive-2',description:'Committed case',archiveWorkflow:{status:'submitted',history:[]}};
  vm.runInContext(`
    window.localStorage={setItem(){}};
    AUTH.profile={id:'tier-2',access_tier:2};
    DB.cases=[{id:'case-archive-2',description:'Stale local case'}];
    let archiveRoute=null;
    go=(page,id)=>{archiveRoute={page,id};};
    SUPABASE.client={
      from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{state:{cases:${JSON.stringify([submitted])}}},error:null})})})})
    };
  `,context);
  await vm.runInContext(`closeCaseAndSendToArchive('case-archive-2')`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('archiveRoute',context))),{page:'archive',id:'case-archive-2'});
  assert.equal(vm.runInContext('DB.cases[0].archiveWorkflow.status',context),'submitted');
});

test('App-state synchronization preserves submitted case fields while allowing archive workflow updates',()=>{
  const context=createAppContext();
  const remote={cases:[{
    id:'case-archive-3',
    description:'Committed details',
    archiveWorkflow:{status:'submitted',history:[]},
    activeProcessCodes:[]
  }]};
  const proposed={cases:[{
    id:'case-archive-3',
    description:'Stale client edit',
    archiveWorkflow:{status:'submitted',a1Status:'active',history:[{action:'a1_assigned'}]},
    activeProcessCodes:['A1'],
    activeProcessHistory:[{processCode:'A1'}]
  }]};
  const result=JSON.parse(JSON.stringify(vm.runInContext(
    `protectSubmittedArchiveCases(${JSON.stringify(proposed)},${JSON.stringify(remote)})`,context
  )));
  assert.equal(result.cases[0].description,'Committed details');
  assert.equal(result.cases[0].archiveWorkflow.a1Status,'active');
  assert.deepEqual(result.cases[0].activeProcessCodes,['A1']);
});

test('Jarves expands short keywords into grounded long drafts with document and style options',()=>{
  const context=createAppContext();
  const draft={
    event:'Monaco GP',sessionType:'Rennen',incidentLap:'Runde 12',category:'Kollision',
    driverInvolved:'driver-a',driverAffected:'driver-b',evidenceLink:'Replay 00:31',
    regulationBreach:'Verursachen von Kollisionen'
  };
  vm.runInContext(`DB.drivers=[{id:'driver-a',firstName:'Alex',lastName:'Racer'},{id:'driver-b',firstName:'Sam',lastName:'Pilot'}];`,context);
  const detailed=vm.runInContext(`jarvesProfessionalText('T4 · Kontakt · Gegner neben Strecke · Position behalten',${JSON.stringify(draft)},'detailed')`,context);
  const formal=vm.runInContext(`jarvesProfessionalText('T4 · Kontakt',${JSON.stringify(draft)},'formal')`,context);
  const concise=vm.runInContext(`jarvesProfessionalText('T4 · Kontakt',${JSON.stringify(draft)},'concise')`,context);
  assert.match(detailed,/Monaco GP/);
  assert.match(detailed,/Runde 12/);
  assert.match(detailed,/Alex Racer und Sam Pilot/);
  assert.match(detailed,/Kurve 4/);
  assert.match(detailed,/Kontakt/);
  assert.match(detailed,/Replay 00:31/);
  assert.match(detailed,/NOCH ZU ERGÄNZEN/);
  assert.ok(detailed.length>=1800,`comprehensive draft should be substantial; got ${detailed.length} characters`);
  assert.match(formal,/AKTENNOTIZ/);
  assert.match(formal,/SACHVERHALTSBERICHT/);
  assert.match(formal,/Als Eingangsschilderung/);
  assert.doesNotMatch(concise,/NOCH ZU ERGÄNZEN/);
  const hearing=vm.runInContext(`jarvesProfessionalText('T4 · Kontakt',${JSON.stringify({...draft,hearingHeld:true})},{documentType:'hearing',length:'standard',style:'plain'})`,context);
  const evidence=vm.runInContext(`jarvesProfessionalText('T4 · Kontakt',${JSON.stringify(draft)},{documentType:'evidence',length:'standard'})`,context);
  const handover=vm.runInContext(`jarvesProfessionalText('T4 · Kontakt',${JSON.stringify(draft)},{documentType:'handover',length:'standard'})`,context);
  assert.match(hearing,/GESPRÄCHSVERMERK/);
  assert.match(hearing,/Anhörung als durchgeführt/);
  assert.match(hearing,/Gemeldet wurde:/);
  assert.match(evidence,/BEWEISMITTELVERMERK/);
  assert.match(handover,/ÜBERGABEAUFTRAG/);
  assert.match(appSource,/setTimeout\(\(\)=>setBootStep\(1,[\s\S]*?\),1650\)/);
  assert.match(appSource,/setTimeout\(\(\)=>setBootStep\(2,[\s\S]*?\),3300\)/);
  assert.match(appSource,/},5000\)/);
  assert.match(appSource,/function jarvesUseDraft\(\)/);
  for(const optionId of ['jarves_document_type','jarves_length','jarves_style','jarves_perspective']) {
    assert.match(appSource,new RegExp(`id="${optionId}"`));
  }
});
