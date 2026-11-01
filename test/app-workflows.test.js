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
  assert.equal(vm.runInContext(`canAccessPage('finance')`,context),false);

  vm.runInContext(`AUTH.profile={id:'tier-2',access_tier:2};`,context);
  assert.equal(vm.runInContext(`canAccessPage('dashboard')`,context),true);
  assert.equal(vm.runInContext(`canAccessPage('cases')`,context),true);
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

test('Jarves turns short incident keywords into grounded case drafts in selectable styles',()=>{
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
  assert.match(detailed,/NOCH ZU PRÜFEN/);
  assert.match(formal,/AKTENNOTIZ/);
  assert.doesNotMatch(concise,/NOCH ZU PRÜFEN/);
  assert.match(appSource,/setTimeout\(\(\)=>setBootStep\(1,[\s\S]*?\),1650\)/);
  assert.match(appSource,/setTimeout\(\(\)=>setBootStep\(2,[\s\S]*?\),3300\)/);
  assert.match(appSource,/},5000\)/);
  assert.match(appSource,/function jarvesUseDraft\(\)/);
});
