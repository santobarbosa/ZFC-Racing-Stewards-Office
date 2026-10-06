/* ============================= DATA LAYER ============================= */
// Supabase-Verbindung hier eintragen (Project Settings > API):
// Nur den anon/public-Key verwenden, niemals den service_role-Key.
const SUPABASE_CONFIG = {
  url: 'https://ktvcwyrsayoggjiapnln.supabase.co', // Project URL, z. B. https://xxxx.supabase.co
  anonKey: 'sb_publishable_EEM214FLVj0CA3hkPq4BCg_1dFAZmvr' // anon/public key
};
const DB = { teams: [], drivers: [], cases: [], transfers: [], finance: [], financeSettings: null, esportSetups: [], marketRequests: [], escalations: [], caseActivityLog: [], deletedCaseLog: [] };
const KEYS = { teams:'zfc_teams_v1', drivers:'zfc_drivers_v1', cases:'zfc_cases_v1', transfers:'zfc_transfers_v1', finance:'zfc_finance_v1', financeSettings:'zfc_finance_settings_v1', esportSetups:'zfc_esport_setups_v1', marketRequests:'zfc_market_requests_v1', escalations:'zfc_escalations_v1', caseActivityLog:'zfc_case_activity_log_v1', deletedCaseLog:'zfc_deleted_case_log_v1', supabase:'zfc_supabase_config_v1' };
let SUPABASE = { client:null, channel:null, applyingRemote:false, status:'Nicht verbunden', baseState:null };
let AUTH = { session:null, profile:null, authSubscription:null };
let syncQueue = Promise.resolve();

function uid(){ return (crypto.randomUUID? crypto.randomUUID() : 'id-'+Date.now()+'-'+Math.random().toString(16).slice(2)); }
function esc(s){ return (s===undefined||s===null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function nl2br(s){ return esc(s).replace(/\n/g,'<br>'); }
function fmtDate(d){ if(!d) return '—'; try{ const dt=new Date(d+'T00:00:00'); return dt.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}); }catch(e){return d;} }
function fmtDateTime(ts){ if(!ts) return '—'; const dt=new Date(ts); return dt.toLocaleDateString('de-DE')+' '+dt.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}); }
function today(){ return new Date().toISOString().slice(0,10); }

function defaultTeams(){
  return [
    {id:'redbull',name:'Red Bull Racing',color:'#1E41FF',country:'Österreich'},
    {id:'ferrari',name:'Ferrari',color:'#E8002D',country:'Italien'},
    {id:'mercedes',name:'Mercedes',color:'#00D7B6',country:'Deutschland'},
    {id:'mclaren',name:'McLaren',color:'#FF8000',country:'Vereinigtes Königreich'},
    {id:'astonmartin',name:'Aston Martin',color:'#00594F',country:'Vereinigtes Königreich'},
    {id:'alpine',name:'Alpine',color:'#2173B8',country:'Frankreich'},
    {id:'haas',name:'Haas',color:'#E6E6E6',country:'USA'},
    {id:'williams',name:'Williams',color:'#00A3E0',country:'Vereinigtes Königreich'},
    {id:'racingbulls',name:'Racing Bulls',color:'#6C98FF',country:'Italien'},
    {id:'audi',name:'Audi',color:'#BB0A30',country:'Deutschland'},
    {id:'cadillac',name:'Cadillac',color:'#8A8D8F',country:'USA'},
  ];
}
const TEAM_LOGOS = {
  redbull:'https://cdn.simpleicons.org/redbull/ffffff',
  ferrari:'https://cdn.simpleicons.org/ferrari/ffffff',
  mercedes:'https://upload.wikimedia.org/wikipedia/commons/f/fa/Mercedes-Benz_AMG_Petronas_Formula_One_Team_Logo_Wheelsology.JPG',
  mclaren:'https://cdn.simpleicons.org/mclaren/ffffff',
  astonmartin:'https://cdn.simpleicons.org/astonmartin/ffffff',
  alpine:'https://upload.wikimedia.org/wikipedia/commons/7/7e/Alpine_F1_Team_Logo.svg',
  haas:'https://upload.wikimedia.org/wikipedia/commons/0/08/Haas_F1_Team_logo_2019.svg',
  williams:'https://upload.wikimedia.org/wikipedia/commons/8/8d/Williams_Racing_Logo_2024.webp',
  racingbulls:'https://www.visacashapprb.com/favicon.ico',
  audi:'https://cdn.simpleicons.org/audi/ffffff',
  cadillac:'https://cdn.simpleicons.org/cadillac/ffffff'
};
function teamInitials(team){
  return String(team?.name||'Team').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();
}
function teamLogo(team){ return TEAM_LOGOS[team?.id]||''; }
function openFinanceTeam(teamId, button){
  if(button){
    button.querySelector('.team-logo')?.classList.add('is-opening');
    setTimeout(()=>go('finance',teamId),420);
  }else go('finance',teamId);
}
const DRIVER_SUGGESTIONS = {
  redbull:['Max Verstappen','Isack Hadjar'], ferrari:['Charles Leclerc','Lewis Hamilton'],
  mercedes:['George Russell','Kimi Antonelli'], mclaren:['Lando Norris','Oscar Piastri'],
  astonmartin:['Fernando Alonso','Lance Stroll'], alpine:['Pierre Gasly','Franco Colapinto'],
  haas:['Oliver Bearman','Esteban Ocon'], williams:['Alex Albon','Carlos Sainz'],
  racingbulls:['Liam Lawson','Arvid Lindblad'], audi:['Nico Hülkenberg','Gabriel Bortoleto'],
  cadillac:['Valtteri Bottas','Sergio Pérez'],
};

const CATEGORIES = [
  "Kollision zwischen Fahrern","Gefährliches oder gefährdendes Fahren",
  "Verlassen der Strecke und dauerhafter Vorteil","Missachtung von Flaggen (Blau/Gelb/Rot)",
  "Missachtung von Anweisungen der Rennleitung","Blockieren im Qualifying",
  "Unsportliches Verhalten","Boxenstopp-Vergehen (Unsafe Release / Speeding)",
  "Startvergehen (Jump Start / Formation Lap)","Verstoß gegen Parc-Fermé-Bedingungen",
  "Technisches Reglementvergehen","Verstoß gegen das Sportliche Reglement (allgemein)",
  "Verhalten unter Safety Car / Virtual Safety Car","Sonstiger Vorfall"
];
const WARNING_CATEGORIES = [
  'Unnötiges Verteidigen ohne realistische Chance','Zu spätes Erkennen eines Überholmanövers','Fehlende Übersicht im Zweikampf','Angriff ohne ausreichende Überlappung','Überoptimistischer Bremspunkt','Überstürztes Zurückerobern einer Position','Nichtbeachten des Fahrzeugabstands','Unklare Linienwahl im Verkehr','Unnötiger Spurwechsel auf der Geraden','Fehlerhafte Priorisierung von Risiko und Vorteil','Nichtbeachten des besseren Kurvenausganges','Zu aggressives Einlenken neben einem Fahrzeug','Mangelhafte Vorbereitung eines Überholversuchs','Fehlende Anpassung an Reifen und Fahrzeugzustand','Ignorieren einer erkennbaren Gefahrensituation','Unnötiges Beschleunigen in eine unsichere Lücke','Fehlende Geduld hinter einem langsameren Fahrzeug','Falsche Einschätzung der Kurvengeschwindigkeit','Nichtbeachten des toten Winkels','Unnötiges Abdrängen im Positionskampf','Fehlende Reaktion auf einen Fehler des Gegners','Unkontrollierter Angriff nach dem Bremspunkt','Vermeidbares Fahren auf der falschen Linie','Mangelnde Beurteilung der Verkehrsdichte','Unnötige Reaktion auf einen Positionsverlust','Fehlende Rücksicht nach einem Fahrfehler','Nichtbeachten der Rennphase','Unnötige Provokation im Zweikampf','Fehlende Kommunikation bei Team- oder Verkehrssituation','Wiederholter Mangel an Rennintelligenz'
];
const WARNING_TEXT = 'Der Fahrer zeigte in der beschriebenen Situation einen vermeidbaren Mangel an Rennintelligenz. Die Positionen, Abstände, verfügbare Fahrbahn und das Risiko des Manövers wurden nicht ausreichend bewertet. Eine kontrollierte, vorausschauende und für alle Beteiligten sichere Entscheidung wäre möglich gewesen. Der Fahrer wird aufgefordert, vergleichbare Situationen künftig mit größerer Übersicht, Geduld und angemessener Risikoabwägung zu beurteilen.';
const DECISIONS = [
  "Keine weitere Untersuchung erforderlich","Fall untersucht – keine Strafe",
  "Mündliche Verwarnung","Schriftliche Verwarnung (Reprimand)",
  "Zeitstrafe 5 Sekunden","Zeitstrafe 10 Sekunden","Zeitstrafe 20 Sekunden",
  "Durchfahrtsstrafe (Drive-Through)","Stop-and-Go-Strafe (10s)",
  "Startplatzversetzung","Streichung der Rundenzeit(en)",
  "Disqualifikation (DSQ)","Rennsperre","Sonstige Maßnahme"
];
const LICENSE_AFTER = ["Bleibt uneingeschränkt aktiv","Aktiv, Verwarnung vermerkt","Vorübergehend ausgesetzt","Entzogen"];
const SESSION_TYPES = ["Training","Qualifying","Sprint-Qualifying","Sprint","Rennen","Sonstige Session"];
const CASE_STATUS = ["Neu","Offen","In Untersuchung","Entschieden","Archiviert"];
const REPORTED_BY = ["Rennleitung","Steward-Beobachtung","Fahrer-Meldung (Protest)","Team-Meldung","Video-Beweis / Marshalling-System"];
const EVENTS = ["Bahrain","Saudi-Arabien","Australien","Japan","China","Miami","Emilia-Romagna","Monaco","Kanada","Spanien","Österreich","Großbritannien","Belgien","Ungarn","Niederlande","Italien","Aserbaidschan","Singapur","USA (Austin)","Mexiko","Brasilien","Las Vegas","Katar","Abu Dhabi"];
const PLATFORMS = ["PlayStation","Xbox","PC"];
const DIVISIONS = ["Division 1","Division 2","Division 3"];
const LICENSE_CLASS = ["F1 26"];

function loadKey(key, fallback){
  try{
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  }catch(e){
    console.error('load failed', key, e);
    return fallback;
  }
}
function saveKey(key, value){
  try{ window.localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch(e){ console.error('save failed', key, e); alert('Speichern fehlgeschlagen — bitte erneut versuchen.'); return false; }
}
function loadAll(){
  DB.teams = loadKey(KEYS.teams, null);
  if(!DB.teams){ DB.teams = defaultTeams(); saveKey(KEYS.teams, DB.teams); }
  DB.drivers = loadKey(KEYS.drivers, []);
  DB.cases = loadKey(KEYS.cases, []);
  DB.transfers = loadKey(KEYS.transfers, []);
  DB.finance = loadKey(KEYS.finance, []);
  DB.financeSettings = loadKey(KEYS.financeSettings, {season:'2026', startingCapital:0, currency:'EUR', discordWebhookUrl:'', caseWebhookUrl:''});
  DB.esportSetups = loadKey(KEYS.esportSetups, []);
  DB.marketRequests = loadKey(KEYS.marketRequests, []);
  DB.escalations = loadKey(KEYS.escalations, []);
  DB.caseActivityLog = loadKey(KEYS.caseActivityLog, []);
  DB.deletedCaseLog = loadKey(KEYS.deletedCaseLog, []);
}
const persist = {
  teams: ()=>{ saveKey(KEYS.teams, DB.teams); return syncAppState(); },
  drivers: ()=>{ saveKey(KEYS.drivers, DB.drivers); return syncAppState(); },
  cases: ()=>{ saveKey(KEYS.cases, DB.cases); return syncAppState(); },
  transfers: ()=>{ saveKey(KEYS.transfers, DB.transfers); return syncAppState(); },
  finance: ()=>{ saveKey(KEYS.finance, DB.finance); return syncAppState(); },
  financeSettings: ()=>{ saveKey(KEYS.financeSettings, DB.financeSettings); return syncAppState(); },
  esportSetups: ()=>{ saveKey(KEYS.esportSetups, DB.esportSetups); return syncAppState(); },
  marketRequests: ()=>{ saveKey(KEYS.marketRequests, DB.marketRequests); return syncAppState(); },
  escalations: ()=>{ saveKey(KEYS.escalations, DB.escalations); return syncTierEscalations(); },
  caseActivityLog: ()=>{ saveKey(KEYS.caseActivityLog, DB.caseActivityLog); return syncAppState(); },
  deletedCaseLog: ()=>{ saveKey(KEYS.deletedCaseLog, DB.deletedCaseLog); return syncAppState(); },
};
async function syncTierEscalations(){
  if(!SUPABASE.client) return;
  const rows=DB.escalations.map(item=>({id:item.id,case_id:item.caseId||null,target_tier:Number(item.targetTier||3),data:item,updated_at:new Date().toISOString()}));
  if(!rows.length) return;
  const result=await SUPABASE.client.from('zfc_tier_escalations').upsert(rows);
  if(result.error){ SUPABASE.status='Eskalierung konnte nicht synchronisiert werden'; console.warn('Tier-Eskalierungen konnten nicht gespeichert werden',result.error); }
}

function financeAmount(value){ return Number(value||0).toLocaleString('de-DE',{style:'currency',currency:DB.financeSettings?.currency||'EUR'}); }
function financeForTeam(teamId){ return DB.finance.filter(t=>!teamId || !t.teamId || t.teamId===teamId); }
function financeBalance(teamId){ return Number(DB.financeSettings?.startingCapital||0) + financeForTeam(teamId).filter(t=>t.status==='Gebucht').reduce((sum,t)=>sum+(t.type==='income'?1:-1)*Number(t.amount||0),0); }
function financeIncome(teamId){ return financeForTeam(teamId).filter(t=>t.type==='income'&&t.status==='Gebucht').reduce((sum,t)=>sum+Number(t.amount||0),0); }
function financeExpense(teamId){ return financeForTeam(teamId).filter(t=>t.type==='expense'&&t.status==='Gebucht').reduce((sum,t)=>sum+Number(t.amount||0),0); }
function supabaseConfig(){
  const saved=loadKey(KEYS.supabase, {url:'', anonKey:''});
  return {
    url:SUPABASE_CONFIG.url.trim() || saved.url || '',
    anonKey:SUPABASE_CONFIG.anonKey.trim() || saved.anonKey || ''
  };
}
function readSupabaseConfigFromUrl(){
  const params=new URLSearchParams(location.search), url=params.get('sb_url'), anonKey=params.get('sb_key');
  if(!url || !anonKey) return;
  saveKey(KEYS.supabase,{url,anonKey});
  history.replaceState(null,'',location.pathname+location.hash);
}
function publicShareUrl(){
  const config=supabaseConfig();
  if(!config.url || !config.anonKey) return '';
  return location.origin+location.pathname+'?sb_url='+encodeURIComponent(config.url)+'&sb_key='+encodeURIComponent(config.anonKey)+'#dashboard';
}
function appState(){ return {teams:DB.teams,drivers:DB.drivers,cases:DB.cases,transfers:DB.transfers,esportSetups:DB.esportSetups,marketRequests:DB.marketRequests,caseActivityLog:DB.caseActivityLog,deletedCaseLog:DB.deletedCaseLog}; }
function cloneState(state){ return state ? JSON.parse(JSON.stringify(state)) : null; }
function sameState(left,right){ return JSON.stringify(left)===JSON.stringify(right); }
function mergeState(base,local,remote){
  if(!base) return cloneState(local||remote||{});
  const merged={};
  const keys=new Set([...Object.keys(base||{}),...Object.keys(local||{}),...Object.keys(remote||{})]);
  keys.forEach(key=>{
    const baseValue=base[key], localValue=local?.[key], remoteValue=remote?.[key];
    if(sameState(localValue,baseValue)){ merged[key]=cloneState(remoteValue); return; }
    if(sameState(remoteValue,baseValue)||sameState(localValue,remoteValue)){ merged[key]=cloneState(localValue); return; }
    if(Array.isArray(localValue)&&Array.isArray(remoteValue)){
      const baseItems=Array.isArray(baseValue)?baseValue:[];
      const byId=list=>new Map(list.filter(item=>item&&item.id).map(item=>[item.id,item]));
      const baseItemsById=byId(baseItems), localItemsById=byId(localValue), remoteItemsById=byId(remoteValue);
      const ids=new Set([...baseItemsById.keys(),...localItemsById.keys(),...remoteItemsById.keys()]);
      merged[key]=[...ids].map(id=>{
        const baseItem=baseItemsById.get(id), localItem=localItemsById.get(id), remoteItem=remoteItemsById.get(id);
        if(sameState(localItem,baseItem)) return remoteItem;
        if(sameState(remoteItem,baseItem)||sameState(localItem,remoteItem)) return localItem;
        if(localItem===undefined && remoteItem!==undefined) return remoteItem;
        if(remoteItem===undefined && localItem!==undefined) return localItem;
        return localItem;
      }).filter(Boolean);
      return;
    }
    merged[key]=cloneState(localValue);
  });
  return merged;
}
function applyRemoteState(state){
  if(!state || typeof state!=='object') return;
  Object.assign(DB,state);
  DB.teams=Array.isArray(DB.teams)?DB.teams:[];
  DB.drivers=Array.isArray(DB.drivers)?DB.drivers:[];
  DB.cases=Array.isArray(DB.cases)?DB.cases:[];
  DB.transfers=Array.isArray(DB.transfers)?DB.transfers:[];
  DB.finance=Array.isArray(DB.finance)?DB.finance:[];
  DB.esportSetups=Array.isArray(DB.esportSetups)?DB.esportSetups:[];
  DB.marketRequests=Array.isArray(DB.marketRequests)?DB.marketRequests:[];
  DB.escalations=Array.isArray(DB.escalations)?DB.escalations:[];
  DB.caseActivityLog=Array.isArray(DB.caseActivityLog)?DB.caseActivityLog:[];
  DB.deletedCaseLog=Array.isArray(DB.deletedCaseLog)?DB.deletedCaseLog:[];
  Object.keys(DB).forEach(key=>{ if(KEYS[key]) saveKey(KEYS[key],DB[key]); });
}
function stateRecordCount(state){ return ['drivers','cases','transfers','finance','marketRequests','escalations'].reduce((count,key)=>count+(Array.isArray(state?.[key])?state[key].length:0),0); }
async function syncAppState(){
  if(!SUPABASE.client || SUPABASE.applyingRemote) return;
  syncQueue=syncQueue.then(async()=>{
    if(!SUPABASE.client || SUPABASE.applyingRemote) return;
    const latest=await SUPABASE.client.from('zfc_app_state').select('state').eq('id',1).maybeSingle();
    if(latest.error) throw latest.error;
    const localState=appState();
    const nextState=latest.data?.state ? mergeState(SUPABASE.baseState,localState,latest.data.state) : localState;
    SUPABASE.applyingRemote=true;
    applyRemoteState(nextState);
    SUPABASE.applyingRemote=false;
    const result=await SUPABASE.client.rpc('zfc_merge_app_state',{incoming_state:nextState});
    if(result.error){ SUPABASE.status='Synchronisierung fehlgeschlagen'; console.warn('Supabase-State konnte nicht synchronisiert werden',result.error); }
    else { applyRemoteState(result.data||nextState); SUPABASE.baseState=cloneState(result.data||nextState); }
  }).catch(error=>{
    SUPABASE.applyingRemote=false;
    SUPABASE.status='Synchronisierung fehlgeschlagen';
    console.warn('Supabase-State konnte nicht synchronisiert werden',error);
  });
  return syncQueue;
}
function fromSupabaseTransaction(t){ return {id:t.id, season:t.season, teamId:t.team_id||'', race:t.race, date:t.transaction_date, type:t.type, category:t.category, description:t.description, amount:Number(t.amount||0), counterparty:t.counterparty, status:t.status, createdAt:t.created_at, updatedAt:t.updated_at}; }
function setSupabaseStatus(status){
  SUPABASE.status=status;
  const el=document.getElementById('sb_status');
  if(el) el.textContent=status;
}
async function initSupabase(){
  const config = supabaseConfig();
  if(!config.url || !config.anonKey){
    setSupabaseStatus('Nicht konfiguriert');
    showLogin('Die Supabase-Verbindung ist nicht konfiguriert. Bitte Projekt-URL und Publishable-Key im Code prüfen.');
    return;
  }
  if(!window.supabase){
    setSupabaseStatus('Supabase-Client nicht geladen');
    showLogin('Der Supabase-Client konnte nicht geladen werden. Bitte Internetverbindung oder CDN-Freigabe prüfen.');
    return;
  }
  try{
    setSupabaseStatus('Verbinde …');
    if(SUPABASE.authSubscription) await SUPABASE.authSubscription.unsubscribe();
    if(SUPABASE.channel && SUPABASE.client) await SUPABASE.client.removeChannel(SUPABASE.channel);
    SUPABASE.client = window.supabase.createClient(config.url, config.anonKey);
    const authState=await SUPABASE.client.auth.getSession();
    if(authState.error) throw authState.error;
    if(!authState.data.session){ AUTH.session=null; AUTH.profile=null; showLogin(); return; }
    AUTH.session=authState.data.session;
    const profileResult=await SUPABASE.client.from('zfc_user_profiles').select('id,email,display_name,position,access_tier').eq('id',AUTH.session.user.id).single();
    if(profileResult.error){
      if(profileResult.error.code==='PGRST116'){
        throw new Error('Das Supabase-Konto ist angemeldet, aber das Benutzerprofil fehlt. Bitte das Supabase-Schema aus supabase_schema.sql ausführen.');
      }
      throw profileResult.error;
    }
    AUTH.profile=profileResult.data;
    if(new URLSearchParams(location.search).get('flow')==='set-password') ROUTE={page:'set-password',id:null};
    document.getElementById('loginScreen').style.display='none';
    renderAccountBadge();
    const authListener=SUPABASE.client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'){ AUTH.session=null; AUTH.profile=null; showLogin(); }
    });
    SUPABASE.authSubscription=authListener.data.subscription;
    const shared = await SUPABASE.client.from('zfc_app_state').select('state,updated_at').eq('id',1).maybeSingle();
    if(shared.error) throw shared.error;
    const remoteState=shared.data?.state;
    if(remoteState && Object.keys(remoteState).length){
      applyRemoteState(remoteState);
      SUPABASE.baseState=cloneState(remoteState);
    }else{
      await syncAppState();
      SUPABASE.baseState=cloneState(appState());
    }
    const tierEscalations=await SUPABASE.client.from('zfc_tier_escalations').select('id,target_tier,data,updated_at').order('updated_at',{ascending:false});
    if(tierEscalations.error) throw tierEscalations.error;
    DB.escalations=tierEscalations.data.map(row=>({...row.data,targetTier:row.target_tier}));
    saveKey(KEYS.escalations,DB.escalations);
    const settings = await SUPABASE.client.from('zfc_finance_settings').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle();
    if(settings.data){ DB.financeSettings={...DB.financeSettings,season:settings.data.season,startingCapital:Number(settings.data.starting_capital||0),currency:settings.data.currency||'EUR',discordWebhookUrl:settings.data.discord_webhook_url||'',caseWebhookUrl:settings.data.case_webhook_url||'',siteUrl:settings.data.site_url||DB.financeSettings.siteUrl}; persist.financeSettings(); }
    const transactions = await SUPABASE.client.from('zfc_finance_transactions').select('*').order('transaction_date',{ascending:false});
    if(!transactions.error) DB.finance = (transactions.data||[]).map(fromSupabaseTransaction);
    if(Number(AUTH.profile.access_tier)<3){
      DB.finance=[];
      DB.financeSettings={season:'2026',startingCapital:0,currency:'EUR',discordWebhookUrl:'',caseWebhookUrl:'',siteUrl:''};
      saveKey(KEYS.finance,DB.finance); saveKey(KEYS.financeSettings,DB.financeSettings);
    }
    SUPABASE.channel = SUPABASE.client.channel('zfc-racing-realtime')
      .on('postgres_changes',{event:'*',schema:'public',table:'zfc_app_state'}, payload=>{
        if(!payload.new?.state) return;
        const merged=mergeState(SUPABASE.baseState,appState(),payload.new.state);
        SUPABASE.applyingRemote=true; applyRemoteState(merged); SUPABASE.applyingRemote=false;
        SUPABASE.baseState=cloneState(merged);
        render();
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'zfc_finance_transactions'}, payload=>{
        const item=fromSupabaseTransaction(payload.new||payload.old);
        if(payload.eventType==='DELETE') DB.finance=DB.finance.filter(t=>t.id!==item.id);
        else { const index=DB.finance.findIndex(t=>t.id===item.id); if(index<0) DB.finance.push(item); else DB.finance[index]=item; }
        saveKey(KEYS.finance,DB.finance); if(ROUTE.page==='finance') render();
      }).on('postgres_changes',{event:'*',schema:'public',table:'zfc_finance_settings'}, payload=>{
        if(payload.new){ DB.financeSettings={...DB.financeSettings,season:payload.new.season,startingCapital:Number(payload.new.starting_capital||0),currency:payload.new.currency||'EUR',discordWebhookUrl:payload.new.discord_webhook_url||'',caseWebhookUrl:payload.new.case_webhook_url||'',siteUrl:payload.new.site_url||DB.financeSettings.siteUrl}; saveKey(KEYS.financeSettings,DB.financeSettings); if(ROUTE.page==='finance'||ROUTE.page==='manage') render(); }
      }).on('postgres_changes',{event:'*',schema:'public',table:'zfc_tier_escalations'}, payload=>{
        const row=payload.new||payload.old;
        if(!row?.id) return;
        if(payload.eventType==='DELETE') DB.escalations=DB.escalations.filter(item=>item.id!==row.id);
        else { const item={...row.data,targetTier:row.target_tier}; const index=DB.escalations.findIndex(entry=>entry.id===row.id); if(index<0) DB.escalations.push(item); else DB.escalations[index]=item; }
        saveKey(KEYS.escalations,DB.escalations);
        if(ROUTE.page==='tier-office'||ROUTE.page==='escalations') render();
      }).subscribe((status)=>{
        if(status==='SUBSCRIBED') setSupabaseStatus('Verbunden · Live-Sync aktiv');
        else if(status==='CHANNEL_ERROR') setSupabaseStatus('Fehler: Realtime nicht aktiv');
        else if(status==='TIMED_OUT') setSupabaseStatus('Zeitüberschreitung beim Realtime-Start');
      });
    setSupabaseStatus('Verbunden · Synchronisierung läuft');
    document.getElementById('loadingScreen').style.display='none';
    document.getElementById('shell').style.display='flex';
    render();
  }catch(error){
    SUPABASE.client=null;
    setSupabaseStatus('Verbindung fehlgeschlagen');
    showLogin(error.message||'Supabase-Verbindung fehlgeschlagen.');
    console.warn('Supabase nicht verfügbar',error);
  }
}
function showLogin(message=''){
  document.getElementById('shell').style.display='none';
  document.getElementById('loadingScreen').style.display='none';
  document.getElementById('loginMessage').textContent=message;
  document.getElementById('loginScreen').style.display='grid';
}
async function handleLogin(){
  const config=supabaseConfig();
  if(!config.url||!config.anonKey){ showLogin('Die Supabase-Projektkonfiguration fehlt im Code.'); return; }
  if(!window.supabase){ showLogin('Der Supabase-Client konnte nicht geladen werden. Bitte Internetverbindung oder CDN-Freigabe prüfen.'); return; }
  const button=document.querySelector('#loginScreen button[type="submit"]');
  if(button) button.disabled=true;
  try{
    const client=window.supabase.createClient(config.url,config.anonKey);
    const result=await client.auth.signInWithPassword({email:document.getElementById('loginEmail').value.trim(),password:document.getElementById('loginPassword').value});
    if(result.error) throw result.error;
    SUPABASE.client=client;
    await initSupabase();
  }catch(error){
    showLogin(error.message||'Die Anmeldung ist fehlgeschlagen.');
    console.warn('Supabase-Anmeldung fehlgeschlagen',error);
  }finally{
    if(button) button.disabled=false;
  }
}
async function logout(){ if(SUPABASE.client) await SUPABASE.client.auth.signOut(); }
function renderAccountBadge(){
  const badge=document.getElementById('accountBadge'); if(!badge||!AUTH.profile) return;
  badge.innerHTML=`<strong>${esc(AUTH.profile.display_name||AUTH.profile.email)}</strong><span>${esc(AUTH.profile.position||'Position offen')}</span><br><span class="account-tier">Tier ${Number(AUTH.profile.access_tier)}</span><br><button class="btn small" onclick="logout()">Abmelden</button>`;
}
async function syncFinanceTransaction(t){
  if(!SUPABASE.client) return;
  await SUPABASE.client.from('zfc_finance_transactions').upsert({id:t.id,season:t.season,team_id:t.teamId||null,race:t.race,transaction_date:t.date,type:t.type,category:t.category,description:t.description,amount:t.amount,counterparty:t.counterparty,status:t.status,updated_at:new Date().toISOString()});
}
async function sendFinanceDiscordNotification(transaction){
  const t=typeof transaction==='string'?DB.finance.find(item=>item.id===transaction):transaction;
  if(!t) return;
  const webhook=DB.financeSettings?.discordWebhookUrl, siteUrl=DB.financeSettings?.siteUrl||location.href.split('#')[0];
  if(!webhook || t.type!=='expense') return;
  const paymentUrl=siteUrl+'#finance-pay/'+encodeURIComponent(t.id);
  const team=teamById(t.teamId)?.name||'Liga gesamt';
  const invoiceEmbed={
    title:'RECHNUNG · ZAHLUNGSFREIGABE',
    description:'Eine neue Rennsport-Ausgabe wurde zur Prüfung und Zahlung eingereicht.',
    color:13209898,
    fields:[
      {name:'Betrag',value:`**${financeAmount(t.amount)}**`,inline:true},
      {name:'Status',value:t.status||'Geplant',inline:true},
      {name:'Team',value:team,inline:true},
      {name:'Rennen / Event',value:t.race||'—',inline:true},
      {name:'Kategorie',value:t.category||'Sonstiges',inline:true},
      {name:'Empfänger',value:t.counterparty||'—',inline:true},
      {name:'Leistungsbeschreibung',value:t.description||'Keine Beschreibung hinterlegt.',inline:false}
    ],
    footer:{text:'ZFC Racing Finance · Interne Zahlungsfreigabe'},
    timestamp:new Date().toISOString()
  };
  try{ const response=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'ZFC Racing Finance',content:'**Neue Rechnung zur Freigabe**',embeds:[invoiceEmbed],components:[{type:1,components:[{type:2,style:5,label:'Jetzt bezahlen',url:paymentUrl}]}]})}); if(!response.ok) throw new Error('HTTP '+response.status); alert('Rechnung wurde an Discord gesendet.'); }
  catch(error){ console.warn('Discord-Finanznachricht fehlgeschlagen',error); alert('Rechnung konnte nicht an Discord gesendet werden.'); }
}
async function sendCaseDiscordNotification(id){
  const c=DB.cases.find(item=>item.id===id), webhook=DB.financeSettings?.caseWebhookUrl;
  if(!c || !webhook){ alert('Bitte zuerst einen Discord-Webhook in Verwaltung → Integrationen speichern.'); return; }
  const team=teamById(c.teamInvolved), driver=driverById(c.driverInvolved);
  const sanction=`${c.decision||'Keine Entscheidung hinterlegt'}${c.penaltyPoints?`\n**Strafpunkte: ${c.penaltyPoints} / 12**`:''}${c.licenseStatusAfter?`\nLizenzstatus: ${c.licenseStatusAfter}`:''}`;
  const caseEmbed={
    title:`STEWARDS DECISION · ${c.stw||'AKTE'}`,
    description:'Offizielle Zusammenfassung einer Entscheidung der ZFC Racing Stewards.',
    color:c.status==='Entschieden'?13111342:14408667,
    fields:[
      {name:'EVENT / SESSION',value:`${c.event||'—'} · ${c.sessionType||'—'}`,inline:true},
      {name:'STATUS',value:c.status||'—',inline:true},
      {name:'RUNDE / ZEITPUNKT',value:c.incidentLap||'—',inline:true},
      {name:'BETROFFENES TEAM',value:team?.name||'—',inline:true},
      {name:'BETROFFENER FAHRER',value:`${driverName(driver)}${driver?.number?` (#${driver.number})`:''}`,inline:true},
      {name:'MELDUNG DURCH',value:c.reportedBy||'—',inline:true},
      {name:'SACHVERHALT',value:c.description||'Keine Beschreibung hinterlegt.',inline:false},
      {name:'REGELVERSTOSS',value:c.regulationBreach||'Kein Artikel angegeben.',inline:false},
      {name:'ENTSCHEIDUNG / STRAFE',value:sanction,inline:false},
      {name:'BEGRÜNDUNG',value:c.decisionDetail||'Keine Begründung hinterlegt.',inline:false},
      {name:'BEWEISMITTEL',value:c.evidenceLink||'Keine Beweismittel verlinkt.',inline:false}
    ],
    footer:{text:'ZFC Racing Stewards · Offizielle Aktenmitteilung'},
    timestamp:new Date().toISOString()
  };
  try{ const response=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'ZFC Racing Stewards',content:`**Steward-Akte ${c.stw||''} · Entscheidung veröffentlicht**`,embeds:[caseEmbed]})}); if(!response.ok) throw new Error('HTTP '+response.status); alert('Steward-Akte wurde an Discord gesendet.'); }
  catch(error){ alert('Die Steward-Akte konnte nicht an Discord gesendet werden.'); }
}

/* ---------- lookups ---------- */
function teamById(id){ return DB.teams.find(t=>t.id===id); }
function driverById(id){ return DB.drivers.find(d=>d.id===id); }
function driverName(d){ return d? (d.firstName+' '+d.lastName).trim() : '—'; }
function divisionBadge(d){
  const division=String(d?.division||'').trim();
  const match=division.match(/^(?:Division\s*)?([123])$/i);
  const code=match?`D${match[1]}`:'—';
  return `<span class="division-badge ${match?`d${match[1]}`:'unknown'}" title="${esc(division||'Keine Division')}" aria-label="${esc(division||'Keine Division')}">${code}</span>`;
}
function teamOptions(selected, includeNone, includeFreeDriver){
  let html = includeNone? `<option value="">— keine Angabe —</option>`:'';
  if(includeFreeDriver) html = `<option value="" ${selected?'':'selected'}>Free Driver — kein Team</option>` + html;
  DB.teams.forEach(t=> html += `<option value="${t.id}" ${t.id===selected?'selected':''}>${esc(t.name)}</option>`);
  return html;
}
function driverOptionsForTeam(teamId, selected, includeNone){
  let list = DB.drivers.filter(d=> !teamId || d.teamId===teamId);
  let html = includeNone!==false? `<option value="">— keine Angabe —</option>`:'';
  list.forEach(d=> html += `<option value="${d.id}" ${d.id===selected?'selected':''}>${esc(driverName(d))} ${d.number?('#'+esc(d.number)):''}</option>`);
  if(list.length===0) html += `<option value="" disabled>Keine Fahrer in diesem Team erfasst</option>`;
  return html;
}
function selectOptions(arr, selected){
  return arr.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
}
function casesForDriver(driverId){
  return DB.cases.filter(c=>c.driverInvolved===driverId || c.driverAffected===driverId)
    .sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));
}
function decidedCasesForDriver(driverId){
  return DB.cases.filter(c=>c.driverInvolved===driverId && (c.status==='Entschieden'||c.status==='Archiviert'));
}
function driverPenaltyPoints(driverId){
  return decidedCasesForDriver(driverId).reduce((sum,c)=> sum + (parseInt(c.penaltyPoints)||0), 0);
}
function transfersForDriver(driverId){
  return DB.transfers.filter(t=>t.driverId===driverId).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function nextStw(){
  const used = new Set(DB.cases.map(c=>String(c.stw||'').toUpperCase()));
  let number = 0;
  do{ number = Math.floor(100000 + Math.random()*900000); }while(used.has(`STW-${number}`));
  return `STW-${number}`;
}
function nextLicenseNo(){
  const nums = DB.drivers.filter(d=>d.licenseNo).map(d=>parseInt((d.licenseNo||'').split('-').pop())||0);
  const next = (nums.length? Math.max(...nums):0)+1;
  return `ZFC-LIC-${String(next).padStart(3,'0')}`;
}
function statusTagClass(s){
  return {Neu:'open',Offen:'open','In Untersuchung':'invest',Entschieden:'decided',Archiviert:'archived'}[s] || 'archived';
}
function licenseTagClass(s){
  return {'Aktiv':'active','Ausgesetzt':'suspended','Entzogen':'revoked','Nicht ausgestellt':'none'}[s] || 'none';
}

/* ============================= REGELWERK ============================= */
const RULEBOOK_SECTIONS = [
  {title:'Zweck und Geltungsbereich', text:'Das Reglement gilt für alle Fahrer, Teams und Sessions der CFC Esport Division. Es ist der verbindliche Bewertungsrahmen für die Stewards und gilt vom Erlöschen der Lichter bis zum offiziellen Ende der Rennsession.', points:['Nicht ausdrücklich geregelte Situationen werden nach Fairness, Kontrolle, Vermeidbarkeit und den Auswirkungen des Vorfalls bewertet.','Anweisungen der Rennleitung und der Stewards sind während der Session zu befolgen.']},
  {title:'Grundsatz des fairen Racing', text:'Racing muss kontrolliert, vorhersehbar und respektvoll bleiben. Jeder Fahrer trägt Verantwortung für sein Fahrzeug und muss die möglichen Folgen seines Manövers berücksichtigen.', points:['Absicht, Kontrolle, Vermeidbarkeit und Konsequenz werden gemeinsam bewertet.','Ein entstandener Schaden allein entscheidet nicht über die Schuldfrage.']},
  {title:'Strafsystem', text:'Das Strafsystem verbindet Strafpunkte mit Rennstrafen. Die konkrete Sanktion richtet sich nach Schwere, Auswirkung und Wiederholung des Verstoßes.', points:['3.1 Strafpunkte: Punkte werden nach Schwere und Verantwortung vergeben und können sich bis zur Lizenzprüfung summieren.','3.2 Mögliche Rennstrafen: Verwarnung, Zeitstrafe, Positionsverlust, Durchfahrtsstrafe, Stop-and-Go, Ausschluss oder Sperre.','3.3 Erschwerende und mildernde Faktoren: Absicht, Wiederholung, fehlende Kooperation und großer Schaden erschweren; sofortige Rückgabe eines Vorteils, Entschuldigung und besondere Umstände können mildern.']},
  {title:'Rennstart', text:'Beim Start muss jeder Fahrer seine Linie, Geschwindigkeit und den verfügbaren Raum kontrollieren. Die erste Phase des Rennens wird besonders aufmerksam bewertet.', points:['4.1 Verhalten beim Erlöschen der Lichter: Kein Frühstart, kein unkontrolliertes Beschleunigen und kein Spurwechsel in ein bereits belegtes Fahrzeug.','Der Fahrer muss innerhalb der Startposition und der vorgegebenen Startprozedur bleiben.']},
  {title:'Turn 1 und erste Rennphase', text:'In der ersten Kurve und den ersten Rennmomenten gelten erhöhte Anforderungen an Übersicht und Zurückhaltung.', points:['Späte, unrealistische Angriffe aus großer Distanz sind zu vermeiden.','Bei dichtem Verkehr muss jeder Fahrer mit eingeschränktem Raum und wechselnden Linien rechnen.','Ein vermeidbarer Unfall in der ersten Rennphase wird nicht pauschal als Rennunfall gewertet.']},
  {title:'Überholmanöver', text:'Ein Überholmanöver muss kontrolliert und realistisch eingeleitet werden. Der angreifende Fahrer trägt grundsätzlich die Verantwortung für den Angriff.', points:['6.1 Verantwortung des angreifenden Fahrers: Kein unkontrolliertes Hineinstürzen, kein erzwungener Kontakt und kein Verdrängen von der Strecke.','6.2 Anspruch auf Racing Space: Eine ausreichende, kontrollierte Überlappung kann Anspruch auf angemessenen Raum begründen; eine minimale Überlappung reicht nicht automatisch.','6.3 Divebomb-Manöver: Spätes Bremsen ist erlaubt, wird aber regelwidrig, wenn die Kurve nicht kontrolliert fahrbar ist oder nur durch Kontakt bzw. Abkürzen gehalten werden kann.','Strafrahmen laut PDF: je nach Folge von keiner Strafe bis 2–10 Strafpunkte und 3–30 Sekunden.']},
  {title:'Verteidigung der Position', text:'Position darf verteidigt werden, solange die Verteidigung kontrolliert, vorhersehbar und sportlich bleibt.', points:['Verboten sind abruptes Wechseln, mehrfaches Blockieren, bewusstes Zudrücken und Herüberziehen in ein überlappendes Fahrzeug.','Eine defensive Linie ist erlaubt, darf einen bestehenden Zweikampf aber nicht unkontrollierbar machen.','Strafrahmen: 1–8 Strafpunkte sowie Verwarnung oder 3–20 Sekunden, abhängig von Kontakt und Unfallfolge.']},
  {title:'Abruptes Richtungswechseln', text:'Die Fahrtrichtung darf bei einem Fahrzeug in unmittelbarer Nähe nicht plötzlich oder unvorhersehbar geändert werden.', points:['Brake Moves, Reaktionsmoves, Last-Second-Moves und absichtliche Swerve-Bewegungen werden besonders streng bewertet.','Erst bremsen und dann abrupt die Spur wechseln, wodurch ein Nachfolger gefährdet wird, ist verboten.','Strafrahmen: 2–10 Strafpunkte sowie mögliche Zeitstrafe.']},
  {title:'Racing Space und Abräumen', text:'Nebeneinander fahrende Fahrzeuge müssen die Existenz des jeweils anderen berücksichtigen. Ein Fahrer darf einen legitimen Platzanspruch nicht durch seitliches Schließen beseitigen.', points:['Abdrängen kann durch seitlichen Kontakt, schrittweises Schließen oder bewusstes Hinaustragen über die Außenlinie entstehen.','Nicht jeder Außenlinienkontakt ist automatisch ein Verstoß; entscheidend sind Raum, Vermeidbarkeit und Kontrolle.','Strafrahmen: 2–10 Strafpunkte sowie Verwarnung oder 3–30 Sekunden.']},
  {title:'Verlassen der Strecke und Vorteilserlangung', text:'Die Strecke wird durch ihre Begrenzungen definiert. Das absichtliche Verlassen zur Erlangung eines Vorteils ist verboten.', points:['Verboten sind Abkürzen, Überholen, das Vollenden eines Angriffs oder das Behalten eines Vorteils nach einem Ausweichmanöver.','Ein dauerhaft erzielter Vorteil muss unverzüglich zurückgegeben werden.','Bewertet werden unter anderem Position, Zeitgewinn, Beschleunigung und der Abschluss des Überholmanövers.']},
  {title:'Unfairer Vorteil nach einem Kontakt', text:'Wer nach einem Kontakt einen Vorteil erhält, muss diesen fair und zeitnah zurückgeben, sofern die Rennleitung nichts anderes anweist.', points:['Der Vorteil ist anhand von Position, Zeit und Einfluss auf den weiteren Zweikampf zu bestimmen.','Eine verspätete oder unvollständige Rückgabe kann als zusätzlicher Verstoß gewertet werden.']},
  {title:'Verursachen von Kollisionen', text:'Kollisionen werden nach primärer Verantwortung, Kontrolle, Vermeidbarkeit und den tatsächlichen Auswirkungen beurteilt.', points:['Ein Kontakt ist nicht automatisch strafbar. Entscheidend ist, ob das verursachende Manöver kontrollierbar und vermeidbar war.','Die Stewards unterscheiden zwischen Rennunfall, leichtem Kontakt, vermeidbarer Kollision und schwerem Unfall.','Die Strafe richtet sich nach Schaden, Positionsverlust, Zeitverlust und Gefährdung.']},
  {title:'Auffahrunfälle', text:'Der auffahrende Fahrer muss ausreichend Abstand und Kontrolle halten. Die Verantwortung wird jedoch anhand der konkreten Situation geprüft.', points:['Bremsen, Linienwahl, Sicht, Geschwindigkeitsdifferenz und ein möglicher vorheriger Fehler des Vordermanns sind zu berücksichtigen.','Ein unerwartetes, regelwidriges Bremsen kann die Verantwortung mindern oder verlagern.']},
  {title:'Bremsen und Brake Checking', text:'Jeder Fahrer muss vorhersehbar bremsen. Absichtliches oder unnötiges Herbeiführen einer Auffahrgefahr ist verboten.', points:['14. Bremsen und Brake Checking: Kein absichtliches Verzögern an unerwarteter Stelle und kein provozierendes Bremsen im Zweikampf.','Normales, situationsbedingtes Bremsen bleibt erlaubt, wenn es kontrolliert und nachvollziehbar ist.']},
  {title:'Spin, Dreher und Kontrollverlust', text:'Ein Dreher oder Kontrollverlust ist zunächst ein Fahrfehler, kann aber bei mangelnder Reaktion oder Gefährdung anderer strafbar werden.', points:['Nach einem Dreher muss der Fahrer die Strecke sichern, bremsen und den Verkehr abwarten.','Bewertet werden Ursache, Rückkehr, Gefährdung und eine mögliche Kettenreaktion.']},
  {title:'Rückkehr auf die Strecke', text:'Die Rückkehr auf die Strecke darf keinen bereits fahrenden Teilnehmer gefährden oder benachteiligen.', points:['Vor der Rückkehr ist der Verkehr zu prüfen; nötigenfalls muss gewartet werden.','Ein Fahrer darf keinen Vorteil aus einer unsicheren Rückkehr behalten.','Kontakt oder Behinderung bei der Rückkehr kann als vermeidbare Kollision bewertet werden.']},
  {title:'Zurückfahren und Gegen die Fahrtrichtung', text:'Nach einem Ausritt oder Dreher ist das Zurückfahren auf die Strecke nur sicher und in Fahrtrichtung zulässig.', points:['17. Zurückfahren und gegen die Fahrtrichtung: Wenden auf der Ideallinie, Rückwärtsfahren in den Verkehr und Fahren entgegen der Rennrichtung sind verboten.','Bei Gefahr ist die sichere Position abzuwarten oder die Session-Anweisung zu befolgen.']},
  {title:'Lag, Desynchronisation und technische Probleme', text:'Technische Probleme und Netzwerklag werden berücksichtigt, entbinden aber nicht automatisch von der Verantwortung für ein gefährliches Manöver.', points:['18. Lag, Desynchronisation und technische Probleme: Beweislage, Wiederholbarkeit und Sichtbarkeit des Problems sind zu prüfen.','Bei unklarer Ursache wird nicht spekuliert; relevante Replays und Aufzeichnungen sind heranzuziehen.']},
  {title:'Mehrfachkollisionen', text:'Bei Kettenreaktionen wird der Ablauf chronologisch aufgeteilt. Die Verantwortung jedes beteiligten Fahrers wird getrennt bewertet.', points:['Der erste auslösende Kontakt ist vom späteren Folgekontakt zu unterscheiden.','Mitverantwortung, Ausweichmöglichkeiten und Reaktionszeit aller Beteiligten sind zu dokumentieren.']},
  {title:'Gefährliches Fahren', text:'Gefährliches Fahren umfasst Handlungen, die andere Teilnehmer ohne sportlich vertretbaren Grund einem erheblichen Risiko aussetzen.', points:['Dazu zählen unkontrollierte Manöver, bewusste Gefährdung, gefährliche Rückkehr und Ignorieren von Warnungen.','Die Sanktion kann bei hoher Gefährdung über eine normale Zeitstrafe hinausgehen.']},
  {title:'Absichtliche Kollisionen', text:'Absichtliche Kollisionen widersprechen dem Grundsatz des fairen Racing und gehören zu den schwersten Verstößen.', points:['Indizien sind unter anderem Lenkeingabe, Geschwindigkeit, Wiederholung, Vorgeschichte und fehlende plausible Rennursache.','Mögliche Folgen sind hohe Strafpunkte, Ausschluss, Rennsperre oder Lizenzmaßnahmen.']},
  {title:'Unsportliches Verhalten auf der Strecke', text:'Unsportliches Verhalten liegt vor, wenn ein Fahrer bewusst versucht, das sportliche Ergebnis außerhalb eines fairen Zweikampfs zu beeinflussen.', points:['Dazu zählen Provokation, absichtliches Blockieren, Ausnutzen von Regeln ohne sportliche Grundlage und Missachtung von Anweisungen.','Die Stewards bewerten Absicht, Wirkung und Wiederholung.']},
  {title:'Fahren unter Schaden', text:'Ein beschädigtes Fahrzeug darf nicht weitergeführt werden, wenn dadurch andere Teilnehmer gefährdet oder die Strecke verschmutzt wird.', points:['Der Fahrer muss Geschwindigkeit und Linie anpassen und bei erheblicher Gefahr die sichere Rückkehr bzw. Aufgabe wählen.','Schaden am eigenen Fahrzeug reduziert nicht die Verantwortung für Folgeschäden.']},
  {title:'Lapping und Überrundungen', text:'Überrundete Fahrer müssen den Rennführenden vorhersehbar und sicher passieren lassen, ohne den eigenen Kampf unnötig aufzugeben.', points:['24. Lapping und Überrundungen: Kein Verteidigen gegen ein deutlich schnelleres Fahrzeug, kein überraschendes Blockieren und kein gefährliches Zurücküberholen.','Der Überrundende trägt weiterhin Verantwortung für ein kontrolliertes Vorbeifahren.']},
  {title:'Punkte- und Zeitstrafen bei Wiederholungstätern', text:'Wiederholte gleichartige oder allgemein unsportliche Verstöße können zu einer erhöhten Sanktion führen.', points:['25. Punkte- und Zeitstrafen bei Wiederholungstätern: Vorherige Entscheidungen und die aktuelle Schwere werden gemeinsam betrachtet.','Ein Wiederholungstäter erhält nicht automatisch die Höchststrafe; die Entscheidung muss begründet und verhältnismäßig bleiben.']},
  {title:'Beweislage und Beurteilung durch die Stewards', text:'Entscheidungen stützen sich auf nachvollziehbare Beweise. Die Stewards trennen Beobachtung, Aussage und Schlussfolgerung.', points:['26. Beweislage und Beurteilung durch die Stewards: Replay, Onboard, Außenkamera, Telemetrie, Meldungen und Aussagen können herangezogen werden.','Unvollständige oder widersprüchliche Beweise sind kenntlich zu machen; Zweifel werden nicht durch Vermutungen ersetzt.']},
  {title:'Entscheidungsgrundsätze für Stewards', text:'Jede Entscheidung beantwortet die folgenden Fragen in derselben Reihenfolge, damit Fälle konsistent und überprüfbar bleiben.', points:['1. Was ist konkret passiert? 2. Welche Fahrzeuge waren beteiligt? 3. Wer hatte wann die Kontrolle?','4. Bestand ausreichende Überlappung? 5. Bestand Anspruch auf Racing Space? 6. War der Kontakt vermeidbar?','7. Wer trägt die primäre Verantwortung? 8. Gab es mitverantwortliche Faktoren? 9. Welche Auswirkungen hatte der Vorfall?','10. Wurde ein Vorteil erlangt? 11. Wurde er freiwillig zurückgegeben? 12. Gibt es erschwerende oder mildernde Faktoren? 13. Liegt ein vergleichbarer früherer Verstoß vor?']},
  {title:'Empfohlenes Format einer Steward-Entscheidung', text:'Eine Entscheidung soll sachlich, kurz nachvollziehbar und für alle Beteiligten verständlich dokumentiert werden.', points:['28. Empfohlenes Format: Beteiligte und Vorfall, relevante Regel, Beweismittel, Würdigung, Entscheidung, Strafe und Begründung.','Die Akte muss die verantwortlichen Stewards, den Status und gegebenenfalls Strafpunkte sowie Lizenzfolgen enthalten.','Die Begründung soll erklären, warum der konkrete Strafrahmen gewählt wurde.']},
  {title:'Schlussbestimmung', text:'Das Reglement bildet den verbindlichen Rahmen für die CFC Esport Division. Die Stewards entscheiden innerhalb dieses Rahmens fair, konsistent und verhältnismäßig.', points:['29. Schlussbestimmung: Die sportliche Integrität der Liga steht über Einzelinteressen.','Änderungen und Auslegungen sind transparent zu dokumentieren und für kommende Entscheidungen verfügbar zu machen.']}
];
let RULEBOOK_TAB = 0;
function setRulebookTab(index){ RULEBOOK_TAB=index; render(); }
function pageRulebook(){
  const section=RULEBOOK_SECTIONS[RULEBOOK_TAB]||RULEBOOK_SECTIONS[0];
  return `<div class="pagehead"><div><div class="eyebrow">CFC Esport Division · Originalreglement</div><h1>Sportregelwerk</h1></div><div class="actions"><a class="btn gold" href="CFC%20ESPORT%20DIVISION.pdf" target="_blank" rel="noopener">Original-PDF öffnen</a><button class="btn" onclick="window.print()">Regelwerk drucken</button></div></div>
  <div class="panel"><div class="rulebook-meta"><span class="tag decided">Verbindlicher Rahmen</span><span class="tag">29 Kapitel</span><span class="rulebook-source">Quelle: CFC ESPORT DIVISION.pdf</span></div><p style="margin:0;color:var(--grey);font-size:13.5px;">Wähle links einen Punkt des Reglements. Die Kapitel sind als Arbeitsgrundlage für Fahrer, Teams und Stewards gegliedert.</p></div>
  <div class="rulebook-layout"><nav class="rulebook-tabs" aria-label="Regelwerk-Kapitel">${RULEBOOK_SECTIONS.map((item,index)=>`<button class="rulebook-tab ${index===RULEBOOK_TAB?'active':''}" onclick="setRulebookTab(${index})"><span class="rule-number">${String(index+1).padStart(2,'0')}</span><span>${esc(item.title)}</span></button>`).join('')}</nav>
    <article class="panel rulebook-copy"><div class="eyebrow" style="margin:0 0 7px;">Kapitel ${String(RULEBOOK_TAB+1).padStart(2,'0')} / 29</div><h2 style="font-size:22px;color:var(--white);text-transform:none;letter-spacing:.3px;margin-bottom:16px;"><b>${esc(section.title)}</b></h2><p>${esc(section.text)}</p><div class="sectiontitle">Regel- und Bewertungsgrundlagen</div><ul>${section.points.map(point=>`<li>${esc(point)}</li>`).join('')}</ul><div class="panel" style="margin:22px 0 0;background:var(--black-3);"><h2>Für die Aktenführung</h2><p style="margin:0;color:var(--grey);">Verknüpfe bei einem Vorfall die passende Regelstelle im Feld „Klarer Regelverstoß“ der Steward-Akte und dokumentiere Beweise, Auswirkungen und die Begründung der Entscheidung.</p></div></article>
  </div>`;
}

/* ============================= PROZESSE / KNOWLEDGEBASE ============================= */
const PROCESS_TOPICS = [
  {id:'start',title:'Start & Orientierung',summary:'Die wichtigsten Bereiche und die Grundlogik der Anwendung.',intro:'Das Stewards Office ist in Arbeitsbereiche aufgeteilt. Jede Seite hat eine konkrete Aufgabe: erfassen, untersuchen, entscheiden oder dokumentieren.',steps:[['Dashboard öffnen','Offene Akten, Lizenzstatus, Kategorien und zuletzt bearbeitete Fälle zeigen den aktuellen Handlungsbedarf.'],['Seite wählen','Die Navigation links öffnet den Arbeitsbereich. Ein Klick auf einen Fall oder Fahrer führt in die Detailansicht.'],['Änderungen speichern','Formulare werden erst durch den jeweiligen Speichern-Button dauerhaft übernommen.'],['Datenstand prüfen','Bei verbundenem Supabase sehen alle offenen Browser denselben Stand.']],screen:'dashboard'},
  {id:'case',title:'Steward-Akte',summary:'Meldung aufnehmen, Beweise dokumentieren, Verwarnungen erstellen und nach Freigabe entscheiden.',intro:'Eine geöffnete Akte ist zunächst eine Untersuchung, keine Entscheidung. Verwarnungen werden direkt in der bestehenden Akte erstellt und abgelegt; eine endgültige Entscheidung erfolgt erst nach Discord-Freigabe.',steps:[['Neue Akte eröffnen','Saison, Event, Session, Zeitpunkt, Kategorie, Beteiligte und objektive Beschreibung erfassen.'],['Akte anlegen','„Akte anlegen“ erzeugt die STW-Nummer und setzt den Status „Neu“.'],['Untersuchung ergänzen','Replay-, Onboard- oder Telemetrie-Links, Aussagen, Anhörung und Regelreferenz dokumentieren.'],['Schriftliche Verwarnung öffnen','In einer bestehenden Akte auf „Verwarnung setzen“ klicken. Dieser Button befindet sich am unteren Rand der Akte neben dem FIA-Bericht.'],['Kategorie auswählen','Eine der 30 Kategorien zum Mangel an Rennintelligenz auswählen. Der passende Verwarnungstext wird automatisch eingesetzt.'],['Verwarnung prüfen und anpassen','Fahrer, Team, Datum, Steward und Text kontrollieren. Der automatisch erzeugte Text kann vor dem Speichern noch sachlich ergänzt oder korrigiert werden.'],['PDF erstellen oder ablegen','„PDF erstellen“ öffnet die druckfertige Verwarnung; im Druckdialog kann sie als PDF gespeichert werden. Mit „Verwarnung in Akte speichern“ wird sie dauerhaft in der Akte abgelegt.'],['Verwarnung nachkontrollieren','Nach dem Speichern erscheint sie unter „Verwarnungen in dieser Akte“. Der Button „PDF öffnen“ erzeugt das Dokument erneut; im FIA-Gesamtbericht wird die Verwarnung ebenfalls angezeigt.'],['Discord-Freigabe holen','Im zuständigen Discord-Kanal das ausdrückliche Okay der zuständigen Person oder des Gremiums einholen und in den Notizen festhalten.'],['Entscheidung setzen','Erst danach Status, Entscheidung, Strafpunkte, Lizenzfolge und Begründung speichern.']],screen:'case'},
  {id:'cases',title:'Aktenübersicht',summary:'Fälle filtern, priorisieren und ohne versehentliche Entscheidung öffnen.',intro:'Die Aktenübersicht ist der Arbeitskorb der Stewards. Filter helfen beim Finden; das Öffnen einer Zeile startet nur die Prüfung.',steps:[['Aktenliste öffnen','STW-Nummer, Event, Team, Fahrer, Kategorie, Entscheidung und Status prüfen.'],['Suchen und filtern','Suchfeld, Status, Team und Kategorie kombinieren, um offene Fälle zu finden.'],['Detail öffnen','Eine Tabellenzeile öffnet die Akte, verändert aber nichts.'],['Freigabe beachten','Vor jeder Entscheidung zurück in Discord, Okay einholen und in der Akte dokumentieren.']],screen:'cases'},
  {id:'drivers',title:'Fahrer & Lizenzen',summary:'Fahrerakten pflegen, Strafpunkte prüfen und Lizenzen verwalten.',intro:'Die Fahrerakte verbindet Stammdaten, Lizenz, Strafpunkte, verknüpfte Steward-Akten und Transferhistorie.',steps:[['Fahrer suchen','Nach Name, Team oder Lizenzstatus filtern.'],['Fahrerakte öffnen','Persönliche Daten, Sim-Racing-Profil und bisherige Fälle prüfen.'],['Lizenz erteilen','Reglement-Akzeptanz prüfen, dann Lizenz erteilen und Dokument erzeugen.'],['Status ändern','Aussetzen, Entziehen oder Reaktivieren mit dokumentiertem Grund durchführen.'],['Aktenhistorie prüfen','Strafpunkte stammen aus entschiedenen oder archivierten Akten.']],screen:'drivers'},
  {id:'teams',title:'Teams & Aufstellung',summary:'Teams, Fahreraufstellungen und Lizenzstatus übersichtlich kontrollieren.',intro:'Die Teamseite zeigt die aktuelle Aufstellung. Änderungen an Fahrern erfolgen über Fahrerakte oder Transfers.',steps:[['Teamübersicht öffnen','Aufstellung, Lizenzstatus und Fallanzahl je Team sehen.'],['Fahrer prüfen','Einen Fahrer anklicken, um seine vollständige Akte zu öffnen.'],['Teamdaten verwalten','Neue Teams und Grunddaten in Verwaltung pflegen.'],['Aufstellung nachvollziehen','Teamwechsel ausschließlich über den Transferprozess dokumentieren.']],screen:'teams'},
  {id:'transfers',title:'Transfers',summary:'Teamwechsel nachvollziehbar erfassen, ohne die Historie zu verlieren.',intro:'Ein Transfer ändert die aktuelle Teamzuordnung und legt gleichzeitig einen Historieneintrag an.',steps:[['Fahrer auswählen','Der aktuelle Verein wird als Ausgangspunkt verwendet.'],['Zielteam setzen','Neues Team, Datum und klare Notiz zum Wechsel eintragen.'],['Transfer speichern','„Transfer eintragen“ aktualisiert Fahrer und Historie.'],['Nachkontrolle','Fahrerakte und Teamaufstellung prüfen.']],screen:'transfers'},
  {id:'finance',title:'Finanzen',summary:'Teamkonten, Rennkosten, Einnahmen und geplante Zahlungen führen.',intro:'Die Finanzseite arbeitet mit Teamkonten und einem Journal. Jede Buchung braucht Betrag, Datum, Kategorie und Beschreibung.',steps:[['Teamkonto öffnen','Kontostand, Einnahmen, Ausgaben und Fahrer eines Teams prüfen.'],['Buchung erfassen','Art, Betrag, Datum, Rennen, Kategorie, Beschreibung, Empfänger und Status ausfüllen.'],['Zahlung prüfen','Geplante Ausgaben vor „Jetzt bezahlen“ kontrollieren.'],['Journal kontrollieren','Nach Team filtern und Status sowie Gegenbuchungen prüfen.']],screen:'finance'},
  {id:'rules',title:'Regelwerk nutzen',summary:'Regelstellen finden und in der Akte eindeutig referenzieren.',intro:'Das Regelwerk ist die fachliche Grundlage. Nutze es während der Untersuchung, bevor du eine Entscheidung formulierst.',steps:[['Kapitel öffnen','Im Regelwerk links den passenden Kapitel-Tab wählen.'],['Sachverhalt abgleichen','Kontrolle, Überlappung, Racing Space, Vermeidbarkeit und Auswirkungen prüfen.'],['Regel referenzieren','Kapitel- oder Artikelreferenz in „Klarer Regelverstoß“ übernehmen.'],['Begründung formulieren','Sachverhalt, Beweise und Strafrahmen logisch verbinden.']],screen:'rules'},
  {id:'manage',title:'Verwaltung & Daten',summary:'Stammdaten, Integrationen, Freigabelinks und Backups sicher bedienen.',intro:'Die Verwaltung wirkt auf den gemeinsamen Datenbestand. Änderungen deshalb bewusst und nachvollziehbar durchführen.',steps:[['Bereich auswählen','Akten, Fahrer, Teams, Transfers, Finanzen, Integrationen oder Backup wählen.'],['Supabase verbinden','Projekt-URL und anon-Key eintragen, wenn der Live-Datenbestand genutzt werden soll.'],['Discord konfigurieren','Akten- und Finanz-Webhook getrennt hinterlegen und testen.'],['Backup erstellen','Regelmäßig den gesamten Datenbestand als JSON exportieren.']],screen:'manage'}
];
let PROCESS_TOPIC='start';
function setProcessTopic(id){ PROCESS_TOPIC=id; render(); window.scrollTo(0,0); }
function processScreenshot(type){
  const side=['Dashboard','Neue Akte','Alle Akten','Fahrer','Teams','Transfers','Finanzen','Regelwerk','Verwaltung'];
  const active={dashboard:'Dashboard',case:'Neue Akte',cases:'Alle Akten',drivers:'Fahrer',teams:'Teams',transfers:'Transfers',finance:'Finanzen',rules:'Regelwerk',manage:'Verwaltung'}[type]||'Dashboard';
  let content='<h4>Dashboard</h4><div class="ui-shot-boxes"><div class="ui-shot-box"><b>0</b><small>Akten gesamt</small></div><div class="ui-shot-box"><b>0</b><small>Offen</small></div><div class="ui-shot-box"><b>0</b><small>Lizenzen</small></div></div><div class="ui-shot-line"></div><span class="ui-shot-callout">Hier beginnt die Übersicht</span>';
  if(type==='case') content='<h4>Steward-Fall</h4><div class="ui-shot-form"><div class="ui-shot-input">Grand Prix / Event</div><div class="ui-shot-input">Session</div><div class="ui-shot-input">Team / Fahrer</div><div class="ui-shot-input">Kategorie</div></div><span class="ui-shot-button">Akte anlegen</span><span class="ui-shot-callout" style="top:92px;">Akte anlegen = noch keine Entscheidung</span>';
  if(type==='cases') content='<h4>Alle Akten</h4><div class="ui-shot-form"><div class="ui-shot-input">Suche</div><div class="ui-shot-input">Status: Offen</div></div><div class="ui-shot-table"><div></div><div></div><div></div><div></div></div><span class="ui-shot-callout" style="top:72px;">Zeile öffnen = prüfen, nicht entscheiden</span>';
  if(type==='drivers') content='<h4>Fahrer</h4><div class="ui-shot-boxes"><div class="ui-shot-box"><b>12</b><small>Aktiv</small></div><div class="ui-shot-box"><b>8/12</b><small>Strafpunkte</small></div><div class="ui-shot-box"><b>4</b><small>Akten</small></div></div><div class="ui-shot-table"><div></div><div></div><div></div></div><span class="ui-shot-callout">Fahrerzeile öffnet die Lizenzakte</span>';
  if(type==='finance') content='<h4>Finanzen</h4><div class="ui-shot-boxes"><div class="ui-shot-box"><b>€ 0</b><small>Kontostand</small></div><div class="ui-shot-box"><b>€ 0</b><small>Einnahmen</small></div><div class="ui-shot-box"><b>€ 0</b><small>Ausgaben</small></div></div><span class="ui-shot-button">Buchung speichern</span><span class="ui-shot-callout">Betrag und Status prüfen</span>';
  if(type==='rules') content='<h4>Sportregelwerk</h4><div class="ui-shot-line gold"></div><div class="ui-shot-line"></div><div class="ui-shot-table"><div></div><div></div><div></div></div><span class="ui-shot-callout">Kapitel auswählen und referenzieren</span>';
  if(type==='manage') content='<h4>Verwaltung</h4><div class="ui-shot-form"><div class="ui-shot-input">Akten</div><div class="ui-shot-input">Integrationen</div><div class="ui-shot-input">Daten &amp; Backup</div><div class="ui-shot-input">Finanzen</div></div><span class="ui-shot-button">Speichern</span><span class="ui-shot-callout">Globale Einstellungen bewusst speichern</span>';
  if(type==='teams') content='<h4>Teams — Saison 2026</h4><div class="ui-shot-boxes"><div class="ui-shot-box"><b>Team A</b><small>4 Fahrer</small></div><div class="ui-shot-box"><b>Team B</b><small>3 Fahrer</small></div><div class="ui-shot-box"><b>Team C</b><small>2 Fahrer</small></div></div><span class="ui-shot-callout">Aufstellung und Lizenzstatus prüfen</span>';
  if(type==='transfers') content='<h4>Neuer Transfer</h4><div class="ui-shot-form"><div class="ui-shot-input">Fahrer wählen</div><div class="ui-shot-input">Neues Team</div><div class="ui-shot-input">Datum</div><div class="ui-shot-input">Notiz</div></div><span class="ui-shot-button">Transfer eintragen</span><span class="ui-shot-callout">Teamwechsel und Historie speichern</span>';
  return `<div class="ui-shot"><div class="ui-shot-head"><i></i><i></i><i></i><span>ZFC Racing — Stewards Office</span></div><div class="ui-shot-body"><div class="ui-shot-side"><b>ZFC RACING</b>${side.map(item=>`<span class="${item===active?'on':''}">${item}</span>`).join('')}</div><div class="ui-shot-content">${content}</div></div></div>`;
}
function pageProcesses(){
  const topic=PROCESS_TOPICS.find(item=>item.id===PROCESS_TOPIC)||PROCESS_TOPICS[0];
  const approval=topic.id==='case'||topic.id==='cases';
  return `<div class="pagehead"><div><div class="eyebrow">Knowledgebase · Bedienung &amp; Abläufe</div><h1>Prozesse</h1></div><div class="actions"><button class="btn gold" onclick="go('caseform')">Neue Akte öffnen</button><button class="btn" onclick="go('rulebook')">Regelwerk öffnen</button></div></div><div class="process-gate"><h2>Freigaberegel für Steward-Akten</h2><p><strong>Eine Akte öffnen ist nicht dasselbe wie eine Entscheidung setzen.</strong> Öffnen dient Prüfung und Dokumentation. Vor Status, Entscheidung, Strafpunkten oder Lizenzfolge holst du im zuständigen Discord-Kanal das ausdrückliche Okay ein und dokumentierst es in den Untersuchungsnotizen.</p></div><div class="knowledge-layout"><nav class="knowledge-nav" aria-label="Prozessbereiche">${PROCESS_TOPICS.map((item,index)=>`<button class="${item.id===topic.id?'active':''}" onclick="setProcessTopic('${item.id}')"><span class="nav-no">${String(index+1).padStart(2,'0')}</span><span>${esc(item.title)}</span></button>`).join('')}</nav><main class="knowledge-main"><section class="guide-hero"><div class="eyebrow" style="margin:0 0 5px;">Guide ${String(PROCESS_TOPICS.indexOf(topic)+1).padStart(2,'0')} / ${PROCESS_TOPICS.length}</div><h2>${esc(topic.title)}</h2><p>${esc(topic.intro)}</p></section><div class="guide-grid"><section class="guide-card"><h3>Worum geht es?</h3><p>${esc(topic.summary)}</p></section><section class="guide-card"><h3>Merksatz</h3><p>${approval?'Prüfen und dokumentieren ist erlaubt. Entscheiden erst nach Discord-Freigabe.':'Arbeite vom Überblick zur Detailansicht und speichere Änderungen bewusst.'}</p></section></div><section class="panel"><h2>Schritt für <b>Schritt</b></h2><div class="guide-steps">${topic.steps.map(step=>`<div class="guide-step"><div><strong>${esc(step[0])}</strong><span>${esc(step[1])}</span></div></div>`).join('')}</div></section><section class="panel"><h2>Ansicht mit <b>Orientierung</b></h2><p style="color:var(--grey);font-size:13px;margin:-3px 0 14px;">Die Markierung zeigt, wo du in diesem Bereich zuerst hinschauen oder klicken solltest.</p>${processScreenshot(topic.screen)}</section>${approval?'<section class="panel" style="border-color:#6a4d1b;"><h2>Vor jeder <b>Entscheidung</b></h2><div class="guide-steps"><div class="guide-step"><div><strong>Discord-Kanal öffnen</strong><span>Zuständige Person oder zuständiges Gremium anhand von Rennen und Akte bestimmen.</span></div></div><div class="guide-step"><div><strong>Okay einholen</strong><span>„Akte gesehen“ oder „bitte prüfen“ ist keine Entscheidungsfreigabe.</span></div></div><div class="guide-step"><div><strong>Freigabe dokumentieren</strong><span>Discord-Name, Zeitpunkt und Referenz in den Untersuchungsnotizen festhalten.</span></div></div><div class="guide-step"><div><strong>Entscheidung speichern</strong><span>Erst danach Entscheidung, Punkte, Lizenzstatus und Begründung eintragen.</span></div></div></div></section>':''}</main></div>`;
}

/* ============================= CFC ESPORT MANAGEMENT ============================= */
let ESPORT_SLIDE=0;
let ESPORT_TRANSITION='next';
const ESPORT_SLIDES=[
  {kicker:'01 · Opening · 4 min',title:'Willkommen im CFC Esport Team',lead:'Von der ersten Runde zur professionellen Rennstruktur. Heute definieren wir Anspruch, Weg und Verantwortung eines CFC-Fahrers.',columns:[['Heute im Fokus',['Santo Barbosa · Teamleitung und Vision','CFC Esport Identität und European Championship Qualification','Der Weg durch Auswahl, Ausbildung und Bewertung']],['Leitgedanke',['Performance ist reproduzierbar.','Professionalität beginnt vor dem Start.','Jede Runde ist ein Datensatz.']]]},
  {kicker:'02 · Identität · 6 min',title:'Wer wir sind',lead:'CFC Esport verbindet Wettbewerb, Entwicklung und klare Standards zu einer belastbaren Teamkultur.',columns:[['Unser Anspruch',['Schnelle, kontrollierte und faire Fahrer','Technische Neugier und ehrliche Analyse','Kommunikation ohne Ego, Entscheidungen mit Daten']],['Unsere Richtung',['European Championship Qualification','Ein Team, ein System, ein gemeinsamer Maßstab','Langfristige Entwicklung statt kurzfristiger Glanz']]]},
  {kicker:'03 · Auswahl · 7 min',title:'9 Wochen. Ein klares Signal.',lead:'Das Auswahl- und Ausbildungsprogramm prüft nicht nur Pace. Es zeigt, wer lernen, liefern und unter Druck gemeinsam arbeiten kann.',timeline:[['W1–3','Baseline, Qualifying, Datenaufnahme'],['W4–6','Race Pace, Racecraft, Strategie'],['W7–9','Pressure, Teamarbeit, Final Assessment']]},
  {kicker:'04 · Action Days · 8 min',title:'Training Center / Action Days',lead:'Konstanz entsteht durch einen festen Rhythmus. Im CFC Training Center wird jede Woche gemeinsam trainiert, analysiert und in konkrete nächste Schritte übersetzt.',columns:[['Wochenrhythmus',['3 Trainingseinheiten pro Woche','2 Analyse-Termine pro Woche','Trainingsstart immer um 19:00 Uhr','Training von 19:00 bis 21:00 Uhr']],['Ablauf & Betreuung',['Jede Trainingseinheit beginnt mit einem 15-Minuten-Briefing','Die Analyse übernimmt grundsätzlich ein Coach','Bei Bedarf kommt der Coach direkt auf dich zu und bespricht die Auswertung mit dir','Falls kein Coach verfügbar ist, übernimmt der General Manager des CFC Esport Teams die Analyse']],],closing:true},
  {kicker:'05 · Performance · 8 min',title:'Schnell sein ist ein System',lead:'Die CFC Esport Line übersetzt rohe Geschwindigkeit in wiederholbare Rennleistung.',columns:[['On-Track',['Qualifying: eine Runde aufbauen und ausführen','Race Pace: Reifenfenster und Rhythmus halten','Racecraft: Raum, Timing und Überholentscheidungen']],['Engineering',['Setup-Basics und technische Rückmeldung','Reifenmanagement und Strategie','Datenanalyse aus Telemetrie und Vergleichsläufen']]]},
  {kicker:'06 · Daten · 6 min',title:'Jede Runde erklärt etwas',lead:'Wir bewerten nicht nur die schnellste Zeit. Wir suchen Ursache, Muster und den nächsten messbaren Schritt.',columns:[['Wir lesen',['Linien, Bremsdruck, Throttle und Minimum Speed','Konsistenz über Stints und Bedingungen','Delta zum Referenzfahrer']],['Wir handeln',['Hypothese formulieren','Eine Variable verändern','Ergebnis prüfen und dokumentieren']]]},
  {kicker:'07 · Racecraft · 7 min',title:'Rennen werden im Verkehr entschieden',lead:'Kontrolle, Übersicht und Entscheidungsqualität machen aus Pace ein Ergebnis.',columns:[['Im Zweikampf',['Racing Space erkennen und respektieren','Angriff mit realistischem Exit planen','Vorteile fair zurückgeben']],['Im Stint',['Verkehr lesen und Risiken priorisieren','Reifen schützen, ohne Tempo zu verlieren','Strategie mit dem Race Engineer synchronisieren']]]},
  {kicker:'08 · Pressure · 6 min',title:'Druck ist Teil der Aufgabe',lead:'Mentaltraining bedeutet nicht, Druck wegzudenken. Es bedeutet, unter Druck den Prozess zu behalten.',columns:[['Vor dem Start',['Briefing, Zielbild, Plan B','Ritual und Fokus statt Last-Minute-Chaos','Fehler als Information einordnen']],['Nach der Session',['Kurz und ehrlich debriefen','Verantwortung übernehmen','Konkrete nächste Aktion festlegen']]]},
  {kicker:'09 · Professionalität · 6 min',title:'Off-Track ist On-Track',lead:'Anwesenheit, Vorbereitung, Kommunikation und Media-Verhalten sind Teil des Fahrerprofils.',columns:[['Teamstandard',['Pünktlich zu Briefings und Tests','Klare Statusmeldungen an Coaches','Respektvoller Umgang mit Team und Gegnern']],['Außenwirkung',['CFC Branding konsistent verwenden','Media-Anfragen zuverlässig bedienen','Keine vertraulichen Daten veröffentlichen']]]},
  {kicker:'10 · Testsystem · 7 min',title:'So wird Leistung bewertet',lead:'Ein transparenter Testprozess verbindet objektive Daten mit beobachtbarem Verhalten.',columns:[['Bewertungsfelder',['Qualifying Pace und Stint-Konsistenz','Racecraft und Regelverständnis','Technische Kommunikation und Lernkurve']],['Bewertungslogik',['Daten · Beobachtung · Debrief','Mehrere Sessions statt Einzelergebnis','Potenzial zählt, aber Standards gelten sofort']]]},
  {kicker:'11 · Teamstruktur · 6 min',title:'Jede Rolle hält das Auto auf Kurs',lead:'Gute Performance entsteht, wenn Zuständigkeiten klar sind und Informationen rechtzeitig ankommen.',columns:[['Im Team',['Team Lead · Richtung und Entscheidungen','Coach · Entwicklung und Feedback','Race Engineer · Setup, Daten und Strategie']],['Beim Fahrer',['Fahrer · Ausführung und Rückmeldung','Media · Repräsentation und Content','Alle · Vorbereitung, Respekt, Verbindlichkeit']]]},
  {kicker:'12 · Rennwochenende · 7 min',title:'Der Ablauf ist unser Vorteil',lead:'Ein wiederholbarer Rennwochenend-Ablauf reduziert Unsicherheit und schafft Raum für Performance.',timeline:[['Vorbereitung','Attendance, Technikcheck, Briefing'],['Session','Qualifying, Strategie, Kommunikation'],['Nachbereitung','Debrief, Daten, Action Items']]},
  {kicker:'13 · Abschluss · 8 min',title:'Esport Ready',lead:'Die Auswahl endet nicht mit einem Ergebnis. Sie endet mit einer Entscheidung, wer bereit ist, den CFC-Standard jeden Tag zu vertreten.',columns:[['Ready bedeutet',['Pace mit Konsistenz','Racing mit Kontrolle','Feedback mit Offenheit','Professionalität ohne Ausnahme']],['Der nächste Schritt',['Final Assessment abschließen','Entwicklungsplan vereinbaren','Gemeinsam Richtung European Championship arbeiten']],],closing:true}
];
function setEsportSlide(index){ ESPORT_TRANSITION=index<ESPORT_SLIDE?'prev':'next'; ESPORT_SLIDE=Math.max(0,Math.min(ESPORT_SLIDES.length-1,index)); render(); window.scrollTo(0,0); }
function pageEsport(){
  return `<div class="pagehead"><div><div class="eyebrow">CFC Racing · Performance Division</div><h1>CFC Esport Management</h1></div><div class="actions"><a class="btn" href="CFC%20ESPORT%20DIVISION.pdf" target="_blank" rel="noopener">Reglement PDF</a><button class="btn gold" onclick="go('esport','presentation')">Opening starten</button></div></div>
  <section class="esport-hero"><div class="esport-kicker">CFC ESPORT TEAM · 2026 PROGRAMM</div><h2>Built for <span>race day.</span></h2><p>Die Management-Zentrale für Fahrerentwicklung, Auswahl und Rennperformance. Öffne das fertige 90-Minuten-Deck direkt aus dieser Seite und führe neue Fahrer durch die CFC-Vision.</p><div class="esport-actions"><button class="btn primary" onclick="go('esport','presentation')">Präsentation öffnen · 90 min</button><button class="btn" onclick="go('teams')">Teamaufstellung ansehen</button></div></section>
  <div class="esport-status"><span class="tag">European Championship Path</span><span class="tag">9-Wochen-Auswahl</span><span class="tag">Driver Development</span><span class="tag">Live Management Link</span></div>
  <div class="esport-grid"><article class="esport-card"><div class="card-index">01 / MISSION</div><h3>European Championship</h3><p>Ein gemeinsamer Zielpunkt für Pace, Struktur und langfristige Fahrerentwicklung.</p></article><article class="esport-card"><div class="card-index">02 / METHOD</div><h3>Performance System</h3><p>Qualifying, Race Pace, Racecraft, Reifen, Setup, Telemetrie und Strategie in einem Ablauf.</p></article><article class="esport-card"><div class="card-index">03 / STANDARD</div><h3>Esport Ready</h3><p>Bewertet werden Leistung, Lernkurve, Kommunikation, Disziplin und professionelles Auftreten.</p></article></div>
  <section class="panel"><h2>Auswahl- und Ausbildungsprogramm</h2><div class="esport-program"><div><b>WOCHE 01–03</b><span>Baseline · Qualifying · Datenaufnahme</span></div><div><b>WOCHE 04–06</b><span>Race Pace · Racecraft · Strategie</span></div><div><b>WOCHE 07–09</b><span>Pressure · Teamwork · Final Assessment</span></div></div></section>
  <div class="esport-tools"><button class="esport-tool" onclick="go('esport-drivers')"><span class="tool-no">01 / DRIVER ROOM</span><b>Esport-Fahrer erfassen</b><span>Professionelles Profil, Coaching-Ziele, Verfügbarkeit, Telemetrie und Entwicklungsschwerpunkte.</span></button><button class="esport-tool" onclick="go('esport-setup')"><span class="tool-no">02 / ENGINEERING</span><b>F1 26 Setup Lab</b><span>Alle Setup-Einstellungen verwalten und pro Strecke als Setup speichern.</span></button><button class="esport-tool" onclick="go('esport','presentation')"><span class="tool-no">03 / TEAM OPENING</span><b>Fahrer-Präsentation</b><span>Das 90-Minuten-Opening für neue Fahrer direkt aus der Management-Zentrale starten.</span></button></div>
  <section class="panel"><h2>Management <b>Navigation</b></h2><div class="grid cols-3"><button class="btn" onclick="go('esport-drivers')">Esport-Fahrer öffnen</button><button class="btn" onclick="go('esport-setup')">Setup Lab öffnen</button><button class="btn" onclick="go('processes')">Prozesse &amp; Standards</button></div></section>`;
}
function pageEsportPresentation(){
  const slide=ESPORT_SLIDES[ESPORT_SLIDE]||ESPORT_SLIDES[0];
  const columns=slide.columns?.map(([heading,items])=>`<div><h3>${heading}</h3><ul>${items.map(item=>`<li>${item}</li>`).join('')}</ul></div>`).join('')||'';
  const timeline=slide.timeline?`<div class="slide-timeline">${slide.timeline.map(([heading,text])=>`<div><b>${heading}</b><span>${text}</span></div>`).join('')}</div>`:'';
  return `<div class="presentation-shell"><div class="presentation-top"><div><div class="eyebrow">CFC Esport Team · Fahrer-Opening</div><h1>Team Presentation</h1></div><div class="actions"><button class="btn" onclick="go('esport')">← Management</button><button class="btn gold" onclick="window.print()">Deck drucken / PDF</button></div></div><div class="presentation-slide slide-transition-${ESPORT_TRANSITION}"><div class="slide-no">${slide.kicker}</div><h2>${slide.title}</h2><p class="lead">${slide.lead}</p>${columns}${timeline}${slide.closing?'<div class="esport-status" style="margin-top:30px;"><span class="tag">CFC Esport Ready</span><span class="tag">Next stop: European Championship</span></div>':''}</div><div class="presentation-progress"><span style="width:${((ESPORT_SLIDE+1)/ESPORT_SLIDES.length)*100}%"></span></div><div class="presentation-top" style="margin-top:14px;"><span class="slide-count">FOLIE ${String(ESPORT_SLIDE+1).padStart(2,'0')} / ${String(ESPORT_SLIDES.length).padStart(2,'0')} · ca. 90 MINUTEN</span><div class="actions"><button class="btn" onclick="setEsportSlide(${ESPORT_SLIDE-1})" ${ESPORT_SLIDE===0?'disabled':''}>← Zurück</button><button class="btn primary" onclick="setEsportSlide(${ESPORT_SLIDE+1})" ${ESPORT_SLIDE===ESPORT_SLIDES.length-1?'disabled':''}>Weiter →</button></div></div></div>`;
}

const ESPORT_TRACKS=['Bahrain','Saudi-Arabien','Australien','Japan','China','Miami','Emilia-Romagna','Monaco','Kanada','Spanien','Österreich','Großbritannien','Belgien','Ungarn','Niederlande','Italien','Aserbaidschan','Singapur','USA (Austin)','Mexiko','Brasilien','Las Vegas','Katar','Abu Dhabi'];
const SETUP_FIELDS=[
  ['Aerodynamik','Frontflügel'],['Aerodynamik','Heckflügel'],
  ['Getriebe','Differenzial On-Throttle'],['Getriebe','Differenzial Off-Throttle'],['Getriebe','Motorbremse'],
  ['Geometrie','Sturz vorne'],['Geometrie','Sturz hinten'],['Geometrie','Spur vorne'],['Geometrie','Spur hinten'],
  ['Aufhängung','Federung vorne'],['Aufhängung','Federung hinten'],['Aufhängung','Stabilisator vorne'],['Aufhängung','Stabilisator hinten'],['Aufhängung','Fahrhöhe vorne'],['Aufhängung','Fahrhöhe hinten'],
  ['Bremsen','Bremsdruck'],['Bremsen','Bremsbalance vorne'],
  ['Reifen','Reifendruck vorne links'],['Reifen','Reifendruck vorne rechts'],['Reifen','Reifendruck hinten links'],['Reifendruck hinten rechts']
];
let ESPORT_PROFILE_TRACK=ESPORT_TRACKS[0];
function esportProfile(driver){ return driver.esportProfile||{}; }
function esportTrackAnalysis(driver){ return esportProfile(driver).trackAnalysis?.[ESPORT_PROFILE_TRACK]||{}; }
function pageEsportDrivers(){
  const rows=DB.drivers.slice().sort((a,b)=>driverName(a).localeCompare(driverName(b))).map(d=>{const p=esportProfile(d);return `<div class="profile-row" onclick="go('esport-driverform','${d.id}')"><div><strong>${esc(driverName(d)||'Unbenannter Fahrer')}</strong><span>${esc(teamById(d.teamId)?.name||'Ohne Team')} · ${esc(p.role||'Fahrer')} · Coach: ${esc(p.coach||'offen')}</span></div><span>${esc(p.status||'Assessment')}</span></div>`;}).join('');
  const active=DB.drivers.filter(d=>esportProfile(d).status==='Aktiv').length;
  return `<div class="pagehead"><div><div class="eyebrow">CFC Esport · Driver Room</div><h1>Esport-Fahrer</h1></div><div class="actions"><button class="btn" onclick="go('esport')">← Management</button><button class="btn primary" onclick="go('esport-driverform')">+ Fahrer erfassen</button></div></div><div class="esport-metric-grid"><div class="esport-metric"><b>${DB.drivers.length}</b><span>Profile gesamt</span></div><div class="esport-metric"><b>${active}</b><span>Aktiv im Team</span></div><div class="esport-metric"><b>${DB.drivers.filter(d=>esportProfile(d).coach).length}</b><span>Mit Coach</span></div><div class="esport-metric"><b>${DB.esportSetups.length}</b><span>Gespeicherte Setups</span></div><div class="esport-metric"><b>24</b><span>Strecken</span></div></div><div class="panel"><h2>Fahrer <b>Directory</b></h2><p style="color:var(--grey);font-size:13px;margin-top:-4px;">Jede Fahrerakte verbindet Stammdaten, Coaching, Telemetrie, Zielwerte und Streckenanalysen.</p><div class="profile-list">${rows||'<div class="empty"><b>Noch keine Fahrerprofile</b>Lege den ersten CFC-Esport-Fahrer an.</div>'}</div></div>`;
}
function pageEsportDriverForm(existing){
  const d=existing||{id:null,firstName:'',lastName:'',number:'',nationality:'',teamId:DB.teams[0]?.id||'',platform:PLATFORMS[0],simId:'',photoUrl:''};
  const p=esportProfile(d), a=esportTrackAnalysis(d), isNew=!existing;
  const analysis=p.trackAnalysis||{};
  return `<div class="pagehead"><div><div class="eyebrow">CFC Esport · Coaching &amp; Datenanalyse</div><h1>${isNew?'Neues Esport-Profil':esc(driverName(d))}</h1></div><div class="actions"><button class="btn" onclick="go('esport-drivers')">← Fahrerübersicht</button><button class="btn gold" onclick="go('esport-setup')">Setup Lab</button></div></div><div class="panel"><div class="esport-profile-head"><div class="esport-profile-id"><div class="driverface">${d.photoUrl?`<img src="${esc(d.photoUrl)}" alt="${esc(driverName(d))}">`:esc((d.firstName?.[0]||'')+(d.lastName?.[0]||'—'))}</div><div><h2>${esc(driverName(d)||'Neuer Fahrer')}</h2><p>${esc(teamById(d.teamId)?.name||'Team auswählen')} · ${esc(p.role||'Esport-Fahrer')} · Profilstatus: ${esc(p.status||'Assessment')}</p></div></div><div class="esport-profile-actions">${!isNew?`<button class="btn small" onclick="go('driverform','${d.id}')">Allgemeine Fahrerakte</button>`:''}<button class="btn small" onclick="printDriverProfile('${d.id||''}')">Profil drucken</button></div></div><div class="sectiontitle">Fahrerprofil</div><div class="grid cols-3"><div class="field"><label>Vorname</label><input id="e_firstName" type="text" value="${esc(d.firstName)}"></div><div class="field"><label>Nachname</label><input id="e_lastName" type="text" value="${esc(d.lastName)}"></div><div class="field"><label>Startnummer</label><input id="e_number" type="text" value="${esc(d.number)}"></div><div class="field"><label>Nationalität</label><input id="e_nationality" type="text" value="${esc(d.nationality)}"></div><div class="field"><label>Team</label><select id="e_teamId">${teamOptions(d.teamId,false)}</select></div><div class="field"><label>Plattform</label><select id="e_platform">${selectOptions(PLATFORMS,d.platform||PLATFORMS[0])}</select></div><div class="field"><label>Sim-Racing-Handle</label><input id="e_simId" type="text" value="${esc(d.simId)}"></div><div class="field"><label>Foto-URL</label><input id="e_photoUrl" type="url" value="${esc(d.photoUrl)}" placeholder="https://…"></div><div class="field"><label>Profilstatus</label><select id="e_status">${selectOptions(['Assessment','Aktiv','Reserve','Pausiert'],p.status||'Assessment')}</select></div><div class="field"><label>Rolle</label><input id="e_role" type="text" value="${esc(p.role||'Esport-Fahrer')}" placeholder="z. B. Qualifying Driver"></div><div class="field"><label>Coach</label><input id="e_coach" type="text" value="${esc(p.coach||'')}" placeholder="Coach / Race Engineer"></div><div class="field"><label>Verfügbarkeit</label><input id="e_availability" type="text" value="${esc(p.availability||'')}" placeholder="z. B. Di/Do ab 19:00"></div></div><div class="grid cols-2"><div class="field"><label>Fahrerziel</label><textarea id="e_goal" class="analysis-note" placeholder="z. B. European Championship Qualification …">${esc(p.goal||'')}</textarea></div><div class="field"><label>Entwicklungsschwerpunkte</label><textarea id="e_focus" class="analysis-note" placeholder="z. B. Reifenmanagement, Racecraft …">${esc(p.focus||'')}</textarea></div></div><button class="btn primary" onclick="saveEsportDriver('${d.id||''}')">Esport-Profil speichern</button></div><div class="esport-analysis-grid"><section class="panel"><h2>Coaching <b>Board</b></h2><div class="field"><label>Aktuelle Stärke</label><textarea id="e_strengths" class="analysis-note">${esc(p.strengths||'')}</textarea></div><div class="field"><label>Coach-Notizen</label><textarea id="e_coachNotes" class="analysis-note">${esc(p.coachNotes||'')}</textarea></div><div class="field"><label>Nächste Coaching-Aktion</label><textarea id="e_nextAction" class="analysis-note">${esc(p.nextAction||'')}</textarea></div></section><section class="panel"><h2>Strecken <b>Analyse</b></h2><div class="field"><label>Strecke</label><select onchange="setEsportAnalysisTrack(this.value)">${ESPORT_TRACKS.map(track=>`<option ${track===ESPORT_PROFILE_TRACK?'selected':''}>${esc(track)}</option>`).join('')}</select></div><div class="grid cols-2"><div class="field"><label>Bestzeit / Zielzeit</label><input id="e_bestLap" type="text" value="${esc(a.bestLap||'')}" placeholder="1:32.450"></div><div class="field"><label>Race Pace</label><input id="e_racePace" type="text" value="${esc(a.racePace||'')}" placeholder="1:35.200 Ø"></div><div class="field"><label>Konsistenz 1–10</label><input id="e_consistency" type="number" min="1" max="10" value="${esc(a.consistency||'')}"></div><div class="field"><label>Telemetrie-Link</label><input id="e_telemetry" type="url" value="${esc(a.telemetry||'')}" placeholder="https://…"></div></div><div class="field"><label>Analyse / Action Items für ${esc(ESPORT_PROFILE_TRACK)}</label><textarea id="e_trackNotes" class="analysis-note" placeholder="Bremspunkte, Linien, Reifenfenster, nächste Tests …">${esc(a.notes||'')}</textarea></div><button class="btn gold" onclick="saveEsportDriver('${d.id||''}')">Analyse speichern</button><div class="footer-note">Analysen werden pro Strecke im Fahrerprofil geführt. ${Object.keys(analysis).length} / ${ESPORT_TRACKS.length} Strecken dokumentiert.</div></section></div>`;
}
function setEsportAnalysisTrack(track){ ESPORT_PROFILE_TRACK=track; render(); }
function saveEsportDriver(id){
  const value=key=>document.getElementById(key)?.value||''; let d=id?driverById(id):null;
  if(!d){d={id:uid(),createdAt:Date.now(),licenseStatus:'Nicht ausgestellt',history:[]};DB.drivers.push(d);}
  Object.assign(d,{firstName:value('e_firstName'),lastName:value('e_lastName'),number:value('e_number'),nationality:value('e_nationality'),teamId:value('e_teamId'),platform:value('e_platform'),simId:value('e_simId'),photoUrl:value('e_photoUrl')});
  d.esportProfile={...esportProfile(d),status:value('e_status'),role:value('e_role'),coach:value('e_coach'),availability:value('e_availability'),goal:value('e_goal'),focus:value('e_focus'),strengths:value('e_strengths'),coachNotes:value('e_coachNotes'),nextAction:value('e_nextAction'),trackAnalysis:{...esportProfile(d).trackAnalysis,[ESPORT_PROFILE_TRACK]:{bestLap:value('e_bestLap'),racePace:value('e_racePace'),consistency:value('e_consistency'),telemetry:value('e_telemetry'),notes:value('e_trackNotes'),updatedAt:new Date().toISOString()}}};
  persist.drivers(); go('esport-driverform',d.id);
}
function printDriverProfile(id){ const d=driverById(id); if(!d) return; const p=esportProfile(d); printDoc(`<div class="doc"><div class="doc-head"><div><div class="t1">CFC <span>ESPORT</span></div><div class="t2">Professional Driver Profile</div></div><div class="stw">${esc(d.number||'—')}</div></div><h3>${esc(driverName(d))}</h3><p>${esc(teamById(d.teamId)?.name||'Ohne Team')} · ${esc(p.role||'Esport-Fahrer')} · Coach: ${esc(p.coach||'—')}</p><h3>Entwicklung</h3><p>${nl2br(p.goal||'—')}</p><p>${nl2br(p.focus||'—')}</p><h3>Coaching</h3><p>${nl2br(p.coachNotes||'—')}</p><h3>Streckenanalyse</h3><table>${ESPORT_TRACKS.map(track=>{const a=p.trackAnalysis?.[track]||{};return `<tr><td class="k">${esc(track)}</td><td>${esc(a.bestLap||'—')} · ${esc(a.racePace||'—')} · ${esc(a.notes||'Keine Analyse')}</td></tr>`}).join('')}</table></div>`); }
function pageEsportSetup(){
  const track=ESPORT_TRACKS.includes(ROUTE.id)?ROUTE.id:ESPORT_TRACKS[0]; const saved=DB.esportSetups.find(item=>item.track===track); const values=saved?.values||{}; let previous='';
  const rows=SETUP_FIELDS.map(([category,label],index)=>{const categoryRow=category!==previous?`<tr><td colspan="2" class="setup-category">${category}</td></tr>`:'';previous=category;const key='s'+index;return categoryRow+`<tr><td>${label}</td><td><input id="${key}" type="text" value="${esc(values[key]||'')}" placeholder="Wert / Empfehlung"></td></tr>`;}).join('');
  return `<div class="pagehead"><div><div class="eyebrow">CFC Esport · Engineering Room</div><h1>F1 26 Setup Lab</h1></div><div class="actions"><button class="btn" onclick="go('esport')">← Management</button><button class="btn gold" onclick="go('esport-drivers')">Fahrerprofile</button></div></div><div class="panel"><div class="setup-toolbar"><div class="field"><label>Strecke</label><select onchange="go('esport-setup',this.value)">${ESPORT_TRACKS.map(item=>`<option value="${esc(item)}" ${item===track?'selected':''}>${esc(item)}</option>`).join('')}</select></div><div class="field"><label>Setup-Name</label><input id="setup_name" type="text" value="${esc(saved?.name||'Race Setup')}" placeholder="z. B. Qualifying trocken"></div><button class="btn primary" onclick="saveEsportSetup('${track}')">Setup speichern</button><button class="btn danger" onclick="deleteEsportSetup('${track}')">Setup löschen</button></div><div class="track-chips">${ESPORT_TRACKS.map(item=>`<button class="${item===track?'active':''}" onclick="go('esport-setup','${item}')">${esc(item)}</button>`).join('')}</div></div><div class="panel"><h2>F1 26 <b>Setup-Einstellungen</b></h2><p style="color:var(--grey);font-size:13px;margin-top:-4px;">Alle üblichen On-Track-Setupparameter sind pro Strecke und Setup-Version dokumentierbar. Verwende Zahlen, Bereiche oder kurze Notizen.</p><div class="setup-table-wrap"><table class="setup-table"><thead><tr><th>Parameter</th><th>Wert / Empfehlung</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function saveEsportSetup(track){ const values={}; SETUP_FIELDS.forEach((field,index)=>values['s'+index]=document.getElementById('s'+index)?.value||''); const current=DB.esportSetups.find(item=>item.track===track); const setup={id:current?.id||uid(),track,name:document.getElementById('setup_name')?.value||'Race Setup',values,updatedAt:new Date().toISOString()}; if(current) Object.assign(current,setup); else DB.esportSetups.push(setup); persist.esportSetups(); alert(`Setup für ${track} gespeichert.`); render(); }
function deleteEsportSetup(track){ const setup=DB.esportSetups.find(item=>item.track===track); if(!setup) return; if(!confirm(`Setup für ${track} löschen?`)) return; DB.esportSetups=DB.esportSetups.filter(item=>item.track!==track); persist.esportSetups(); render(); }

/* ============================= ROUTER / APP ============================= */
const App = {};
let ROUTE = {page:'dashboard', id:null};
let CASE_OPENING_SEEN = null;
let CASE_OPENING_MODE = 'none';

const PAGE_TIERS={
  dashboard:1,
  'tier-office':2,
  caseform:1,
  cases:1,
  drivers:1,
  drivercases:2,
  market:2,
  escalations:2,
  'escalations-t2':2,
  'escalations-t3':3,
  teams:1,
  transfers:2,
  finance:3,
  'finance-pay':3,
  processes:2,
  rulebook:2,
  manage:3,
  archive:3,
  esport:3,
  'esport-drivers':3,
  'esport-driverform':3,
  'esport-setup':3,
  'esport-presentation':3,
};
function canAccessPage(page){
  const requiredTier=PAGE_TIERS[page]??1;
  return Number(AUTH.profile?.access_tier||0)>=requiredTier;
}
function go(page, id){ if(!canAccessPage(page)){ alert(`Dieser Bereich ist erst ab Tier ${PAGE_TIERS[page]||1} freigegeben.`); return; } CASE_OPENING_MODE=page==='caseform'?(id?'existing':'new'):'none'; ROUTE = {page, id: id||null}; location.hash = '#'+page+(id?'/'+id:''); render(); window.scrollTo(0,0); }
function openIntegrations(){ MANAGE_TAB='integrations'; go('manage'); }
function pageTierOffice(){
  const tier=Number(AUTH.profile?.access_tier||2);
  const escalations=DB.escalations.filter(item=>tier>=3||Number(item.targetTier||3)===tier);
  const open=escalations.filter(item=>!['Zurück an Tier 1','Abgeschlossen'].includes(item.status));
  return `<div class="pagehead"><div><div class="eyebrow">Interne Prozesse · Tier ${tier}</div><h1>Tier-Arbeitsplatz</h1></div></div><div class="grid cols-3"><div class="stat red"><div class="n">${open.length}</div><div class="l">Offene Eskalierungen</div></div><div class="stat"><div class="n">${escalations.length}</div><div class="l">Zugewiesener Einblick</div></div><div class="stat green"><div class="n">${esc(AUTH.profile?.position||'Position offen')}</div><div class="l">Deine Position</div></div></div><section class="panel"><h2>Arbeitsbereich <b>Tier ${tier}</b></h2><p>Angemeldet als <strong>${esc(AUTH.profile?.display_name||AUTH.profile?.email)}</strong> · ${esc(AUTH.profile?.position||'Position nicht zugewiesen')}</p><div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 20px"><button class="btn primary" onclick="go('escalations')">Eskalierungen öffnen</button>${tier>=3?'<button class="btn gold" onclick="MANAGE_TAB=\'users\';go(\'manage\')">Benutzer &amp; Rollen</button>':''}</div><div style="overflow:auto"><table><thead><tr><th>Ziel</th><th>Fall</th><th>Grund</th><th>Status</th><th>Erstellt</th><th></th></tr></thead><tbody>${escalations.length?escalations.map(item=>`<tr><td>Tier ${Number(item.targetTier||3)}</td><td>${esc(item.stw||item.caseName||'Fall')}</td><td>${esc(item.reason||'—')}</td><td>${esc(item.status||'Offen')}</td><td>${fmtDateTime(item.escalatedAt)}</td><td><button class="btn small" onclick="go('escalations','${item.id}')">Öffnen</button></td></tr>`).join(''):'<tr><td colspan="6"><div class="empty">Keine Eskalierungen für dieses Tier.</div></td></tr>'}</tbody></table></div></section>`;
}
window.addEventListener('hashchange', ()=>{
  const h = location.hash.replace('#','');
  const [page,id] = h.split('/');
  if(page===ROUTE.page&&id===(ROUTE.id||null)) return;
  if(!canAccessPage(page||'dashboard')){ ROUTE={page:'dashboard',id:null}; location.hash='#dashboard'; render(); return; }
  CASE_OPENING_MODE='none';
  ROUTE = {page: page||'dashboard', id: id||null};
  render();
});

const NAV = [
  {id:'dashboard', label:'Dashboard', ic:'01'},
  {id:'tier-office', label:'Tier-Arbeitsplatz', ic:'00'},
  {id:'caseform', label:'Neue Akte', ic:'02'},
  {id:'cases', label:'Alle Akten', ic:'03'},
  {id:'drivers', label:'Fahrer', ic:'04'},
  {id:'drivercases', label:'Fahrer Cases', ic:'05'},
  {id:'market', label:'FAHRERMARKT', ic:'06'},
  {id:'escalations-t2', label:'ESKALIERUNG T2', ic:'07'},
  {id:'escalations', label:'ESKALIERUNGEN', ic:'07a'},
  {id:'escalations-t3', label:'ESKALIERUNG T3', ic:'07b'},
  {id:'teams', label:'Teams', ic:'08'},
  {id:'transfers', label:'Transfers', ic:'09'},
  {id:'finance', label:'Finanzen', ic:'10'},
  {id:'processes', label:'Prozesse', ic:'11'},
  {id:'rulebook', label:'Regelwerk', ic:'12'},
  {id:'manage', label:'Verwaltung', ic:'13'},
  {id:'archive', label:'Archiv', ic:'14'},
  {id:'esport', label:'CFC Esport', ic:'15'},
];

function renderNav(){
  const groups=[
    {tier:1,label:'Allgemeiner Bereich'},
    {tier:2,label:'Tier 2+'},
    {tier:3,label:'Tier 3'}
  ];
  document.getElementById('mainnav').innerHTML=groups.map(group=>{
    const items=NAV.filter(item=>canAccessPage(item.id)&&(PAGE_TIERS[item.id]??1)===group.tier);
    if(!items.length) return '';
    return `<div class="navgroup"><div class="navgroup-title">${group.label}</div>${items.map(item=>`
      <div class="navitem ${(ROUTE.page===item.id||(item.id==='esport'&&ROUTE.page.startsWith('esport')))?'active':''}" onclick="go('${item.id}')">
        <span class="ic">${item.ic}</span><span class="lbl">${item.label}</span>
      </div>`).join('')}</div>`;
  }).join('');
}

function render(){
  if(!AUTH.profile){ showLogin(); return; }
  if(!canAccessPage(ROUTE.page)){ ROUTE={page:'dashboard',id:null}; location.hash='#dashboard'; }
  document.body.dataset.page = ROUTE.page;
  if(ROUTE.page!=='caseform'){
    CASE_OPENING_SEEN = null;
    const overlay=document.getElementById('caseOpeningOverlay');
    if(overlay){
      overlay.hidden=true;
      overlay.classList.add('is-hidden');
      overlay.classList.remove('is-loading');
      overlay.innerHTML='';
    }
  }
  renderNav();
  const main = document.getElementById('main');
  if(ROUTE.page==='tier-office') main.innerHTML = pageTierOffice();
  else if(ROUTE.page==='dashboard') main.innerHTML = pageDashboard();
  else if(ROUTE.page==='caseform') main.innerHTML = pageCaseForm(ROUTE.id? DB.cases.find(c=>c.id===ROUTE.id): null);
  else if(ROUTE.page==='warningform') main.innerHTML = pageWarningForm(ROUTE.id);
  else if(ROUTE.page==='cases') main.innerHTML = pageCaseList();
  else if(ROUTE.page==='drivers') main.innerHTML = pageDriverList();
  else if(ROUTE.page==='drivercases') main.innerHTML = pageDriverCasesOverview();
  else if(ROUTE.page==='driverform') main.innerHTML = pageDriverForm(ROUTE.id? driverById(ROUTE.id): null);
  else if(ROUTE.page==='market') main.innerHTML = ROUTE.id ? pageMarketRequestDetail(ROUTE.id) : pageMarketOverview();
  else if(ROUTE.page==='escalations') main.innerHTML = ROUTE.id ? pageEscalationDetail(ROUTE.id) : pageEscalationHub();
  else if(ROUTE.page==='escalations-t2') main.innerHTML = ROUTE.id ? pageEscalationDetail(ROUTE.id) : pageEscalations(2);
  else if(ROUTE.page==='escalations-t3') main.innerHTML = ROUTE.id ? pageEscalationDetail(ROUTE.id) : pageEscalations(3);
  else if(ROUTE.page==='teams') main.innerHTML = pageTeams();
  else if(ROUTE.page==='transfers') main.innerHTML = pageTransfers();
  else if(ROUTE.page==='finance') main.innerHTML = pageFinance();
  else if(ROUTE.page==='finance-pay') main.innerHTML = pageFinancePayment(ROUTE.id);
  else if(ROUTE.page==='processes') main.innerHTML = pageProcesses();
  else if(ROUTE.page==='manage') main.innerHTML = pageManage();
  else if(ROUTE.page==='set-password') main.innerHTML = pageSetPassword();
  else if(ROUTE.page==='archive') main.innerHTML = ROUTE.id ? pageArchiveCase(ROUTE.id) : pageArchive();
  else if(ROUTE.page==='rulebook') main.innerHTML = pageRulebook();
  else if(ROUTE.page==='esport') main.innerHTML = ROUTE.id==='presentation' ? pageEsportPresentation() : pageEsport();
  else if(ROUTE.page==='esport-drivers') main.innerHTML = pageEsportDrivers();
  else if(ROUTE.page==='esport-driverform') main.innerHTML = pageEsportDriverForm(ROUTE.id?driverById(ROUTE.id):null);
  else if(ROUTE.page==='esport-setup') main.innerHTML = pageEsportSetup();
  else main.innerHTML = pageDashboard();
  if(ROUTE.page==='caseform'&&CASE_OPENING_MODE!=='none') showCaseOpening(CASE_OPENING_MODE,ROUTE.id);
  if(ROUTE.page==='cases') renderCaseTable();
  if(ROUTE.page==='drivers') renderDriverTable();
  if(ROUTE.page==='market' && !ROUTE.id) renderMarketTable();
  if(ROUTE.page==='manage'){ renderManageBody(); if(MANAGE_TAB==='integrations') renderPublicSharePanel(); }
}

function showCaseOpening(mode,caseId){
  if(ROUTE.page!=='caseform') return;
  const key=mode==='new'?'new':`existing-${caseId}`;
  if(CASE_OPENING_SEEN===key) return;
  CASE_OPENING_SEEN=key;
  const overlay=document.getElementById('caseOpeningOverlay');
  if(!overlay) return;
  const isNew=mode==='new';
  overlay.hidden=false;
  overlay.classList.remove('is-hidden');
  overlay.classList.remove('is-loading');
  if(!isNew) overlay.classList.add('is-loading');
  overlay.innerHTML=`<div class="case-opening-stage"><div class="case-opening-reactor" aria-hidden="true"></div><h2 class="case-opening-title">${isNew?'Willkommen bei Jarves':'Akte wird geladen'}</h2><p class="case-opening-copy">${isNew?'Mit erweiterten Funktionen kannst du ab sofort Jarves in den Akten nutzen.':'Jarves lädt die bestehende Akte für dich.'}</p><div class="case-opening-status">${isNew?'Jarves System wird initialisiert':'Akte wird geöffnet'}</div><div class="case-opening-progress" aria-hidden="true"><span></span></div></div>`;
  if(isNew){
    setTimeout(()=>{
      if(CASE_OPENING_SEEN!==key||overlay.hidden) return;
      overlay.classList.add('is-loading');
      overlay.querySelector('.case-opening-title').textContent='Akte wird geladen';
      overlay.querySelector('.case-opening-copy').textContent='Jarves bereitet die Aktenansicht vor.';
      overlay.querySelector('.case-opening-status').textContent='Ladefortschritt';
      overlay.querySelector('.case-opening-progress span').style.animation='caseLoading 4s ease-out forwards';
      setTimeout(()=>closeCaseOpening(overlay,key),4000);
    },6000);
  } else setTimeout(()=>closeCaseOpening(overlay,key),1650);
}
function closeCaseOpening(overlay,key){ if(CASE_OPENING_SEEN!==key) return; overlay.hidden=true; overlay.innerHTML=''; }

/* ============================= FINANCE ============================= */
const FINANCE_CATEGORIES = ['Startkapital','Sponsoring','Preisgeld','Teilnahmegebühr','Ticketverkauf','Rennveranstaltung','Streckenmiete','Server & Technik','Lizenzen','Marketing','Teamprämien','Reisekosten','Sonstiges'];
function pageFinance(){
  const settings=DB.financeSettings||{season:'2026',startingCapital:0,currency:'EUR'};
  const selectedTeam=ROUTE.id||document.getElementById('fin_team_filter')?.value||'';
  const selectedTeamData=selectedTeam?teamById(selectedTeam):null;
  const selectedTeamDrivers=selectedTeamData?DB.drivers.filter(driver=>driver.teamId===selectedTeamData.id).sort((a,b)=>driverName(a).localeCompare(driverName(b))):[];
  const selectedTeamTransactions=selectedTeamData?DB.finance.filter(transaction=>transaction.teamId===selectedTeamData.id):[];
  const teamRows=DB.teams.map(team=>{
    const logo=teamLogo(team);
    return `<button class="finance-team-card" style="--team-accent:${esc(team.color||'var(--gold)')}" onclick="openFinanceTeam('${team.id}',this)" aria-label="Finanzseite von ${esc(team.name)} öffnen">
      <span class="team-logo">${logo?`<img src="${logo}" alt="${esc(team.name)} Logo" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';">`:''}<span class="team-logo-fallback" style="${logo?'':'display:grid;'}">${esc(teamInitials(team))}</span></span>
      <span class="finance-team-name">${esc(team.name)}</span>
    </button>`;
  }).join('');
  const visibleTransactions=selectedTeamData?selectedTeamTransactions:DB.finance;
  const rows=[...visibleTransactions].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(t=>`<tr>
    <td>${fmtDate(t.date)}</td><td>${esc(teamById(t.teamId)?.name||'Liga gesamt')}</td><td>${esc(t.race||'—')}</td><td>${esc(t.category)}</td><td>${esc(t.description||'—')}</td>
    <td>${esc(t.counterparty||'—')}</td><td class="pts ${t.type==='income'?'green-text':'crit'}">${t.type==='income'?'+':'−'} ${financeAmount(t.amount)}</td>
    <td><span class="tag ${t.status==='Gebucht'?'decided':t.status==='Geplant'?'open':'archived'}">${esc(t.status)}</span></td>
    <td style="white-space:nowrap"><button class="btn small" onclick="editFinance('${t.id}')">Bearbeiten</button> ${t.type==='expense'?`<button class="btn small gold" onclick="sendFinanceDiscordNotification('${t.id}')">Discord senden</button>`:''} ${t.status==='Geplant'?`<button class="btn small gold" onclick="markFinancePaid('${t.id}')">Jetzt bezahlen</button>`:''} <button class="btn small danger" onclick="deleteFinance('${t.id}')">Löschen</button></td>
  </tr>`).join('');
  const accountLogo=selectedTeamData?teamLogo(selectedTeamData):'';
  const accountDrivers=selectedTeamDrivers.map(driver=>`<div class="finance-driver" onclick="go('driverform','${driver.id}')"><span class="driver-name">${esc(driverName(driver))}</span><span class="driver-number">${driver.number?`#${esc(driver.number)}`:'ohne Startnummer'}</span></div>`).join('');
  const accountPanel=selectedTeamData?`<div class="panel finance-team-account">
    <div class="finance-account-brand">
      <div class="finance-account-logo">${accountLogo?`<img src="${accountLogo}" alt="${esc(selectedTeamData.name)} Logo" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';">`:''}<span class="team-logo-fallback" style="${accountLogo?'':'display:grid;'}">${esc(teamInitials(selectedTeamData))}</span></div>
      <h2>${esc(selectedTeamData.name)}</h2><div class="team-country">${esc(selectedTeamData.country||'Teamakte')}</div>
    </div>
    <div class="finance-account-summary">
      <div class="stat green"><div class="n">${financeAmount(financeBalance(selectedTeamData.id))}</div><div class="l">Kontostand</div></div>
      <div class="stat green"><div class="n">${financeAmount(financeIncome(selectedTeamData.id))}</div><div class="l">Einnahmen</div></div>
      <div class="stat red"><div class="n">${financeAmount(financeExpense(selectedTeamData.id))}</div><div class="l">Ausgaben</div></div>
      <div class="finance-account-section" style="grid-column:1/-1;"><div class="sectiontitle" style="margin-top:0;">Aktuelle <b>Fahrer</b></div>${accountDrivers?`<div class="finance-driver-list">${accountDrivers}</div>`:'<div class="empty">Für dieses Team sind noch keine Fahrer registriert.</div>'}</div>
    </div>
  </div>`:'';
  return `<div class="pagehead"><div><div class="eyebrow">Teamführung · Saison ${esc(settings.season)}</div><h1>Finanzen${selectedTeamData?` · ${esc(selectedTeamData.name)}`:''}</h1></div><div class="actions">${selectedTeamData?'<button class="btn" onclick="go(\'finance\')">Alle Teams</button>':''}<button class="btn gold" onclick="openIntegrations()">Discord-Webhooks</button><button class="btn" onclick="go('manage')">Verwaltung öffnen</button></div></div>
  <div class="grid cols-4" style="margin-bottom:22px"><div class="stat green"><div class="n">${financeAmount(financeBalance(selectedTeam))}</div><div class="l">Kontostand${selectedTeam?' · Team':''}</div></div><div class="stat"><div class="n">${financeAmount(settings.startingCapital)}</div><div class="l">Startkapital je Team</div></div><div class="stat green"><div class="n">${financeAmount(financeIncome(selectedTeam))}</div><div class="l">Einnahmen</div></div><div class="stat red"><div class="n">${financeAmount(financeExpense(selectedTeam))}</div><div class="l">Ausgaben</div></div></div>
  ${accountPanel}
  <div class="panel"><h2>Team<b>konten</b></h2><p style="margin:-4px 0 16px;color:var(--grey);font-size:13px;">Wähle ein Team, um sein Finanzkonto und alle zugehörigen Buchungen zu öffnen.</p><div class="finance-team-gallery">${teamRows||'<div class="empty">Noch keine Teams angelegt.</div>'}</div></div>
  <div class="panel"><h2>Neue <b>Buchung</b></h2><div class="grid cols-4"><div class="field"><label>Team</label><select id="fin_team">${teamOptions('',true)}</select></div><div class="field"><label>Art</label><select id="fin_type"><option value="expense">Ausgabe / Rennkosten</option><option value="income">Einnahme</option></select></div><div class="field"><label>Betrag (${esc(settings.currency)})</label><input id="fin_amount" type="number" min="0" step="0.01" placeholder="0,00"></div><div class="field"><label>Datum</label><input id="fin_date" type="date" value="${today()}"></div></div><div class="grid cols-4"><div class="field"><label>Grand Prix / Rennen</label><input id="fin_race" type="text" placeholder="z. B. GP Monaco"></div><div class="field"><label>Kategorie</label><select id="fin_category">${selectOptions(FINANCE_CATEGORIES,'Rennveranstaltung')}</select></div><div class="field"><label>Beschreibung</label><input id="fin_description" type="text" placeholder="z. B. Streckenmiete und Marshalling"></div><div class="field"><label>Partner / Empfänger</label><input id="fin_counterparty" type="text" placeholder="z. B. Circuit de Monaco"></div></div><div class="grid cols-4"><div class="field"><label>Status</label><select id="fin_status"><option>Gebucht</option><option>Geplant</option><option>Storniert</option></select></div><div class="field" style="display:flex;align-items:flex-end"><button class="btn primary" onclick="saveFinance()">Buchung speichern</button></div></div></div>
  <div class="panel"><h2>Finanz<b>journal</b></h2><div class="searchbar"><select id="fin_team_filter" onchange="go('finance',this.value)"><option value="">Alle Teams</option>${teamOptions(selectedTeam,false)}</select></div><div style="overflow:auto"><table><thead><tr><th>Datum</th><th>Team</th><th>Rennen</th><th>Kategorie</th><th>Beschreibung</th><th>Partner</th><th>Betrag</th><th>Status</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="9"><div class="empty"><b>Noch keine Finanzbuchungen</b>Erfasse Startkapital, Sponsoren, Rennkosten oder Preisgelder.</div></td></tr>'}</tbody></table></div></div>`;
}
function pageFinancePayment(id){
  const t=DB.finance.find(item=>item.id===id);
  if(!t) return '<div class="panel"><h2>Zahlung nicht gefunden</h2><p class="empty">Dieser Finanzposten existiert nicht mehr.</p></div>';
  return `<div class="pagehead"><div><div class="eyebrow">ZFC Racing Finance</div><h1>Zahlung bestätigen</h1></div></div><div class="panel"><h2>Finanz<b>freigabe</b></h2><table><tbody><tr><td>Rennen</td><td>${esc(t.race||'—')}</td></tr><tr><td>Beschreibung</td><td>${esc(t.description||t.category)}</td></tr><tr><td>Empfänger</td><td>${esc(t.counterparty||'—')}</td></tr><tr><td>Betrag</td><td class="pts">${financeAmount(t.amount)}</td></tr><tr><td>Status</td><td>${esc(t.status)}</td></tr></tbody></table><div style="display:flex;gap:10px;margin-top:22px"><button class="btn primary" onclick="markFinancePaid('${t.id}')">Zahlung jetzt buchen</button><button class="btn" onclick="go('finance')">Abbrechen</button></div></div>`;
}
let EDIT_FINANCE_ID=null;
function editFinance(id){ const t=DB.finance.find(x=>x.id===id); if(!t) return; EDIT_FINANCE_ID=id; render(); setTimeout(()=>{ ['team','type','amount','date','race','category','description','counterparty','status'].forEach(k=>{const el=document.getElementById('fin_'+k); if(el) el.value=t[k==='date'?'date':k]??'';}); document.querySelector('#fin_amount')?.focus(); },0); }
async function saveFinance(){
  const value=id=>document.getElementById('fin_'+id).value; const amount=Number(value('amount'));
  if(!amount || amount<0){ alert('Bitte einen gültigen Betrag eintragen.'); return; }
  let t=EDIT_FINANCE_ID?DB.finance.find(x=>x.id===EDIT_FINANCE_ID):null;
  if(!t){ t={id:uid(),createdAt:new Date().toISOString()}; DB.finance.push(t); }
  Object.assign(t,{season:DB.financeSettings.season,teamId:value('team'),race:value('race'),date:value('date'),type:value('type'),category:value('category'),description:value('description'),amount,counterparty:value('counterparty'),status:value('status'),updatedAt:new Date().toISOString()});
  EDIT_FINANCE_ID=null; await persist.finance(); await syncFinanceTransaction(t); if(t.status==='Geplant'&&t.type==='expense') await sendFinanceDiscordNotification(t); render();
}
async function deleteFinance(id){ if(!confirm('Diese Finanzbuchung wirklich löschen?')) return; DB.finance=DB.finance.filter(t=>t.id!==id); await persist.finance(); if(SUPABASE.client) await SUPABASE.client.from('zfc_finance_transactions').delete().eq('id',id); render(); }
async function markFinancePaid(id){ const t=DB.finance.find(item=>item.id===id); if(!t) return; if(t.status==='Gebucht'){ go('finance'); return; } if(!confirm(`Zahlung über ${financeAmount(t.amount)} wirklich buchen?`)) return; t.status='Gebucht'; t.paidAt=new Date().toISOString(); await persist.finance(); await syncFinanceTransaction(t); go('finance'); }

/* ============================= DASHBOARD ============================= */
function pageDashboard(){
  const total = DB.cases.length;
  const open = DB.cases.filter(c=>c.status==='Neu'||c.status==='Offen'||c.status==='In Untersuchung').length;
  const activeLic = DB.drivers.filter(d=>d.licenseStatus==='Aktiv').length;
  const suspRev = DB.drivers.filter(d=>d.licenseStatus==='Ausgesetzt'||d.licenseStatus==='Entzogen').length;

  const catCount = {};
  DB.cases.forEach(c=> catCount[c.category] = (catCount[c.category]||0)+1);
  const catMax = Math.max(1, ...Object.values(catCount));
  const catRows = Object.entries(catCount).sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(([k,v])=>`<div class="barrow"><div class="lbl">${esc(k)}</div><div class="track"><div class="fill" style="width:${(v/catMax*100)}%"></div></div><div class="val">${v}</div></div>`).join('')
    || `<div class="empty">Noch keine Akten erfasst.</div>`;

  const teamCount = {};
  DB.cases.forEach(c=>{ if(c.teamInvolved) teamCount[c.teamInvolved]=(teamCount[c.teamInvolved]||0)+1; });
  const teamRows = Object.entries(teamCount).sort((a,b)=>b[1]-a[1]).slice(0,11).map(([tid,v])=>{
    const t = teamById(tid); if(!t) return '';
    return `<tr><td><span class="teamchip"><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</span></td><td class="pts">${v}</td></tr>`;
  }).join('') || `<tr><td colspan="2" style="color:var(--grey-2)">Keine Daten</td></tr>`;

  const recent = [...DB.cases].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,6);
  const recentRows = recent.map(c=>{
    const dt = driverById(c.driverInvolved), tt = teamById(c.teamInvolved);
    return `<tr class="rowlink" onclick="go('caseform','${c.id}')">
      <td class="pts">${esc(c.stw)}</td>
      <td>${esc(c.event||'—')}</td>
      <td>${tt? `<span class="teamchip"><span class="dot" style="background:${tt.color}"></span>${esc(tt.name)}</span>`:'—'}</td>
      <td>${esc(driverName(dt))}</td>
      <td>${esc(c.category||'—')}</td>
      <td><span class="tag ${statusTagClass(c.status)}">${esc(c.status)}</span></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" style="color:var(--grey-2)">Noch keine Akten vorhanden.</td></tr>`;

  const nextCase = [...DB.cases].sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0))[0];
  return `
  <div class="dashboard-home">
    <section class="dashboard-hero">
      <div class="dashboard-hero-content">
        <div class="eyebrow">ZFC Racing · Race Control Platform</div>
        <h1>Stewards<br><span>Office</span></h1>
        <p>Die zentrale Rennleitung für Fallaufnahme, Beweissicherung und nachvollziehbare Entscheidungen in der ZFC Racing Series.</p>
        <div class="dashboard-hero-actions"><button class="btn primary" onclick="go('caseform')">+ Neue Akte eröffnen</button><button class="btn gold" onclick="go('cases')">Aktenzentrale öffnen</button></div>
        <div class="dashboard-hero-meta"><div><strong>${total}</strong>Akten im System</div><div><strong>${open}</strong>offene Vorgänge</div><div><strong>${nextCase?.stw||'—'}</strong>zuletzt aktiv</div></div>
      </div>
    </section>

    <div class="dashboard-section-head"><h2>Race Control <b>Shortcuts</b></h2><span>Arbeitsbereiche</span></div>
    <div class="dashboard-quicklinks">
      <div class="dashboard-quicklink" onclick="go('caseform')"><span class="quick-no">01</span><div><strong>Fall eröffnen</strong><span>Vorfall dokumentieren</span></div></div>
      <div class="dashboard-quicklink" onclick="go('cases')"><span class="quick-no">02</span><div><strong>Akten prüfen</strong><span>Status und Entscheidungen</span></div></div>
      <div class="dashboard-quicklink" onclick="go('drivers')"><span class="quick-no">03</span><div><strong>Fahrerregister</strong><span>Lizenzen und Profile</span></div></div>
      <div class="dashboard-quicklink" onclick="go('rulebook')"><span class="quick-no">04</span><div><strong>Regelwerk</strong><span>Sportliche Grundlage</span></div></div>
    </div>

  <div class="grid cols-4" style="margin-bottom:22px;">
    <div class="stat"><div class="n">${total}</div><div class="l">Akten gesamt</div></div>
    <div class="stat amber"><div class="n">${open}</div><div class="l">Offen / in Untersuchung</div></div>
    <div class="stat green"><div class="n">${activeLic}</div><div class="l">Aktive Lizenzen</div></div>
    <div class="stat red"><div class="n">${suspRev}</div><div class="l">Ausgesetzt / entzogen</div></div>
  </div>

  <div class="grid cols-2">
    <div class="panel">
      <h2>Vergehen nach <b>Kategorie</b></h2>
      ${catRows}
    </div>
    <div class="panel">
      <h2>Fälle nach <b>Team</b></h2>
      <table><thead><tr><th>Team</th><th>Fälle</th></tr></thead><tbody>${teamRows}</tbody></table>
    </div>
  </div>

  <div class="panel">
    <h2>Zuletzt bearbeitete <b>Akten</b></h2>
    <table><thead><tr><th>STW-Nr.</th><th>Event</th><th>Team</th><th>Fahrer</th><th>Kategorie</th><th>Status</th></tr></thead>
    <tbody>${recentRows}</tbody></table>
  </div>
  <div class="footer-note">ZFC RACING STEWARD-SYSTEM // Sportliche Integrität durch konsistente Entscheidungsfindung.</div>
  `;
}

function jarvesText(value){
  return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function jarvesWords(value){
  return new Set(jarvesText(value).split(/[^a-z0-9äöüß]+/).filter(word=>word.length>3));
}
function jarvesCaseDraft(caseData){
  const value=id=>document.getElementById(id)?.value?.trim()||'';
  const driverId=document.getElementById('f_driverInvolved')?.value||caseData.driverInvolved||'';
  return {
    ...caseData,
    event:value('f_event')||caseData.event||'',
    sessionType:value('f_sessionType')||caseData.sessionType||'',
    category:value('f_category')||caseData.category||'',
    incidentLap:value('f_incidentLap')||caseData.incidentLap||'',
    driverInvolved:driverId,
    description:value('f_description')||caseData.description||'',
    evidenceLink:value('f_evidenceLink')||caseData.evidenceLink||'',
    investigationNotes:value('f_investigationNotes')||caseData.investigationNotes||'',
    regulationBreach:value('f_regulationBreach')||caseData.regulationBreach||''
  };
}
function jarvesMatchingRules(draft){
  const source=jarvesText(`${draft.category} ${draft.description} ${draft.investigationNotes}`);
  const keywordGroups=[
    ['Überholmanöver',['uberholen','überholen','divebomb','angriff','überlappung']],
    ['Verteidigung der Position',['verteidigen','blockieren','abwehren','spurwechsel']],
    ['Verursachen von Kollisionen',['kollision','kontakt','crash','unfall','zusammenstoss','zusammenstoß']],
    ['Auffahrunfälle',['auffahren','hinten','bremsen','heck']],
    ['Verlassen der Strecke und Vorteilserlangung',['abkürzen','strecke verlassen','track limits','vorteil']],
    ['Rückkehr auf die Strecke',['rückkehr','zurück auf die strecke','wieder auf die strecke']],
    ['Bremsen und Brake Checking',['brake check','bremsprüfung','unerwartet bremsen']],
    ['Unsportliches Verhalten auf der Strecke',['unsportlich','provokation','absicht','gegen die fahrtrichtung']],
    ['Rennstart',['start','formation','jump start','frühstart']],
    ['Turn 1 und erste Rennphase',['erste kurve','turn 1','erste runde','erste phase']]
  ];
  const matches=keywordGroups.filter(([,keywords])=>keywords.some(keyword=>source.includes(jarvesText(keyword)))).map(([title])=>RULEBOOK_SECTIONS.find(section=>section.title===title)).filter(Boolean);
  if(!matches.length){
    const categoryMatch=RULEBOOK_SECTIONS.find(section=>source.includes(jarvesText(section.title)));
    if(categoryMatch) matches.push(categoryMatch);
  }
  return matches.slice(0,3);
}
function jarvesRepeatAnalysis(draft){
  if(!draft.driverInvolved) return {cases:[],score:0};
  const currentWords=jarvesWords(`${draft.category} ${draft.description}`);
  const previous=DB.cases.filter(item=>item.id!==draft.id&&item.driverInvolved===draft.driverInvolved&&(item.status==='Entschieden'||item.status==='Archiviert')).map(item=>{
    const oldWords=jarvesWords(`${item.category} ${item.description}`);
    const shared=[...currentWords].filter(word=>oldWords.has(word)).length;
    const sameCategory=jarvesText(item.category)===jarvesText(draft.category)&&Boolean(draft.category);
    return {...item,shared,sameCategory,score:(sameCategory?3:0)+Math.min(shared,4)};
  }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
  return {cases:previous,score:previous[0]?.score||0};
}
function jarvesHash(value){ return [...String(value||'')].reduce((hash,char)=>(hash*31+char.charCodeAt(0))>>>0,7); }
function jarvesSentences(value){ return String(value||'').replace(/\s+/g,' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean); }
function jarvesProfessionalText(input,draft){
  const clean=String(input||'').trim().replace(/\s+/g,' ');
  if(!clean) return '';
  const seed=jarvesHash(clean);
  const sentences=jarvesSentences(clean).map(sentence=>sentence.charAt(0).toUpperCase()+sentence.slice(1).replace(/[.!?]+$/,'')+'.');
  const driver=draft.driverInvolved?driverName(driverById(draft.driverInvolved)):'der betroffene Fahrer';
  const context=[draft.event,draft.sessionType,draft.incidentLap].filter(Boolean).join(', ');
  const openings=[`Nach Auswertung der vorliegenden Angaben war ${driver}`,`Aus der bisherigen Aktenaufnahme ergibt sich, dass ${driver}`,`Gegenstand der Prüfung ist ein Vorfall, an dem ${driver}`];
  const transitions=['Im weiteren Ablauf ist festzuhalten:','Der konkrete Ablauf wird wie folgt zusammengefasst:','Für die sportrechtliche Prüfung ist insbesondere folgender Ablauf maßgeblich:'];
  const review=['Die Bewertung hat sich auf die Kontrolle des Fahrzeugs, die Vorhersehbarkeit des Manövers und die Möglichkeit einer sicheren Vermeidung zu beziehen.','Für die Würdigung sind Ausgangslage, Abstand, Geschwindigkeit, verfügbare Fahrbahn und die Reaktion der Beteiligten getrennt zu betrachten.','Maßgeblich sind die konkrete Überlappung, die gewählte Linie, die Reaktionsmöglichkeit des jeweils anderen Fahrers und die unmittelbare Auswirkung auf das Renngeschehen.'];
  const setting=context?` ${context}`:' in der betreffenden Rennsession';
  const category=draft.category?` Der Vorgang wird vorläufig der Kategorie „${draft.category}“ zugeordnet.`:'';
  const evidence=draft.evidenceLink?` Der hinterlegte Replay- oder Telemetrieverweis ist mit den Fahrzeugpositionen, Abständen und entstandenen Zeit- oder Positionsverlusten abzugleichen.`:' Zur abschließenden Feststellung sind Replay, Onboard-Aufnahmen und gegebenenfalls Telemetriedaten heranzuziehen.';
  const rule=draft.regulationBreach?` Die Prüfung erfolgt dabei insbesondere im Hinblick auf „${draft.regulationBreach}“.`:' Die einschlägige Regelstelle und der konkrete Strafrahmen sind nach Abschluss der Beweismittelprüfung festzulegen.';
  const incident=sentences.length>1?sentences.join(' '):sentences[0];
  return `SACHVERHALT\n${openings[seed%openings.length]}${setting} an dem nachfolgend dokumentierten Ereignis beteiligt.\n\n${transitions[(seed>>3)%transitions.length]}\n${incident}${category}\n\nVORLÄUFIGE WÜRDIGUNG\n${review[(seed>>6)%review.length]} ${evidence}${rule}\n\nPRÜFHINWEIS\nDiese Fassung gibt ausschließlich die eingegebene Kurzbeschreibung und die derzeit bekannten Falldaten wieder. Sie stellt keine abschließende Schuld- oder Sanktionsentscheidung dar; die endgültige Bewertung obliegt den Stewards nach vollständiger Sichtung der Beweismittel.`;
}
function jarvesResult(title,content){
  const result=document.getElementById('jarves_result');
  if(!result) return;
  result.innerHTML=`<h4>${esc(title)}</h4>${content}`;
  result.classList.add('is-visible');
}
function jarvesOpen(){
  const launcher=document.getElementById('jarves_launcher'), panel=document.getElementById('jarves_panel'), welcome=document.getElementById('jarves_welcome');
  if(!launcher||!panel) return;
  launcher.classList.add('is-hidden'); panel.classList.remove('is-closed');
  if(welcome){ welcome.classList.remove('is-playing'); void welcome.offsetWidth; welcome.classList.add('is-playing'); }
}
function jarvesClose(){
  document.getElementById('jarves_panel')?.classList.add('is-closed');
  document.getElementById('jarves_launcher')?.classList.remove('is-hidden');
}
function jarvesTab(tab){
  document.querySelectorAll('.jarves-tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
  document.querySelectorAll('.jarves-view').forEach(view=>view.classList.toggle('active',view.dataset.view===tab));
}
function jarvesRewrite(){
  const draft=jarvesCaseDraft(DB.cases.find(item=>item.id===ROUTE.id)||{});
  const input=document.getElementById('jarves_prompt')?.value.trim()||draft.description;
  if(!input){ jarvesResult('Jarves wartet auf Text','<p>Bitte zuerst eine kurze Beschreibung eingeben.</p>'); return; }
  const professional=jarvesProfessionalText(input,draft);
  const output=document.getElementById('jarves_output');
  if(output) output.value=professional;
  jarvesResult('Sachverhalt erstellt','<p>Die ausführliche Fassung ist bereit. Prüfe sie und kopiere sie anschließend manuell in das Beschreibungsfeld der Akte.</p>');
}
async function jarvesCopyText(){
  const output=document.getElementById('jarves_output');
  if(!output?.value){ jarvesResult('Noch kein Text vorhanden','<p>Erstelle zuerst einen Sachverhalt.</p>'); return; }
  try{ await navigator.clipboard.writeText(output.value); }
  catch(error){ output.select(); document.execCommand('copy'); }
  jarvesResult('Sachverhalt kopiert','<p>Der Text liegt jetzt in der Zwischenablage. Füge ihn manuell in „Beschreibung des Vorfalls“ ein.</p>');
}
function jarvesAnalyzeCurrent(){
  const draft=jarvesCaseDraft(DB.cases.find(item=>item.id===ROUTE.id)||{});
  const rules=jarvesMatchingRules(draft), repeat=jarvesRepeatAnalysis(draft);
  const ruleHtml=rules.length?`<p><b>Voraussichtlich relevante Regelstellen:</b></p><ul>${rules.map(rule=>`<li><b>${esc(rule.title)}</b> — ${esc(rule.text)}</li>`).join('')}</ul>`:'<p>Keine eindeutige Regelstelle erkannt. Bitte Sachverhalt und Beweismittel präzisieren.</p>';
  const repeatHtml=repeat.cases.length?`<p><b>Hinweis auf möglichen Wiederholungsfall:</b> ${repeat.cases.length} frühere Akte mit vergleichbaren Merkmalen.</p><ul>${repeat.cases.slice(0,3).map(item=>`<li>${esc(item.stw||'Akte')} · ${esc(item.category||'ohne Kategorie')} · ${esc(item.status||'ohne Status')}</li>`).join('')}</ul>`:'<p><b>Kein Wiederholungsfall erkannt.</b> Es wurde keine passende entschiedene oder archivierte Akte für diesen Fahrer gefunden.</p>';
  jarvesResult('Fallanalyse',`${ruleHtml}<p class="jarves-note">Jarves liefert eine redaktionelle Vorprüfung. Die endgültige Bewertung bleibt bei den Stewards.</p>`);
  const hints=document.getElementById('jarves_analysis_hints');
  if(hints){ hints.innerHTML=`<h4>Weitere Analysepunkte</h4>${repeatHtml}<p>Prüfe zusätzlich Fahrzeugpositionen, Abstand, Reaktion, mögliche Vermeidbarkeit und die unmittelbare Auswirkung auf das Renngeschehen.</p>`; hints.classList.add('is-visible'); }
}
function jarvesApplyRules(){
  const draft=jarvesCaseDraft(DB.cases.find(item=>item.id===ROUTE.id)||{}), rules=jarvesMatchingRules(draft), field=document.getElementById('f_regulationBreach');
  if(!rules.length){ jarvesResult('Regelwerk','<p>Keine eindeutige Regelstelle erkannt. Beschreibe Manöver, Kontakt, Strecke und Folge möglichst konkret.</p>'); return; }
  const value=rules.map(rule=>rule.title).join(' · ');
  if(field) field.value=value;
  jarvesResult('Regelwerk zugeordnet',`<p>${rules.map(rule=>`<b>${esc(rule.title)}</b>: ${esc(rule.text)}`).join('</p><p>')}</p><p class="jarves-note">Die Zuordnung wurde in das Feld „Klarer Regelverstoß“ übernommen.</p>`);
}
function jarvesAnalyzeAll(){
  const draft=jarvesCaseDraft(DB.cases.find(item=>item.id===ROUTE.id)||{}), driverId=draft.driverInvolved;
  if(!driverId){ jarvesResult('Alle Fälle analysieren','<p>Bitte zuerst einen betroffenen Fahrer auswählen.</p>'); return; }
  const related=casesForDriver(driverId).filter(item=>item.driverInvolved===driverId), decided=related.filter(item=>item.status==='Entschieden'||item.status==='Archiviert'), points=decided.reduce((sum,item)=>sum+(parseInt(item.penaltyPoints)||0),0);
  jarvesResult('Fahrerakte analysiert',`<p><b>${esc(driverName(driverById(driverId)))}</b> erscheint in ${related.length} Akte(n), davon ${decided.length} entschieden oder archiviert.</p><p>Gesammelte Strafpunkte aus entschiedenen Akten: <b>${points}</b>.</p>${decided.length?`<ul>${decided.slice(0,6).map(item=>`<li>${esc(item.stw||'Akte')} · ${esc(item.category||'ohne Kategorie')} · ${esc(item.decision||'ohne Entscheidung')}</li>`).join('')}</ul>`:'<p>Noch keine abgeschlossenen Fälle zur Wiederholungsprüfung vorhanden.</p>'}<p class="jarves-note">Diese Übersicht unterstützt die Prüfung und ersetzt keine Steward-Entscheidung.</p>`);
}
function jarvesCasePanel(caseData){
  return `<div id="jarves_launcher" class="jarves-launcher"><button class="jarves-launch-button" aria-label="Jarves öffnen" onclick="jarvesOpen()"></button><div class="jarves-launch-copy"><strong>Jarves öffnen</strong><span>Dein Assistent für Sachverhalt und Fallanalyse</span></div></div><section id="jarves_panel" class="jarves-panel is-closed"><div class="jarves-head"><div class="jarves-identity"><div class="jarves-avatar">J</div><div><strong>Jarves</strong><small>Fallanalyse-Agent · lokal verfügbar</small></div></div><div><span class="jarves-status">Bereit für Analyse</span><button class="btn small" onclick="jarvesClose()" style="display:block;margin-top:7px;margin-left:auto;">Schließen</button></div></div><div class="jarves-body"><div id="jarves_welcome" class="jarves-welcome">Willkommen bei Jarves · dein Assistent</div><div class="jarves-tabs"><button class="jarves-tab active" data-tab="writer" onclick="jarvesTab('writer')">Sachverhalt erstellen</button><button class="jarves-tab" data-tab="analysis" onclick="jarvesTab('analysis')">Akte analysieren</button></div><div class="jarves-view active" data-view="writer"><p>Gib nur eine kurze, stichwortartige Zusammenfassung des Vorfalls ein. Jarves erstellt daraus eine ausführliche sachliche Fassung.</p><div class="jarves-input"><textarea id="jarves_prompt" placeholder="z. B. Fahrer drängte Gegner in Kurve 4 von der Strecke und behielt die Position"></textarea><button class="btn primary" onclick="jarvesRewrite()">Text erstellen</button></div><textarea id="jarves_output" class="jarves-output" readonly placeholder="Die ausführliche Fassung erscheint hier. Sie wird nicht automatisch in die Akte übernommen."></textarea><div class="jarves-copy-row"><span class="jarves-note">Manuell prüfen und anschließend in die Beschreibung kopieren.</span><button class="btn gold" onclick="jarvesCopyText()">Text kopieren</button></div></div><div class="jarves-view" data-view="analysis"><p>Hier kannst du die aktuelle Akte und passende Regelstellen prüfen.</p><div class="jarves-actions"><button class="btn" onclick="jarvesApplyRules()">Regelwerk zuordnen</button><button class="btn" onclick="jarvesAnalyzeCurrent()">Diesen Fall analysieren</button><button class="btn" onclick="jarvesAnalyzeAll()">Alle Fälle des Fahrers</button></div><div id="jarves_result" class="jarves-result" aria-live="polite"></div><div id="jarves_analysis_hints" class="jarves-analysis-hints" aria-live="polite"></div></div></div></section>`;
}

/* ============================= CASE FORM (AKTE) ============================= */
function pageCaseForm(existing){
  const c = existing || {
    id:null, stw:null, season:'2026', status:'Neu', createdAt:null,
    event:'', sessionType:'Rennen', incidentLap:'', category:CATEGORIES[0], reportedBy:REPORTED_BY[0],
    teamInvolved:'', driverInvolved:'', teamAffected:'', driverAffected:'',
    description:'', investigationNotes:'', evidenceLink:'', regulationBreach:'', precedent:'',
    hearingHeld:false, decision:DECISIONS[0], decisionDetail:'', penaltyPoints:0,
    licenseStatusAfter:LICENSE_AFTER[0], licenseStatusDetail:'',
    stewardChairman:'', steward2:'', steward3:'', history:[]
  };
  const isNew = !existing;
  const stwDisplay = c.stw || nextStw() + ' (Vorschau)';

  return `
  <div class="pagehead">
    <div><div class="eyebrow">${isNew?'Neue Akte':'Akte bearbeiten'}</div><h1>Steward-Fall</h1></div>
    <div class="actions">
      <button class="btn" onclick="go('cases')">← Zur Übersicht</button>
    </div>
  </div>

  <div class="dossier">
    <div class="dossier-head">
      <div><div class="stwlabel">Aktennummer</div><div class="stwno">${esc(stwDisplay)}</div></div>
        <div style="text-align:right">
        <div class="stwlabel">Status</div>
        ${isNew ? '<span class="tag open">Neu</span>' : `<select id="f_status" style="width:auto;">${selectOptions(CASE_STATUS, c.status)}</select>`}
      </div>
    </div>
    <div class="dossier-body">

      <div class="sectiontitle">Grunddaten</div>
      <div class="grid cols-3">
        <div class="field"><label>Saison</label><select id="f_season">${selectOptions(['2025','2026','2027'], c.season)}</select></div>
        <div class="field"><label>Grand Prix / Event</label><input list="gplist" id="f_event" type="text" value="${esc(c.event)}" placeholder="z. B. GP Monaco"><datalist id="gplist">${EVENTS.map(e=>`<option value="${esc(e)}">`).join('')}</datalist></div>
        <div class="field"><label>Session</label><select id="f_sessionType">${selectOptions(SESSION_TYPES, c.sessionType)}</select></div>
      </div>
      <div class="grid cols-3">
        <div class="field"><label>Zeitpunkt (Runde / Minute)</label><input id="f_incidentLap" type="text" value="${esc(c.incidentLap)}" placeholder="z. B. Runde 34"></div>
        <div class="field"><label>Kategorie</label><select id="f_category">${selectOptions(CATEGORIES, c.category)}</select></div>
        <div class="field"><label>Meldung durch</label><select id="f_reportedBy">${selectOptions(REPORTED_BY, c.reportedBy)}</select></div>
      </div>

      <div class="sectiontitle">Beteiligte</div>
      <div class="grid cols-2">
        <div class="field"><label>Betroffenes / beschuldigtes Team</label>
          <select id="f_teamInvolved" onchange="onCaseTeamChange('involved')">${teamOptions(c.teamInvolved, true)}</select>
        </div>
        <div class="field"><label>Betroffener Fahrer</label>
          <select id="f_driverInvolved">${driverOptionsForTeam(c.teamInvolved, c.driverInvolved)}</select>
        </div>
        <div class="field"><label>Geschädigtes Team (falls zutreffend)</label>
          <select id="f_teamAffected" onchange="onCaseTeamChange('affected')">${teamOptions(c.teamAffected, true)}</select>
        </div>
        <div class="field"><label>Geschädigter Fahrer (falls zutreffend)</label>
          <select id="f_driverAffected">${driverOptionsForTeam(c.teamAffected, c.driverAffected)}</select>
        </div>
      </div>

      ${jarvesCasePanel(c)}

      <div class="sectiontitle">Sachverhalt</div>
      <div class="field"><label>Beschreibung des Vorfalls</label><textarea id="f_description" placeholder="Objektive Schilderung des Vorfalls …">${esc(c.description)}</textarea></div>
      <div class="grid cols-2">
        <div class="field"><label>Beweismittel (Video-/Telemetrie-Link)</label><input id="f_evidenceLink" type="text" value="${esc(c.evidenceLink)}" placeholder="https://…"></div>
        <div class="field"><label class="checkline" style="margin-top:26px;"><input type="checkbox" id="f_hearingHeld" ${c.hearingHeld?'checked':''}> Anhörung der Beteiligten durchgeführt</label></div>
      </div>
      <div class="field"><label>Untersuchung / Anmerkungen der Stewards</label><textarea id="f_investigationNotes" placeholder="Notizen aus der Untersuchung, Aussagen, Abwägungen …">${esc(c.investigationNotes)}</textarea></div>
      <div class="grid cols-2">
        <div class="field"><label>Klarer Regelverstoß (Artikel-Referenz)</label><input id="f_regulationBreach" type="text" value="${esc(c.regulationBreach)}" placeholder="z. B. Art. 27.3 Sportliches Reglement"></div>
        <div class="field"><label>Vergleichbare frühere Fälle (Präzedenzfall)</label><input id="f_precedent" type="text" value="${esc(c.precedent)}" placeholder="z. B. STW-378945"></div>
      </div>

      ${isNew ? '<div class="panel" style="margin-top:26px;margin-bottom:0;"><h2>Akte zuerst <b>anlegen</b></h2><p style="margin:0;color:var(--grey);">Trage die Grunddaten und eine objektive Fallbeschreibung ein. Nach dem Anlegen wird die Akte mit Status „Neu“ gespeichert und kann anschließend vollständig ausgewertet werden.</p></div>' : '<div class="sectiontitle">Entscheidung</div>'}
      ${isNew ? '' : `
      <div class="grid cols-2">
        <div class="field"><label>Entscheidung</label><select id="f_decision">${selectOptions(DECISIONS, c.decision)}</select></div>
        <div class="field"><label>Strafpunkte (auf Superlizenz)</label><input id="f_penaltyPoints" type="number" min="0" max="12" value="${c.penaltyPoints||0}"></div>
      </div>
      <div class="field"><label>Detail zur Strafe / Begründung der Entscheidung</label><textarea id="f_decisionDetail" placeholder="z. B. „Fahrer #23 verursachte die Kollision durch verspätetes Bremsen und erhält …“">${esc(c.decisionDetail)}</textarea></div>
      <div class="grid cols-2">
        <div class="field"><label>Status der Fahrlizenz nach diesem Vorfall</label><select id="f_licenseStatusAfter">${selectOptions(LICENSE_AFTER, c.licenseStatusAfter)}</select></div>
        <div class="field"><label>Detail (z. B. Anzahl gesperrter Rennen)</label><input id="f_licenseStatusDetail" type="text" value="${esc(c.licenseStatusDetail)}" placeholder="z. B. 1 Rennen Sperre"></div>
      </div>
      `}

      ${isNew ? '' : '<div class="sectiontitle">Unterzeichnende Stewards</div>'}
      ${isNew ? '' : `
      <div class="grid cols-3">
        <div class="field"><label>Vorsitzender Steward</label><input id="f_stewardChairman" type="text" value="${esc(c.stewardChairman)}"></div>
        <div class="field"><label>Steward 2</label><input id="f_steward2" type="text" value="${esc(c.steward2)}"></div>
        <div class="field"><label>Steward 3</label><input id="f_steward3" type="text" value="${esc(c.steward3)}"></div>
      </div>
      `}

      ${c.history && c.history.length? `
        <div class="sectiontitle">Änderungsprotokoll</div>
        <table><thead><tr><th>Zeitpunkt</th><th>Ereignis</th></tr></thead><tbody>
        ${c.history.slice().reverse().map(h=>`<tr><td class="pts">${fmtDateTime(h.ts)}</td><td>${esc(h.text)}</td></tr>`).join('')}
        </tbody></table>` : ''}

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:26px;border-top:1px solid var(--line);padding-top:20px;">
        <button class="btn primary" onclick="saveCase('${c.id||''}', false)">${isNew?'Akte anlegen':'Akte speichern'}</button>
        <button class="btn" onclick="saveCase('${c.id||''}', true)">Speichern &amp; schließen</button>
        ${!isNew? `<button class="btn gold" onclick="printCaseReport('${c.id}')">FIA-Bericht erstellen (PDF)</button><button class="btn gold" onclick="go('warningform','${c.id}')">Verwarnung setzen</button><button class="btn gold" onclick="openTier3EscalationDialog('${c.id}')">Fall weiterleiten</button><button class="btn" onclick="sendCaseDiscordNotification('${c.id}')">An Discord senden</button>` : ''}
        ${!isNew? `<button class="btn danger" onclick="deleteCase('${c.id}')">Akte löschen</button>` : ''}
      </div>
      ${!isNew ? `<div class="sectiontitle">Verwarnungen in dieser Akte</div>${c.warningDocuments?.length ? `<table><thead><tr><th>Datum</th><th>Kategorie</th><th>Fahrer</th><th></th></tr></thead><tbody>${c.warningDocuments.map((warning,index)=>`<tr><td>${fmtDate(warning.createdAt)}</td><td>${esc(warning.category)}</td><td>${esc(warning.driverName||'—')}</td><td><button class="btn small gold" onclick="printWarning('${c.id}',${index})">PDF öffnen</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Noch keine schriftliche Verwarnung in dieser Akte abgelegt.</div>'}` : ''}
    </div>
  </div>
  `;
}

function warningTemplate(caseId, categoryIndex){
  const c=DB.cases.find(item=>item.id===caseId), driver=driverById(c?.driverInvolved), team=teamById(c?.teamInvolved);
  return `Hiermit wird ${driverName(driver)||'[Fahrername]'} (${team?.name||'[Team]'}) für den Vorfall in ${c?.event||'[Event]'} schriftlich verwarnt.\n\nFestgestellter Verstoß: ${WARNING_CATEGORIES[categoryIndex]||WARNING_CATEGORIES[0]}\n\n${WARNING_TEXT}\n\nDie Verwarnung wird zur Steward-Akte ${c?.stw||'[Aktennummer]'} genommen. Weitere gleichartige Verstöße können zu einer verschärften sportlichen Bewertung führen.`;
}
function pageWarningForm(caseId){
  const c=DB.cases.find(item=>item.id===caseId); if(!c) return '<div class="empty"><b>Akte nicht gefunden</b></div>';
  const driver=driverById(c.driverInvolved), team=teamById(c.teamInvolved);
  return `<div class="pagehead"><div><div class="eyebrow">${esc(c.stw)} · Schriftliche Maßnahme</div><h1>Verwarnung setzen</h1></div><div class="actions"><button class="btn" onclick="go('caseform','${c.id}')">← Zur Akte</button></div></div><div class="panel"><h2>Schriftliche <b>Verwarnung</b></h2><p style="color:var(--grey);margin-top:-4px;">Wähle eine Kategorie. Der Text wird automatisch vorbereitet und kann vor dem PDF-Erstellen angepasst werden.</p><div class="grid cols-3"><div class="field"><label>Betroffener Fahrer</label><input id="w_driver" type="text" value="${esc(driverName(driver))}" placeholder="Fahrername"></div><div class="field"><label>Team</label><input id="w_team" type="text" value="${esc(team?.name||'')}" placeholder="Team"></div><div class="field"><label>Datum</label><input id="w_date" type="date" value="${today()}"></div></div><div class="field"><label>Kategorie des Mangels an Rennintelligenz</label><select id="w_category" onchange="updateWarningTemplate('${c.id}')">${WARNING_CATEGORIES.map((item,index)=>`<option value="${index}">${String(index+1).padStart(2,'0')} · ${esc(item)}</option>`).join('')}</select></div><div class="field"><label>Verwarnungstext</label><textarea id="w_text" style="min-height:260px;">${esc(warningTemplate(c.id,0))}</textarea></div><div class="grid cols-2"><div class="field"><label>Vorsitzender Steward</label><input id="w_steward" type="text" placeholder="Name des Stewards"></div><div class="field"><label>Zusätzliche Notiz (optional)</label><input id="w_note" type="text" placeholder="z. B. Hinweis im Fahrerbriefing"></div></div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;"><button class="btn gold" onclick="createWarningPdf('${c.id}')">PDF erstellen</button><button class="btn primary" onclick="saveWarning('${c.id}')">Verwarnung in Akte speichern</button></div></div>`;
}
function updateWarningTemplate(caseId){ const category=parseInt(document.getElementById('w_category')?.value||0,10); const text=document.getElementById('w_text'); if(text) text.value=warningTemplate(caseId,category); }
function warningFromForm(caseId){ const category=parseInt(document.getElementById('w_category')?.value||0,10); return {id:uid(),category:WARNING_CATEGORIES[category]||WARNING_CATEGORIES[0],driverName:document.getElementById('w_driver')?.value.trim()||'',teamName:document.getElementById('w_team')?.value.trim()||'',createdAt:document.getElementById('w_date')?.value||today(),text:document.getElementById('w_text')?.value.trim()||'',steward:document.getElementById('w_steward')?.value.trim()||'',note:document.getElementById('w_note')?.value.trim()||'',caseId}; }
function warningDocumentHtml(c,warning){ return `<div class="doc"><div class="doc-head"><div><div class="t1">ZFC <span>RACING</span></div><div class="t2">Schriftliche Verwarnung · Steward Office</div></div><div class="stw">${esc(c.stw)}</div></div><p style="font-size:12px;color:#666;">${esc(c.event||'—')} · ${esc(c.sessionType||'—')} · ${esc(warning.createdAt||today())}</p><h3>Schriftliche Verwarnung</h3><table><tr><td class="k">Fahrer</td><td>${esc(warning.driverName||'—')}</td></tr><tr><td class="k">Team</td><td>${esc(warning.teamName||'—')}</td></tr><tr><td class="k">Kategorie</td><td>${esc(warning.category)}</td></tr><tr><td class="k">Aktennummer</td><td>${esc(c.stw)}</td></tr></table><p>${nl2br(warning.text)||'—'}</p>${warning.note?`<h3>Zusätzliche Notiz</h3><p>${nl2br(warning.note)}</p>`:''}<div class="sig"><div class="sigbox"><div class="sigline">${esc(warning.steward)||'—'}<br>Vorsitzender Steward</div></div><div class="sigbox"><div class="sigline">${esc(warning.driverName)||'—'}<br>Fahrer</div></div></div><div class="foot">ZFC RACING STEWARD-SYSTEM // Erstellt am ${fmtDateTime(Date.now())}</div></div>`; }
function createWarningPdf(caseId){ const c=DB.cases.find(item=>item.id===caseId); if(c) printDoc(warningDocumentHtml(c,warningFromForm(caseId))); }
async function saveWarning(caseId){ const c=DB.cases.find(item=>item.id===caseId); if(!c) return; const warning=warningFromForm(caseId); if(!warning.driverName||!warning.text){ alert('Bitte Fahrer und Verwarnungstext ausfüllen.'); return; } c.warningDocuments=Array.isArray(c.warningDocuments)?c.warningDocuments:[]; c.warningDocuments.push(warning); c.updatedAt=Date.now(); c.history=c.history||[]; c.history.push({ts:Date.now(),text:`Schriftliche Verwarnung abgelegt: ${warning.category}`}); addCaseActivity(c,`Schriftliche Verwarnung abgelegt: ${warning.category}`); await persist.cases(); go('caseform',caseId); }
function printWarning(caseId,index){ const c=DB.cases.find(item=>item.id===caseId), warning=c?.warningDocuments?.[index]; if(c&&warning) printDoc(warningDocumentHtml(c,warning)); }

function onCaseTeamChange(which){
  const teamSel = document.getElementById(which==='involved'?'f_teamInvolved':'f_teamAffected');
  const driverSel = document.getElementById(which==='involved'?'f_driverInvolved':'f_driverAffected');
  driverSel.innerHTML = driverOptionsForTeam(teamSel.value, '');
}

async function saveCase(id, closeAfter){
  const v = (i)=> document.getElementById(i).value;
  const now = Date.now();
  let c = id? DB.cases.find(x=>x.id===id) : null;
  const isNew = !c;
  if(isNew){
    if(!v('f_event').trim() || !v('f_description').trim()){
      alert('Bitte Event und eine Fallbeschreibung eintragen, bevor die Akte angelegt wird.');
      return;
    }
    const season = v('f_season');
    c = { id: uid(), stw: nextStw(), createdAt: now, history: [] };
    DB.cases.push(c);
  }
  const prevStatus = c.status, prevDecision = c.decision;
  Object.assign(c, {
    season: v('f_season'), status: isNew ? 'Neu' : v('f_status'), event: v('f_event'), sessionType: v('f_sessionType'),
    incidentLap: v('f_incidentLap'), category: v('f_category'), reportedBy: v('f_reportedBy'),
    teamInvolved: v('f_teamInvolved'), driverInvolved: v('f_driverInvolved'),
    teamAffected: v('f_teamAffected'), driverAffected: v('f_driverAffected'),
    description: v('f_description'), evidenceLink: v('f_evidenceLink'),
    hearingHeld: document.getElementById('f_hearingHeld').checked,
    investigationNotes: v('f_investigationNotes'), regulationBreach: v('f_regulationBreach'),
    precedent: v('f_precedent'), decision: isNew ? DECISIONS[0] : v('f_decision'),
    penaltyPoints: isNew ? 0 : parseInt(v('f_penaltyPoints'))||0, decisionDetail: isNew ? '' : v('f_decisionDetail'),
    licenseStatusAfter: isNew ? LICENSE_AFTER[0] : v('f_licenseStatusAfter'), licenseStatusDetail: isNew ? '' : v('f_licenseStatusDetail'),
    stewardChairman: isNew ? '' : v('f_stewardChairman'), steward2: isNew ? '' : v('f_steward2'), steward3: isNew ? '' : v('f_steward3'),
    updatedAt: now,
  });
  if(isNew){ c.history.push({ts:now, text:'Akte '+c.stw+' eröffnet.'}); }
  else{
    if(prevStatus!==c.status) c.history.push({ts:now, text:`Status geändert: ${prevStatus} → ${c.status}`});
    if(prevDecision!==c.decision) c.history.push({ts:now, text:`Entscheidung aktualisiert: ${c.decision}`});
    else c.history.push({ts:now, text:'Akte bearbeitet.'});
  }
  addCaseActivity(c, isNew ? 'Akte angelegt.' : (prevStatus!==c.status ? `Status geändert: ${prevStatus} → ${c.status}` : prevDecision!==c.decision ? `Entscheidung aktualisiert: ${c.decision}` : 'Akte bearbeitet.'));
  await persist.cases();
  if(closeAfter) go('cases'); else go('caseform', c.id);
}

async function deleteCase(id){
  if(!confirm('Diese Akte unwiderruflich löschen?')) return;
  const c=DB.cases.find(item=>item.id===id);
  if(!c) return;
  DB.deletedCaseLog.unshift({id:uid(),caseId:c.id,stw:c.stw,event:c.event,category:c.category,deletedAt:Date.now()});
  addCaseActivity(c,'Akte gelöscht.');
  DB.cases = DB.cases.filter(item=>item.id!==id);
  await persist.cases();
  await persist.deletedCaseLog();
  await persist.caseActivityLog();
  go('cases');
}

function addCaseActivity(c, action){
  if(!c?.stw || !action) return;
  DB.caseActivityLog.unshift({id:uid(),caseId:c.id,stw:c.stw,action,category:c.category||'Sonstiger Vorfall',ts:Date.now()});
  persist.caseActivityLog();
}
function categoryColor(category){
  const colors=['#e05b63','#e8a23a','#59b7d4','#8e7bd8','#db6e9e','#62b889','#d7c05e','#d27d4d'];
  return colors[Math.max(0,CATEGORIES.indexOf(category))%colors.length];
}

/* ============================= CASE LIST ============================= */
function pageCaseList(){
  return `
  <div class="pagehead">
    <div><div class="eyebrow">Übersicht</div><h1>Alle Akten</h1></div>
    <div class="actions"><button class="btn primary" onclick="go('caseform')">+ Neue Akte</button></div>
  </div>
  <div class="panel">
    <div class="searchbar">
      <input id="cf_q" type="text" placeholder="Suche: Event, Beschreibung, STW-Nr. …" oninput="renderCaseTable()">
      <select id="cf_status" onchange="renderCaseTable()"><option value="">Alle Status</option>${selectOptions(CASE_STATUS,'')}</select>
      <select id="cf_team" onchange="renderCaseTable()"><option value="">Alle Teams</option>${teamOptions('',false)}</select>
      <select id="cf_cat" onchange="renderCaseTable()"><option value="">Alle Kategorien</option>${selectOptions(CATEGORIES,'')}</select>
    </div>
    <div id="caseTableWrap"></div>
  </div>
  `;
}
function renderCaseTable(){
  const q = (document.getElementById('cf_q')?.value||'').toLowerCase();
  const st = document.getElementById('cf_status')?.value||'';
  const tm = document.getElementById('cf_team')?.value||'';
  const ct = document.getElementById('cf_cat')?.value||'';
  let list = [...DB.cases].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  list = list.filter(c=>{
    if(st && c.status!==st) return false;
    if(tm && c.teamInvolved!==tm) return false;
    if(ct && c.category!==ct) return false;
    if(q){
      const hay = [c.stw,c.event,c.description,c.category].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  const rows = list.map(c=>{
    const t = teamById(c.teamInvolved), d = driverById(c.driverInvolved);
    return `<tr class="rowlink" onclick="go('caseform','${c.id}')">
      <td class="pts">${esc(c.stw)}</td>
      <td>${esc(c.event||'—')} <span style="color:var(--grey-2);font-size:11.5px;">/ ${esc(c.sessionType||'')}</span></td>
      <td>${t? `<span class="teamchip"><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</span>`:'—'}</td>
      <td>${esc(driverName(d))}</td>
      <td>${esc(c.category||'—')}</td>
      <td>${esc(c.decision||'—')}</td>
      <td><span class="tag ${statusTagClass(c.status)}">${esc(c.status)}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('caseTableWrap').innerHTML = `
    <table><thead><tr><th>STW-Nr.</th><th>Event / Session</th><th>Team</th><th>Fahrer</th><th>Kategorie</th><th>Entscheidung</th><th>Status</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7"><div class="empty"><b>Keine Akten gefunden</b>Passe die Filter an oder eröffne eine neue Akte.</div></td></tr>`}</tbody></table>
    <div class="footer-note">${list.length} von ${DB.cases.length} Akten angezeigt.</div>
  `;
}

function pageDriverCasesOverview(){
  const selectedId=ROUTE.id||DB.drivers[0]?.id||'';
  const driver=driverById(selectedId);
  const cases=driver?casesForDriver(driver.id):[];
  const involved=driver?DB.cases.filter(c=>c.driverInvolved===driver.id):[];
  const decided=involved.filter(c=>c.status==='Entschieden'||c.status==='Archiviert');
  const open=cases.filter(c=>c.status!=='Entschieden'&&c.status!=='Archiviert');
  const penalties=decided.filter(c=>c.decision&&c.decision!=='Keine weitere Untersuchung erforderlich'&&c.decision!=='Fall untersucht – keine Strafe');
  const penaltyPoints=decided.reduce((sum,c)=>sum+(parseInt(c.penaltyPoints)||0),0);
  const categoryCounts={}; cases.forEach(c=>{const key=c.category||'Sonstiger Vorfall'; categoryCounts[key]=(categoryCounts[key]||0)+1;});
  const decisionCounts={}; penalties.forEach(c=>{const key=c.decision||'Sonstige Maßnahme'; decisionCounts[key]=(decisionCounts[key]||0)+1;});
  const chart=(counts, gold=false)=>{const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]); const max=Math.max(1,...rows.map(item=>item[1])); return rows.length?`<div class="driver-chart">${rows.map(([label,value])=>`<div class="driver-chart-row"><div class="driver-chart-label" title="${esc(label)}">${esc(label)}</div><div class="driver-chart-track"><div class="driver-chart-fill ${gold?'gold':''}" style="width:${value/max*100}%"></div></div><div class="driver-chart-value">${value}</div></div>`).join('')}</div>`:'<div class="driver-overview-empty">Noch keine Auswertung vorhanden.</div>';};
  const caseRows=cases.map(c=>`<tr class="rowlink" onclick="go('caseform','${c.id}')"><td class="pts">${esc(c.stw||'—')}</td><td>${esc(c.event||'—')} <span style="color:var(--grey-2);font-size:11.5px;">/ ${esc(c.sessionType||'')}</span></td><td>${esc(c.category||'—')}</td><td>${esc(c.decision||'—')}</td><td class="pts">${parseInt(c.penaltyPoints)||0}</td><td><span class="tag ${statusTagClass(c.status)}">${esc(c.status||'—')}</span></td></tr>`).join('');
  const team=driver?teamById(driver.teamId):null;
  return `<div class="pagehead"><div><div class="eyebrow">Fahrerkartei · Aktenanalyse</div><h1>Fahrer Cases Overview</h1></div><div class="actions"><button class="btn" onclick="go('drivers')">← Fahrerübersicht</button><button class="btn primary" onclick="go('driverform','${selectedId}')" ${selectedId?'':'disabled'}>Fahrerakte öffnen</button></div></div>
  <div class="panel"><div class="driver-overview-head"><div class="field" style="margin:0;flex:1;"><label for="driver_case_driver">Fahrer auswählen</label><select id="driver_case_driver" class="driver-overview-select" onchange="go('drivercases',this.value)"><option value="">— Fahrer auswählen —</option>${DB.drivers.slice().sort((a,b)=>driverName(a).localeCompare(driverName(b))).map(d=>`<option value="${d.id}" ${d.id===selectedId?'selected':''}>${esc(driverName(d))}${d.number?' #'+esc(d.number):''}</option>`).join('')}</select></div><div class="footer-note" style="margin:0;max-width:380px;">Die Auswertung wird automatisch aus den verknüpften Steward-Akten berechnet.</div></div>${driver?`<div class="driver-overview-profile"><div class="driverface">${driver.photoUrl?`<img src="${esc(driver.photoUrl)}" alt="${esc(driverName(driver))}">`:esc((driver.firstName?.[0]||'')+(driver.lastName?.[0]||''))}</div><div><h2>${esc(driverName(driver))}</h2><p>${team?esc(team.name):'Ohne Team'} · Lizenz ${esc(driver.licenseNo||'nicht ausgestellt')} · Status ${esc(driver.licenseStatus||'Nicht ausgestellt')}</p></div></div><div class="driver-overview-summary"><div class="stat"><div class="n">${cases.length}</div><div class="l">Fälle gesamt</div></div><div class="stat amber"><div class="n">${open.length}</div><div class="l">Offen / Prüfung</div></div><div class="stat green"><div class="n">${decided.length}</div><div class="l">Entschieden</div></div><div class="stat red"><div class="n">${penalties.length}</div><div class="l">Strafen</div></div><div class="stat ${penaltyPoints>=8?'amber':''}"><div class="n">${penaltyPoints} / 12</div><div class="l">Strafpunkte</div></div></div>`:'<div class="driver-overview-empty"><b>Noch keine Fahrer erfasst</b><br>Neue Fahrer erscheinen automatisch in dieser Übersicht.</div>'}</div>
  ${driver?`<div class="grid cols-2"><div class="panel"><h2>Fälle nach <b>Kategorie</b></h2>${chart(categoryCounts)}</div><div class="panel"><h2>Verhängte <b>Strafen</b></h2>${chart(decisionCounts,true)}</div></div><div class="panel"><h2>Verknüpfte <b>Steward-Akten</b></h2><div style="overflow:auto"><table><thead><tr><th>STW-Nr.</th><th>Event / Session</th><th>Kategorie</th><th>Entscheidung</th><th>Punkte</th><th>Status</th></tr></thead><tbody>${caseRows||'<tr><td colspan="6"><div class="driver-overview-empty">Für diesen Fahrer sind noch keine Fälle hinterlegt.</div></td></tr>'}</tbody></table></div><div class="footer-note">Berücksichtigt werden Fälle als betroffener oder geschädigter Fahrer. Strafpunkte und Strafen zählen nur aus entschiedenen bzw. archivierten Fällen, in denen der Fahrer betroffen ist.</div></div>`:''}`;
}

/* ============================= DRIVERS ============================= */
function pageDriverList(){
  return `
  <div class="pagehead">
    <div><div class="eyebrow">Fahrerkartei</div><h1>Fahrer</h1></div>
    <div class="actions"><button class="btn" onclick="go('drivercases')">Fahrer Cases Overview</button><button class="btn primary" onclick="go('driverform')">+ Neuen Fahrer erfassen</button></div>
  </div>
  <div class="panel">
    <div class="searchbar">
      <input id="df_q" type="text" placeholder="Suche nach Name …" oninput="renderDriverTable()">
      <select id="df_team" onchange="renderDriverTable()"><option value="">Alle Teams</option>${teamOptions('',false)}</select>
      <select id="df_lic" onchange="renderDriverTable()"><option value="">Alle Lizenzstatus</option>${selectOptions(['Aktiv','Ausgesetzt','Entzogen','Nicht ausgestellt'],'')}</select>
    </div>
    <div id="driverTableWrap"></div>
  </div>
  `;
}
function renderDriverTable(){
  const q = (document.getElementById('df_q')?.value||'').toLowerCase();
  const tm = document.getElementById('df_team')?.value||'';
  const lic = document.getElementById('df_lic')?.value||'';
  let list = [...DB.drivers].sort((a,b)=> driverName(a).localeCompare(driverName(b)));
  list = list.filter(d=>{
    if(tm && d.teamId!==tm) return false;
    if(lic && (d.licenseStatus||'Nicht ausgestellt')!==lic) return false;
    if(q && !driverName(d).toLowerCase().includes(q)) return false;
    return true;
  });
  const rows = list.map(d=>{
    const t = teamById(d.teamId);
    const pts = driverPenaltyPoints(d.id);
    const ptsClass = pts>=12?'crit':pts>=8?'warn':'';
    const ls = d.licenseStatus || 'Nicht ausgestellt';
    return `<tr class="rowlink" onclick="go('driverform','${d.id}')">
      <td>${divisionBadge(d)}${esc(driverName(d))} ${d.number? `<span style="color:var(--grey-2)">#${esc(d.number)}</span>`:''}</td>
      <td>${t? `<span class="teamchip"><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</span>`:'<span class="tag none">Free Driver</span>'}</td>
      <td class="pts">${esc(d.licenseNo||'—')}</td>
      <td><span class="tag ${licenseTagClass(ls)}">${esc(ls)}</span></td>
      <td class="pts ${ptsClass}">${pts} / 12</td>
      <td>${casesForDriver(d.id).length}</td>
    </tr>`;
  }).join('');
  document.getElementById('driverTableWrap').innerHTML = `
    <table><thead><tr><th>Fahrer</th><th>Team</th><th>Lizenz-Nr.</th><th>Lizenzstatus</th><th>Strafpunkte</th><th>Akten</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6"><div class="empty"><b>Noch keine Fahrer erfasst</b>Lege deinen ersten Fahrer an, um eine Fahrerakte zu erstellen.</div></td></tr>`}</tbody></table>
    <div class="footer-note">${list.length} von ${DB.drivers.length} Fahrern angezeigt.</div>
  `;
}

function pageDriverForm(existing){
  const d = existing || {
    id:null, firstName:'', lastName:'', number:'', nationality:'', dob:'', teamId:'',
    division:DIVISIONS[0], platform:PLATFORMS[0], simId:'', discord:'', email:'', debutDate:today(), licenseClass:LICENSE_CLASS[0],
    photoUrl:'', notes:'', licenseNo:'', licenseStatus:'Nicht ausgestellt', licenseIssued:'', licenseExpiry:'',
    rulesAccepted:false, history:[]
  };
  const isNew = !existing;
  const pts = existing? driverPenaltyPoints(d.id) : 0;
  const ptsClass = pts>=12?'crit':pts>=8?'warn':'';

  const suggestions = DRIVER_SUGGESTIONS[d.teamId] || [];

  return `
  <div class="pagehead">
    <div><div class="eyebrow">${isNew?'Neue Fahrerakte':'Fahrerakte'}</div><h1>${isNew?'Fahrer erfassen':esc(driverName(d))}</h1></div>
    <div class="actions"><button class="btn" onclick="go('drivers')">← Zur Übersicht</button>${!isNew?`<button class="btn gold" onclick="go('drivercases','${d.id}')">Cases Overview</button>`:''}</div>
  </div>

  <div class="dossier">
    <div class="dossier-head">
      <div style="display:flex;align-items:center;gap:16px;">
        <div class="driverface">${d.photoUrl? `<img src="${esc(d.photoUrl)}">` : (d.firstName? esc((d.firstName[0]||'')+(d.lastName[0]||'')) : '—')}</div>
        <div>
          <div class="stwlabel">Lizenznummer</div>
          <div class="stwno" style="font-size:18px;">${esc(d.licenseNo || '— noch nicht erteilt —')}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div class="stwlabel">Lizenzstatus</div>
        <span class="tag ${licenseTagClass(d.licenseStatus||'Nicht ausgestellt')}" style="font-size:12px;padding:5px 12px;">${esc(d.licenseStatus||'Nicht ausgestellt')}</span>
      </div>
    </div>
    <div class="dossier-body">

      <div class="sectiontitle">Persönliche Daten</div>
      <div class="grid cols-3">
        <div class="field"><label>Vorname</label><input id="d_firstName" type="text" value="${esc(d.firstName)}" list="drvsug"><datalist id="drvsug">${suggestions.map(s=>`<option value="${esc(s)}">`).join('')}</datalist></div>
        <div class="field"><label>Nachname</label><input id="d_lastName" type="text" value="${esc(d.lastName)}"></div>
        <div class="field"><label>Startnummer</label><input id="d_number" type="text" value="${esc(d.number)}"></div>
      </div>
      <div class="grid cols-3">
        <div class="field"><label>Nationalität</label><input id="d_nationality" type="text" value="${esc(d.nationality)}"></div>
        <div class="field"><label>Geburtsdatum</label><input id="d_dob" type="date" value="${esc(d.dob)}"></div>
        <div class="field"><label>Team</label><select id="d_teamId" onchange="onDriverTeamChange()">${teamOptions(d.teamId,false,true)}</select></div>
      </div>

      <div class="sectiontitle">Sim-Racing-Profil</div>
      <div class="grid cols-3">
        <div class="field"><label>Division</label><select id="d_division">${selectOptions(DIVISIONS, d.division||DIVISIONS[0])}</select></div>
        <div class="field"><label>Plattform</label><select id="d_platform">${selectOptions(PLATFORMS, PLATFORMS.includes(d.platform)?d.platform:PLATFORMS[0])}</select></div>
        <div class="field"><label>Sim-Racing-ID / Handle</label><input id="d_simId" type="text" value="${esc(d.simId)}"></div>
        <div class="field"><label>Discord-Name#ID</label><input id="d_discord" type="text" value="${esc(d.discord)}"></div>
      </div>
      <div class="grid cols-3">
        <div class="field"><label>E-Mail (optional)</label><input id="d_email" type="email" value="${esc(d.email)}"></div>
        <div class="field"><label>Debüt in der Liga</label><input id="d_debutDate" type="date" value="${esc(d.debutDate)}"></div>
        <div class="field"><label>Fahrerklasse</label><input id="d_licenseClass" type="text" value="F1 26" readonly></div>
      </div>
      <div class="grid cols-2">
        <div class="field"><label>Foto-URL (optional)</label><input id="d_photoUrl" type="text" value="${esc(d.photoUrl)}" placeholder="https://…"></div>
        <div class="field"><label>Marktwert (Startwert)</label><input id="d_marketValue" type="text" value="${esc(d.marketValue || '')}" placeholder="z. B. 8.500.000"></div>
      </div>
      <div class="grid cols-2">
        <div class="field"><label>Einkaufspreis (Startwert)</label><input id="d_purchasePrice" type="text" value="${esc(d.purchasePrice || '')}" placeholder="z. B. 6.900.000"></div>
        <div class="field"><label>Bemerkungen der Stewards</label><textarea id="d_notes" placeholder="Interne Notizen zum Fahrer …">${esc(d.notes)}</textarea></div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:22px 0;">
        <button class="btn primary" onclick="saveDriver('${d.id||''}')">Fahrerakte speichern</button>
        ${!isNew? `<button class="btn gold" onclick="launchMarketRequest('${d.id}')">Marktwert bestimmen</button>`:''}
        ${!isNew? `<button class="btn danger" onclick="deleteDriver('${d.id}')">Fahrerakte löschen</button>`:''}
      </div>

      ${!isNew? `
      <div class="sectiontitle">Racing-Lizenz</div>
      <div class="grid cols-3" style="margin-bottom:6px;">
        <div class="stat"><div class="n pts ${ptsClass}">${pts} / 12</div><div class="l">Strafpunkte (rollierend)</div></div>
        <div class="stat"><div class="n" style="font-size:15px;">${fmtDate(d.licenseIssued)}</div><div class="l">Lizenz erteilt am</div></div>
        <div class="stat"><div class="n" style="font-size:15px;">${fmtDate(d.licenseExpiry)}</div><div class="l">Gültig bis</div></div>
      </div>
      ${pts>=12? `<p style="color:#ff5a6b;font-size:13px;"><b>Hinweis:</b> Der Fahrer hat die Schwelle von 12 Strafpunkten erreicht. Gemäß Reglement ist eine Rennsperre zu prüfen.</p>`:''}
      <label class="checkline" style="margin:14px 0;"><input type="checkbox" id="d_rulesAccepted" ${d.rulesAccepted?'checked':''}> Fahrer hat das Sportreglement der ZFC Racing gelesen und akzeptiert</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${(!d.licenseStatus || d.licenseStatus==='Nicht ausgestellt')? `<button class="btn gold" onclick="issueLicense('${d.id}')">Lizenz erteilen</button>` : ''}
        ${d.licenseStatus==='Aktiv'? `<button class="btn" onclick="setLicenseStatus('${d.id}','Ausgesetzt')">Lizenz aussetzen</button>`:''}
        ${d.licenseStatus==='Aktiv'? `<button class="btn danger" onclick="setLicenseStatus('${d.id}','Entzogen')">Lizenz entziehen</button>`:''}
        ${(d.licenseStatus==='Ausgesetzt'||d.licenseStatus==='Entzogen')? `<button class="btn" onclick="setLicenseStatus('${d.id}','Aktiv')">Lizenz reaktivieren</button>`:''}
        ${d.licenseStatus && d.licenseStatus!=='Nicht ausgestellt'? `<button class="btn gold" onclick="printLicense('${d.id}')">Lizenz als PDF</button>`:''}
      </div>

      <div class="sectiontitle">Verknüpfte Steward-Akten</div>
      ${casesForDriver(d.id).length? `
      <table><thead><tr><th>STW-Nr.</th><th>Event</th><th>Kategorie</th><th>Entscheidung</th><th>Status</th></tr></thead><tbody>
        ${casesForDriver(d.id).map(c=>`<tr class="rowlink" onclick="go('caseform','${c.id}')">
          <td class="pts">${esc(c.stw)}</td><td>${esc(c.event||'—')}</td><td>${esc(c.category||'—')}</td>
          <td>${esc(c.decision||'—')}</td><td><span class="tag ${statusTagClass(c.status)}">${esc(c.status)}</span></td>
        </tr>`).join('')}
      </tbody></table>` : `<div class="empty">Für diesen Fahrer wurden noch keine Fälle erfasst.</div>`}

      <div class="sectiontitle">Transferhistorie</div>
      ${transfersForDriver(d.id).length? `
      <table><thead><tr><th>Datum</th><th>Von</th><th>Nach</th><th>Notiz</th></tr></thead><tbody>
        ${transfersForDriver(d.id).map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${esc(teamById(t.fromTeamId)?.name||'—')}</td><td>${esc(teamById(t.toTeamId)?.name||'—')}</td><td>${esc(t.note||'—')}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">Keine Transfers erfasst.</div>`}
      ` : `<div class="footer-note">Speichere die Fahrerakte zuerst, um eine Lizenz zu erteilen und Fälle zu verknüpfen.</div>`}

    </div>
  </div>
  `;
}
function onDriverTeamChange(){ /* placeholder for future dependent logic */ }

function formatCurrency(value, currency='EUR'){
  const number = Number(value || 0);
  return new Intl.NumberFormat('de-DE',{style:'currency',currency:currency||'EUR',maximumFractionDigits:0}).format(number);
}

function addDriverAudit(driverId, text){
  const d = driverById(driverId); if(!d) return;
  d.history = d.history || [];
  d.history.push({ts:Date.now(), text});
}

function launchMarketRequest(driverId){
  const request = createMarketRequestForDriver(driverId);
  if(!request) return;
  go('market', request.id);
}

function createMarketRequestForDriver(driverId){
  const d = driverById(driverId); if(!d) return null;
  const existing = DB.marketRequests.find(req=>req.driverId===driverId && req.status!=='Abgeschlossen');
  if(existing) return existing;
  const request = {
    id: uid(),
    requestId: `FM-${String(DB.marketRequests.length + 101).padStart(4,'0')}`,
    driverId: d.id,
    driverName: driverName(d),
    driverNumber: d.number || '',
    teamId: d.teamId || '',
    division: d.division || '',
    status: 'Neu',
    createdBy: 'Aktiver Benutzer',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    marketValue: d.marketValue || '',
    purchasePrice: d.purchasePrice || '',
    proposal: d.marketValue || '',
    finalValue: d.marketValue || '',
    reason: '',
    responsible: '',
    approvalDate: '',
    approvedBy: '',
    purchaseReason: '',
    history: [{ts:Date.now(), text:'Marktwert-Anfrage eröffnet'}],
    auditLog: [{ts:Date.now(), text:'Anfrage erstellt'}]
  };
  DB.marketRequests.push(request);
  d.marketValue = d.marketValue || '';
  d.purchasePrice = d.purchasePrice || '';
  d.marketHistory = d.marketHistory || [];
  persist.marketRequests();
  return request;
}

function pageMarketOverview(){
  const rows = [...DB.marketRequests].sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0)).map(req => {
    const driver = driverById(req.driverId);
    const team = teamById(req.teamId || driver?.teamId);
    return `<tr class="rowlink" onclick="go('market','${req.id}')">
      <td class="pts">${esc(req.requestId || '—')}</td>
      <td>${esc(driver ? driverName(driver) : (req.driverName || '—'))}</td>
      <td>${esc(req.driverNumber || driver?.number || '—')}</td>
      <td>${esc(team?.name || '—')}</td>
      <td>${esc(req.division || driver?.division || '—')}</td>
      <td><span class="tag ${statusTagClass(req.status === 'Neu' ? 'open' : req.status === 'Bewertung erforderlich' ? 'invest' : req.status === 'Bestätigt' || req.status === 'Werte festgelegt' ? 'decided' : 'archived')}">${esc(req.status||'Neu')}</span></td>
      <td>${esc(req.createdBy || '—')}</td>
      <td>${fmtDateTime(req.createdAt)}</td>
      <td>${esc(req.finalValue || req.proposal || req.marketValue || '—')}</td>
      <td>${esc(req.purchasePrice || '—')}</td>
      <td>${esc(req.responsible || '—')}</td>
    </tr>`;
  }).join('');

  return `
    <div class="pagehead">
      <div><div class="eyebrow">Fahrermarkt</div><h1>Marktwert-Anfragen</h1></div>
      <div class="actions"><button class="btn primary" onclick="go('drivers')">Fahrerübersicht</button></div>
    </div>
    <div class="panel">
      <div class="searchbar">
        <input id="market_q" type="text" placeholder="Suche nach Fahrer, Team, Anfrage-ID…" oninput="renderMarketTable()">
        <select id="market_status" onchange="renderMarketTable()">
          <option value="">Alle Status</option>
          <option value="Neu">Neu</option>
          <option value="In Prüfung">In Prüfung</option>
          <option value="Bewertung erforderlich">Bewertung erforderlich</option>
          <option value="Werte festgelegt">Werte festgelegt</option>
          <option value="Zur Bestätigung">Zur Bestätigung</option>
          <option value="Bestätigt">Bestätigt</option>
          <option value="Abgelehnt">Abgelehnt</option>
          <option value="Abgeschlossen">Abgeschlossen</option>
        </select>
      </div>
      <div id="marketTableWrap"></div>
    </div>
  `;
}

function renderMarketTable(){
  const q = (document.getElementById('market_q')?.value||'').toLowerCase();
  const st = (document.getElementById('market_status')?.value || '');
  let list = [...DB.marketRequests].sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  list = list.filter(req => {
    if(st && req.status !== st) return false;
    if(!q) return true;
    const hay = [req.requestId, req.driverName, req.driverNumber, req.createdBy, req.status, (teamById(req.teamId || driverById(req.driverId)?.teamId)?.name||'')].join(' ').toLowerCase();
    return hay.includes(q);
  });
  const rows = list.map(req => {
    const driver = driverById(req.driverId);
    const team = teamById(req.teamId || driver?.teamId);
    return `<tr class="rowlink" onclick="go('market','${req.id}')">
      <td class="pts">${esc(req.requestId || '—')}</td>
      <td>${esc(driver ? driverName(driver) : (req.driverName || '—'))}</td>
      <td>${esc(req.driverNumber || driver?.number || '—')}</td>
      <td>${esc(team?.name || '—')}</td>
      <td>${esc(req.division || driver?.division || '—')}</td>
      <td><span class="tag ${statusTagClass(req.status === 'Neu' ? 'open' : req.status === 'Bewertung erforderlich' ? 'invest' : req.status === 'Bestätigt' || req.status === 'Werte festgelegt' ? 'decided' : 'archived')}">${esc(req.status || 'Neu')}</span></td>
      <td>${esc(req.createdBy || '—')}</td>
      <td>${fmtDateTime(req.createdAt)}</td>
      <td>${esc(req.finalValue || req.proposal || req.marketValue || '—')}</td>
      <td>${esc(req.purchasePrice || '—')}</td>
      <td>${esc(req.responsible || '—')}</td>
    </tr>`;
  }).join('');
  document.getElementById('marketTableWrap').innerHTML = `
    <table>
      <thead><tr><th>Anfrage-ID</th><th>Fahrer</th><th>Nr.</th><th>Team</th><th>Division</th><th>Status</th><th>Ersteller</th><th>Erstellt</th><th>Marktwert</th><th>Einkaufspreis</th><th>Bearbeiter</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="11"><div class="empty"><b>Keine Marktwert-Anfragen</b>Der erste Fahrermarkt-Antrag erscheint hier automatisch.</div></td></tr>`}</tbody>
    </table>
    <div class="footer-note">${list.length} von ${DB.marketRequests.length} Anfragen angezeigt.</div>
  `;
}

function pageMarketRequestDetail(id){
  const request = DB.marketRequests.find(r=>r.id===id);
  if(!request) return `<div class="panel"><h2>Marktwert-Anfrage nicht gefunden</h2><p class="empty">Diese Anfrage existiert nicht mehr.</p></div>`;
  const driver = driverById(request.driverId);
  const team = teamById(request.teamId || driver?.teamId);
  return `
    <div class="pagehead">
      <div><div class="eyebrow">Fahrermarkt / Akte</div><h1>${esc(request.requestId || 'Marktwert-Akte')}</h1></div>
      <div class="actions"><button class="btn" onclick="go('market')">← Übersicht</button></div>
    </div>
    <div class="grid cols-2" style="align-items:start;">
      <aside class="panel">
        <h2>Fahrerprofil</h2>
        <div class="driver-overview-profile" style="margin-bottom:8px;">
          <div class="driverface">${driver?.photoUrl?`<img src="${esc(driver.photoUrl)}" alt="${esc(driverName(driver))}">`:esc((driver?.firstName?.[0]||'')+(driver?.lastName?.[0]||''))}</div>
          <div><h2 style="font-size:18px;">${esc(driver ? driverName(driver) : request.driverName)}</h2><p>${esc(team?.name || '—')} · ${esc(request.division || driver?.division || '—')}</p></div>
        </div>
        <div class="field"><label>Discord</label><input value="${esc(driver?.discord || '—')}" readonly></div>
        <div class="field"><label>Fahrernummer</label><input value="${esc(request.driverNumber || driver?.number || '—')}" readonly></div>
        <div class="field"><label>Nationalität</label><input value="${esc(driver?.nationality || '—')}" readonly></div>
        <div class="field"><label>Team</label><input value="${esc(team?.name || '—')}" readonly></div>
        <div class="field"><label>Division</label><input value="${esc(request.division || driver?.division || '—')}" readonly></div>
        <div class="field"><label>Status</label><input value="${esc(request.status || 'Neu')}" readonly></div>
        <div class="field"><label>Anfrage-ID</label><input value="${esc(request.requestId)}" readonly></div>
        <div class="field"><label>Ersteller</label><input value="${esc(request.createdBy)}" readonly></div>
        <div class="field"><label>Datum</label><input value="${fmtDateTime(request.createdAt)}" readonly></div>
        <div class="field"><label>Bearbeiter</label><input value="${esc(request.responsible || '—')}" readonly></div>
        <div class="field"><label>Letzte Änderung</label><input value="${fmtDateTime(request.updatedAt || request.createdAt)}" readonly></div>
      </aside>
      <section class="panel">
        <h2>Bearbeitungsprozess</h2>
        <div class="field"><label>Begründung für die Marktwertbestimmung</label><textarea id="market_reason" placeholder="Pace, Qualifying Pace, Race Pace, Konstanz, Racecraft, Teamfähigkeit, Entwicklungspotenzial…">${esc(request.reason || '')}</textarea></div>
        <div class="grid cols-2">
          <div class="field"><label>Vorgeschlagener Marktwert</label><input id="market_proposal" type="text" value="${esc(request.proposal || request.marketValue || '')}" placeholder="z. B. 8.000.000"></div>
          <div class="field"><label>Finaler Marktwert</label><input id="market_final" type="text" value="${esc(request.finalValue || request.marketValue || '')}" placeholder="z. B. 9.000.000"></div>
          <div class="field"><label>Einkaufspreis</label><input id="market_purchase" type="text" value="${esc(request.purchasePrice || '')}" placeholder="z. B. 7.000.000"></div>
          <div class="field"><label>Verantwortlicher Bearbeiter</label><input id="market_responsible" type="text" value="${esc(request.responsible || '')}"></div>
        </div>
        <div class="field"><label>Begründung für den Einkaufspreis</label><textarea id="market_purchase_reason" placeholder="Begründung des Einkaufspreises, Risiken, Potenzial, Vertragssituation…">${esc(request.purchaseReason || '')}</textarea></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin: 14px 0;">
          <button class="btn primary" onclick="saveMarketRequest('${request.id}')">Speichern</button>
          <button class="btn gold" onclick="updateMarketStatus('${request.id}','Zur Bestätigung')">Zur Bestätigung</button>
          <button class="btn" onclick="updateMarketStatus('${request.id}','Bestätigt')">Bestätigen</button>
          <button class="btn danger" onclick="updateMarketStatus('${request.id}','Abgelehnt')">Ablehnen</button>
        </div>
        <div class="sectiontitle">Audit Log</div>
        <table><thead><tr><th>Datum</th><th>Ereignis</th></tr></thead>
          <tbody>${(request.auditLog || []).slice().reverse().map(entry => `<tr><td>${fmtDateTime(entry.ts)}</td><td>${esc(entry.text)}</td></tr>`).join('') || '<tr><td colspan="2"><div class="empty">Noch keine Aktivitäten.</div></td></tr>'}</tbody>
        </table>
      </section>
    </div>
  `;
}

function updateMarketStatus(id, status){
  const request = DB.marketRequests.find(r=>r.id===id); if(!request) return;
  request.status = status;
  request.updatedAt = Date.now();
  request.auditLog = request.auditLog || [];
  request.auditLog.push({ts:Date.now(), text:`Status geändert auf ${status}`});
  if(status === 'Bestätigt' && request.finalValue){
    const driver = driverById(request.driverId);
    if(driver){
      driver.marketValue = request.finalValue;
      driver.purchasePrice = request.purchasePrice || driver.purchasePrice || '';
      driver.marketValueDate = new Date().toISOString().slice(0,10);
      driver.marketValueConfirmedBy = request.responsible || request.createdBy || 'System';
      driver.marketHistory = driver.marketHistory || [];
      driver.marketHistory.push({date: driver.marketValueDate, marketValue: request.finalValue, purchasePrice: driver.purchasePrice, status: 'Bestätigt', bearbeiter: driver.marketValueConfirmedBy});
      addDriverAudit(driver.id, `Marktwert bestätigt: ${request.finalValue}`);
    }
  }
  persist.marketRequests();
  go('market', id);
}

function saveMarketRequest(id){
  const request = DB.marketRequests.find(r=>r.id===id); if(!request) return;
  const reason = document.getElementById('market_reason')?.value.trim();
  const proposal = document.getElementById('market_proposal')?.value.trim();
  const finalValue = document.getElementById('market_final')?.value.trim();
  const purchasePrice = document.getElementById('market_purchase')?.value.trim();
  const responsible = document.getElementById('market_responsible')?.value.trim();
  const purchaseReason = document.getElementById('market_purchase_reason')?.value.trim();
  if(!reason || !proposal || !purchasePrice || !responsible){
    alert('Begründung, Marktwert, Einkaufspreis und verantwortlicher Bearbeiter müssen vor der Bestätigung eingegeben werden.');
    return;
  }
  request.reason = reason;
  request.proposal = proposal;
  request.finalValue = finalValue || proposal;
  request.purchasePrice = purchasePrice;
  request.purchaseReason = purchaseReason;
  request.responsible = responsible;
  request.marketValue = finalValue || proposal;
  const driver = driverById(request.driverId);
  if(driver){
    driver.marketValue = finalValue || proposal;
    driver.purchasePrice = purchasePrice;
    driver.updatedAt = Date.now();
    addDriverAudit(driver.id, `Marktwert und Einkaufspreis aktualisiert: ${driver.marketValue} / ${driver.purchasePrice}`);
  }
  request.updatedAt = Date.now();
  request.auditLog = request.auditLog || [];
  request.auditLog.push({ts:Date.now(), text:'Marktwertdaten gespeichert'});
  if(request.status === 'Neu') request.status = 'In Prüfung';
  persist.marketRequests();
  go('market', id);
}

function renderCaseTable(){
  const q = (document.getElementById('cf_q')?.value||'').toLowerCase();
  const st = document.getElementById('cf_status')?.value||'';
  const tm = document.getElementById('cf_team')?.value||'';
  const ct = document.getElementById('cf_cat')?.value||'';
  let list = [...DB.cases].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  list = list.filter(c=>{
    if(String(c.status||'').startsWith('An Tier ') || c.status === 'Zurück an Tier 1') {
      if(st !== 'Eskaliert' && st !== 'Zurück an Tier 1' && st !== '') return false;
    }
    if(st && c.status !== st && !(st==='Eskaliert' && String(c.status||'').startsWith('An Tier ')) && !(st==='Zurück an Tier 1' && c.status==='Zurück an Tier 1')) return false;
    if(tm && c.teamInvolved!==tm) return false;
    if(ct && c.category!==ct) return false;
    if(q){
      const hay = [c.stw,c.event,c.description,c.category].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  const rows = list.map(c=>{
    const t = teamById(c.teamInvolved), d = driverById(c.driverInvolved);
    return `<tr class="rowlink" onclick="go('caseform','${c.id}')">
      <td class="pts">${esc(c.stw)}</td>
      <td>${esc(c.event||'—')} <span style="color:var(--grey-2);font-size:11.5px;">/ ${esc(c.sessionType||'')}</span></td>
      <td>${t? `<span class="teamchip"><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</span>`:'—'}</td>
      <td>${esc(driverName(d))}</td>
      <td>${esc(c.category||'—')}</td>
      <td>${esc(c.decision||'—')}</td>
      <td><span class="tag ${statusTagClass(String(c.status||'').startsWith('An Tier ') ? 'archived' : c.status)}">${esc(c.status)}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('caseTableWrap').innerHTML = `
    <table><thead><tr><th>STW-Nr.</th><th>Event / Session</th><th>Team</th><th>Fahrer</th><th>Kategorie</th><th>Entscheidung</th><th>Status</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7"><div class="empty"><b>Keine Akten gefunden</b>Passe die Filter an oder eröffne eine neue Akte.</div></td></tr>`}</tbody></table>
    <div class="footer-note">${list.length} von ${DB.cases.filter(c => !String(c.status||'').startsWith('An Tier ')).length} Akten angezeigt.</div>
  `;
}

function openTier3EscalationDialog(caseId){
  const existing = document.getElementById('tier3Modal');
  if(existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'tier3Modal';
  modal.style.position = 'fixed'; modal.style.inset = '0'; modal.style.background = 'rgba(0,0,0,.68)'; modal.style.display = 'grid'; modal.style.placeItems = 'center'; modal.style.zIndex = '2000';
  modal.innerHTML = `
    <div style="width:min(700px,calc(100vw - 32px));background:var(--black-2);border:1px solid var(--line);padding:24px 22px;box-shadow:0 20px 50px rgba(0,0,0,.45);">
      <div class="eyebrow">Steward-System</div>
      <h2 style="margin:8px 0 16px; font-size:27px;">Fall eskalieren</h2>
      <div class="field"><label>Ziel der Eskalierung</label><select id="tier3_target"><option value="2">Tier 2 · Fachprüfung</option><option value="3" selected>Tier 3 · Leitung</option></select></div>
      <div class="field"><label>Warum wird eskaliert?</label><textarea id="tier3_reason" placeholder="Bitte die konkrete Ursache, Beweislage, Regelauslegung oder weitere Prüfung nennen." required></textarea></div>
      <div class="field"><label>Was wird benötigt?</label><textarea id="tier3_needed" placeholder="z. B. Entscheidung, Prüfung, Beweismittel, Freigabe, Finanzabwicklung, Team-Koordination, zusätzliche Analyse…" required></textarea></div>
      <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; margin-top:18px;">
        <button class="btn" onclick="document.getElementById('tier3Modal').remove()">Abbrechen</button>
        <button class="btn primary" onclick="submitTier3Escalation('${caseId}')">Eskalierung durchführen</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function submitTier3Escalation(caseId){
  const reason = document.getElementById('tier3_reason')?.value.trim();
  const needed = document.getElementById('tier3_needed')?.value.trim();
  if(!reason || !needed){ alert('Bitte sowohl den Eskalierungsgrund als auch die benötigten Unterlagen bzw. die benötigte Unterstützung angeben.'); return; }
  const targetTier=Number(document.getElementById('tier3_target')?.value||3);
  const c = DB.cases.find(item=>item.id===caseId); if(!c) return;
  c.status = `An Tier ${targetTier} eskaliert`;
  c.updatedAt = Date.now();
  c.history = c.history || [];
  c.history.push({ts:Date.now(), text:`Fall an Tier ${targetTier} eskaliert – ${reason}`});
  const escalation = {
    id: uid(),
    caseId: c.id,
    sourceType: 'case',
    stw: c.stw,
    caseName: c.event || 'Steward-Fall',
    drivers: [driverName(driverById(c.driverInvolved)), driverName(driverById(c.driverAffected))].filter(Boolean).join(', ') || '—',
    type: c.category || 'Steward-Fall',
    reason,
    requiredSupport: needed,
    originalSteward: c.stewardChairman || 'Steward Team',
    escalatedAt: Date.now(),
    status: `An Tier ${targetTier} eskaliert`,
    targetTier,
    tier3User: targetTier===3?'Tier 3':'',
    updatedAt: Date.now(),
    feedback: ''
  };
  DB.escalations.push(escalation);
  addCaseActivity(c,`An Tier ${targetTier} eskaliert: ${reason}`);
  DB.marketRequests = DB.marketRequests || [];
  persist.cases(); persist.escalations();
  document.getElementById('tier3Modal')?.remove();
  go(targetTier===3 ? 'escalations-t3' : 'escalations-t2', escalation.id);
}

function pageEscalationHub(){
  const tier2Count = DB.escalations.filter(item=>Number(item.targetTier||3)===2).length;
  const tier3Count = DB.escalations.filter(item=>Number(item.targetTier||3)===3).length;
  return `
    <div class="pagehead">
      <div><div class="eyebrow">Steward-Workflow</div><h1>Eskalierungen</h1></div>
    </div>
    <div class="grid cols-2">
      <div class="panel" style="cursor:pointer;" onclick="go('escalations-t2')">
        <div class="eyebrow">Tier 2</div>
        <h2>Fachprüfung</h2>
        <p>Für komplexe technische Fälle, Fahrerprüfungen und fachliche Rückfragen an Tier 2.</p>
        <div class="stat red" style="margin-top:12px;">
          <div class="n">${tier2Count}</div>
          <div class="l">offene Eskalierungen</div>
        </div>
      </div>
      <div class="panel" style="cursor:pointer;" onclick="go('escalations-t3')">
        <div class="eyebrow">Tier 3</div>
        <h2>Leitung / Finale Freigabe</h2>
        <p>Für Leitung, Finalentscheidung, Transfers mit Freigabe und finanzielle Abwicklung.</p>
        <div class="stat gold" style="margin-top:12px;">
          <div class="n">${tier3Count}</div>
          <div class="l">offene Eskalierungen</div>
        </div>
      </div>
    </div>
    <div class="panel">
      <h2>Regel für Eskalierungen</h2>
      <p>Jede Eskalierung muss immer einen klaren Kommentar enthalten: <strong>Warum wird eskaliert?</strong> und <strong>Was wird benötigt?</strong>. So bleibt der Ablauf sauber, nachvollziehbar und schnell bearbeitbar.</p>
    </div>
  `;
}

function pageEscalations(targetTier = null){
  const tier = Number(targetTier || AUTH.profile?.access_tier || 2);
  const visibleEscalations = DB.escalations.filter(item => Number(item.targetTier || 3) === tier);
  const rows = visibleEscalations.length ? visibleEscalations.map(e => {
    const targetPage = tier === 3 ? 'escalations-t3' : 'escalations-t2';
    return `<tr class="rowlink" onclick="go('${targetPage}','${e.id}')">
      <td class="pts">${esc(e.stw || '—')}</td>
      <td>${esc(e.caseName || '—')}</td>
      <td>${esc(e.drivers || '—')}</td>
      <td>${esc(e.type || '—')}</td>
      <td>Tier ${Number(e.targetTier || 3)}</td>
      <td>${esc(e.reason || '—')}</td>
      <td>${esc(e.requiredSupport || '—')}</td>
      <td>${esc(e.originalSteward || '—')}</td>
      <td>${fmtDateTime(e.escalatedAt)}</td>
      <td><span class="tag ${e.status === 'Zurück an Tier 1' ? 'open' : 'invest'}">${esc(e.status || 'An Tier '+(e.targetTier||3)+' eskaliert')}</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="10"><div class="empty"><b>Keine Eskalierungen</b>In diesem Bereich sind derzeit keine Fälle offen.</div></td></tr>';
  return `
    <div class="pagehead">
      <div><div class="eyebrow">Tier ${tier}</div><h1>Eskalierungen an Tier ${tier}</h1></div>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>STW-Nummer</th><th>Fallname</th><th>beteiligte Fahrer</th><th>Falltyp</th><th>Ziel</th><th>Eskalierungsgrund</th><th>Benötigt</th><th>Steward</th><th>Eskalierungsdatum</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function pageEscalationDetail(id){
  const e = DB.escalations.find(item=>item.id===id); if(!e) return `<div class="panel"><h2>Eskalierung nicht gefunden</h2></div>`;
  const targetTier = Number(e.targetTier || 3);
  const backPage = ROUTE.page === 'escalations-t3' ? 'escalations-t3' : ROUTE.page === 'escalations-t2' ? 'escalations-t2' : 'escalations';
  const isTransferEscalation = e.sourceType === 'transfer';
  return `
    <div class="pagehead">
      <div><div class="eyebrow">${targetTier === 2 ? 'Tier 2 / Fachprüfung' : 'Tier 3 / Leitung'}</div><h1>${esc(e.stw || 'Eskalierung')}</h1></div>
      <div class="actions"><button class="btn" onclick="go('${backPage}')">← Übersicht</button></div>
    </div>
    <div class="grid cols-2" style="align-items:start;">
      <div class="panel">
        <h2>Fallinformationen</h2>
        <div class="field"><label>STW-Nummer</label><input value="${esc(e.stw || '—')}" readonly></div>
        <div class="field"><label>Fallname</label><input value="${esc(e.caseName || '—')}" readonly></div>
        <div class="field"><label>beteiligte Fahrer</label><input value="${esc(e.drivers || '—')}" readonly></div>
        <div class="field"><label>Falltyp</label><input value="${esc(e.type || '—')}" readonly></div>
        <div class="field"><label>Ziel der Eskalierung</label><input value="Tier ${targetTier}" readonly></div>
        <div class="field"><label>ursprünglicher Steward</label><input value="${esc(e.originalSteward || '—')}" readonly></div>
      </div>
      <div class="panel">
        <h2>${targetTier === 3 ? 'Tier-3-Bearbeitung' : 'Tier-2-Bearbeitung'}</h2>
        <div class="field"><label>Warum wird eskaliert?</label><textarea readonly>${esc(e.reason || '')}</textarea></div>
        <div class="field"><label>Was wird benötigt?</label><textarea readonly>${esc(e.requiredSupport || '')}</textarea></div>
        <div class="field"><label>${targetTier === 3 ? 'Tier-3' : 'Tier-2'}-Feedback</label><textarea id="tier3_feedback" placeholder="Entscheidung, Hinweise, notwendige Korrekturen, zusätzliche Untersuchungen, Prozesshinweise…">${esc(e.feedback || '')}</textarea></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${isTransferEscalation && targetTier === 3 ? '<button class="btn primary" onclick="confirmTransferEscalation(\'${e.id}\')">Transfer bestätigen &amp; Finanzabwicklung erstellen</button>' : ''}
          <button class="btn" onclick="returnTier3ToSteward('${e.id}')">An Tier 1 zurückgeben</button>
        </div>
      </div>
    </div>
  `;
}

function returnTier3ToSteward(id){
  const escalation = DB.escalations.find(item=>item.id===id); if(!escalation) return;
  const caseData = DB.cases.find(item=>item.id===escalation.caseId); if(!caseData) return;
  if(caseData) {
    caseData.status = 'Zurück an Tier 1';
    caseData.updatedAt = Date.now();
    caseData.history = caseData.history || [];
    caseData.history.push({ts:Date.now(), text:'Fall durch Tier 3 an Tier 1 zurückgegeben'});
    addCaseActivity(caseData,'Durch Tier 3 an Tier 1 zurückgegeben.');
  }
  escalation.status = 'Zurück an Tier 1';
  escalation.feedback = document.getElementById('tier3_feedback')?.value.trim() || escalation.feedback || '';
  escalation.updatedAt = Date.now();
  escalation.auditLog = escalation.auditLog || [];
  escalation.auditLog.push({ts:Date.now(), text:'Rückgabe an Tier 1 durchgeführt'});
  persist.cases(); persist.escalations();
  go('escalations', id);
}

async function saveDriver(id){
  const v = i=>document.getElementById(i).value;
  let d = id? driverById(id) : null;
  const isNew = !d;
  if(isNew && !v('d_firstName').trim() && !v('d_lastName').trim()){
    alert('Bitte mindestens Vor- oder Nachname angeben.');
    return;
  }
  if(isNew){ d = {id:uid(), createdAt:Date.now(), licenseStatus:'Nicht ausgestellt', history:[]}; DB.drivers.push(d); }
  Object.assign(d, {
    firstName:v('d_firstName'), lastName:v('d_lastName'), number:v('d_number'),
    nationality:v('d_nationality'), dob:v('d_dob'), teamId:v('d_teamId'),
    division:v('d_division'),
    platform:v('d_platform'), simId:v('d_simId'), discord:v('d_discord'), email:v('d_email'),
    debutDate:v('d_debutDate'), licenseClass:'F1 26', photoUrl:v('d_photoUrl'),
    marketValue:v('d_marketValue').trim(), purchasePrice:v('d_purchasePrice').trim(),
    notes:v('d_notes'), updatedAt:Date.now(),
  });
  if(!isNew && document.getElementById('d_rulesAccepted')) d.rulesAccepted = document.getElementById('d_rulesAccepted').checked;
  await persist.drivers();
  go('driverform', d.id);
}
async function deleteDriver(id){
  if(!confirm('Diese Fahrerakte unwiderruflich löschen? Verknüpfte Fälle bleiben erhalten, verweisen aber ins Leere.')) return;
  DB.drivers = DB.drivers.filter(d=>d.id!==id);
  await persist.drivers();
  go('drivers');
}
async function issueLicense(id){
  const d = driverById(id);
  const accepted = document.getElementById('d_rulesAccepted').checked;
  if(!accepted){ alert('Der Fahrer muss das Sportreglement akzeptieren, bevor die Lizenz erteilt werden kann.'); return; }
  d.licenseNo = nextLicenseNo();
  d.licenseStatus = 'Aktiv';
  d.licenseIssued = today();
  const exp = new Date(); exp.setFullYear(exp.getFullYear()+1);
  d.licenseExpiry = exp.toISOString().slice(0,10);
  d.rulesAccepted = true;
  d.history = d.history||[]; d.history.push({ts:Date.now(), text:`Lizenz ${d.licenseNo} erteilt.`});
  await persist.drivers();
  go('driverform', id);
}
async function setLicenseStatus(id, status){
  const d = driverById(id);
  if(status==='Entzogen' && !confirm('Lizenz wirklich entziehen?')) return;
  d.licenseStatus = status;
  d.history = d.history||[]; d.history.push({ts:Date.now(), text:`Lizenzstatus geändert zu: ${status}`});
  await persist.drivers();
  go('driverform', id);
}

/* ============================= TEAMS ============================= */
function pageTeams(){
  const freeDrivers = DB.drivers.filter(d=>!d.teamId).sort((a,b)=>driverName(a).localeCompare(driverName(b)));
  const cards = DB.teams.map(t=>{
    const roster = DB.drivers.filter(d=>d.teamId===t.id);
    const caseCount = DB.cases.filter(c=>c.teamInvolved===t.id).length;
    return `
    <div class="panel" style="border-top:3px solid ${t.color};padding-top:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="teamchip" style="font-size:16px;font-weight:800;"><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</div>
          <div style="color:var(--grey-2);font-size:12px;margin-top:2px;">${esc(t.country||'')}</div>
        </div>
        <div style="text-align:right;font-family:var(--mono);">
          <div style="font-size:20px;font-weight:700;">${caseCount}</div>
          <div style="font-size:10px;color:var(--grey-2);text-transform:uppercase;">Fälle</div>
        </div>
      </div>
      <div class="sectiontitle" style="margin:14px 0 8px;">Aufstellung (${roster.length})</div>
      ${roster.length? roster.map(d=>`<div class="rowlink" onclick="go('driverform','${d.id}')" style="padding:6px 4px;display:flex;justify-content:space-between;border-bottom:1px solid var(--line);">
        <span>${divisionBadge(d)}${esc(driverName(d))} ${d.number?('#'+esc(d.number)):''}</span>
        <span class="tag ${licenseTagClass(d.licenseStatus||'Nicht ausgestellt')}">${esc(d.licenseStatus||'Nicht ausgestellt')}</span>
      </div>`).join('') : `<div style="color:var(--grey-2);font-size:13px;">Noch keine Fahrer zugeordnet.</div>`}
    </div>`;
  }).join('');
  const freeDriversCard = `<div class="panel" style="border-top:3px solid var(--gold);padding-top:16px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div class="teamchip" style="font-size:16px;font-weight:800;"><span class="dot" style="background:var(--gold)"></span>Free Drivers</div>
        <div style="color:var(--grey-2);font-size:12px;margin-top:2px;">Noch keinem Team zugeordnet</div>
      </div>
      <div style="text-align:right;font-family:var(--mono);">
        <div style="font-size:20px;font-weight:700;">${freeDrivers.length}</div>
        <div style="font-size:10px;color:var(--grey-2);text-transform:uppercase;">Fahrer</div>
      </div>
    </div>
    <div class="sectiontitle" style="margin:14px 0 8px;">Fahrerübersicht</div>
    ${freeDrivers.length? freeDrivers.map(d=>`<div class="rowlink" onclick="go('driverform','${d.id}')" style="padding:6px 4px;display:flex;justify-content:space-between;border-bottom:1px solid var(--line);">
      <span>${divisionBadge(d)}${esc(driverName(d))} ${d.number?('#'+esc(d.number)):''}</span>
      <span class="tag ${licenseTagClass(d.licenseStatus||'Nicht ausgestellt')}">${esc(d.licenseStatus||'Nicht ausgestellt')}</span>
    </div>`).join('') : `<div style="color:var(--grey-2);font-size:13px;">Keine freien Fahrer erfasst.</div>`}
  </div>`;

  return `
  <div class="pagehead"><div><div class="eyebrow">Konstrukteure</div><h1>Teams — Saison 2026</h1></div></div>
  <div class="grid cols-3">${freeDriversCard}${cards}</div>
  `;
}

/* ============================= TRANSFERS ============================= */
function pageTransfers(){
  const rows = [...DB.transfers].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(t=>{
    const d = driverById(t.driverId);
    return `<tr>
      <td>${fmtDate(t.date)}</td>
      <td>${esc(driverName(d))}</td>
      <td>${esc(teamById(t.fromTeamId)?.name || '—')}</td>
      <td>${esc(teamById(t.toTeamId)?.name || '—')}</td>
      <td>${esc(t.note||'—')}</td>
      <td>${esc(t.status || 'Erfasst')}</td>
      <td><button class="btn small danger" onclick="deleteTransfer('${t.id}')">Löschen</button></td>
    </tr>`;
  }).join('');

  return `
  <div class="pagehead"><div><div class="eyebrow">Fahrermarkt</div><h1>Transfers</h1></div></div>

  <div class="panel">
    <h2>Neuer <b>Transfer</b></h2>
    <div class="grid cols-4">
      <div class="field"><label>Fahrer</label><select id="t_driver" onchange="onTransferDriverChange()">
        <option value="">— wählen —</option>
        ${DB.drivers.map(d=>`<option value="${d.id}">${esc(driverName(d))} (${esc(teamById(d.teamId)?.name||'ohne Team')})</option>`).join('')}
      </select></div>
      <div class="field"><label>Neues Team</label><select id="t_toTeam">${teamOptions('',false)}</select></div>
      <div class="field"><label>Datum</label><input id="t_date" type="date" value="${today()}"></div>
      <div class="field"><label>Notiz</label><input id="t_note" type="text" placeholder="z. B. Saisonwechsel 2027"></div>
    </div>
    <button class="btn primary" onclick="createTransfer()">Transfer eintragen</button>
  </div>

  <div class="panel">
    <h2>Transfer<b>historie</b></h2>
    <table><thead><tr><th>Datum</th><th>Fahrer</th><th>Von</th><th>Nach</th><th>Notiz</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7"><div class="empty">Noch keine Transfers erfasst.</div></td></tr>`}</tbody></table>
  </div>
  `;
}
function onTransferDriverChange(){}
async function createTransfer(){
  const driverId = document.getElementById('t_driver').value;
  const toTeamId = document.getElementById('t_toTeam').value;
  const date = document.getElementById('t_date').value;
  const note = document.getElementById('t_note').value.trim();
  if(!driverId || !toTeamId){ alert('Bitte Fahrer und Zielteam auswählen.'); return; }
  const d = driverById(driverId);
  const fromTeamId = d.teamId;
  if(fromTeamId===toTeamId){ alert('Der Fahrer steht bereits bei diesem Team.'); return; }
  const transferId = uid();
  const transfer = {
    id: transferId,
    driverId,
    fromTeamId,
    toTeamId,
    date,
    note,
    status: 'An Tier 3 eskaliert',
    createdAt: Date.now(),
    escalationId: null
  };
  const escalation = {
    id: uid(),
    caseId: `transfer-${transferId}`,
    sourceType: 'transfer',
    sourceId: transferId,
    stw: `TR-${Math.floor(1000 + Math.random()*9000)}`,
    caseName: `Transfer ${driverName(d)}`,
    drivers: driverName(d),
    type: 'Transfer',
    reason: `Transferantrag für ${driverName(d)}: ${teamById(fromTeamId)?.name || 'Aktuelles Team'} → ${teamById(toTeamId)?.name || 'Zielteam'}.`,
    requiredSupport: 'Bestätigung durch Tier 3 und Erstellung der Finanzabwicklung für den Transfer.',
    originalSteward: AUTH.profile?.display_name || 'Steward Team',
    escalatedAt: Date.now(),
    status: 'An Tier 3 eskaliert',
    targetTier: 3,
    tier3User: 'Tier 3',
    updatedAt: Date.now(),
    feedback: '',
    transferId
  };
  transfer.escalationId = escalation.id;
  DB.transfers.push(transfer);
  DB.escalations.push(escalation);
  d.history = d.history||[]; d.history.push({ts:Date.now(), text:`Transfer eingereicht: ${teamById(fromTeamId)?.name||'—'} → ${teamById(toTeamId)?.name||'—'} · wartet auf Tier-3-Freigabe`});
  await persist.transfers();
  await persist.drivers();
  await persist.escalations();
  go('escalations-t3', escalation.id);
}
async function confirmTransferEscalation(id){
  const escalation = DB.escalations.find(item=>item.id===id); if(!escalation) return;
  const transfer = DB.transfers.find(item=>item.id===escalation.sourceId); if(!transfer) return;
  const d = driverById(transfer.driverId); if(!d) return;
  d.teamId = transfer.toTeamId;
  transfer.status = 'Bestätigt';
  transfer.approvedBy = AUTH.profile?.display_name || 'Tier 3';
  transfer.confirmedAt = Date.now();
  d.history = d.history||[]; d.history.push({ts:Date.now(), text:`Transfer bestätigt: ${teamById(transfer.fromTeamId)?.name||'—'} → ${teamById(transfer.toTeamId)?.name||'—'}`});
  DB.finance.push({
    id: uid(),
    season: DB.financeSettings?.season || '2026',
    teamId: transfer.toTeamId,
    race: 'Transfer',
    date: transfer.date || today(),
    type: 'Transfer',
    category: 'Transfer',
    description: `Transfer bestätigt: ${driverName(d)} • ${teamById(transfer.fromTeamId)?.name || '—'} → ${teamById(transfer.toTeamId)?.name || '—'}`,
    amount: 0,
    counterparty: 'Steward Office',
    status: 'Erfasst',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  escalation.status = 'Bestätigt durch Tier 3';
  escalation.feedback = escalation.feedback || 'Transfer freigegeben. Finanzabwicklung angelegt.';
  escalation.updatedAt = Date.now();
  await persist.transfers();
  await persist.drivers();
  await persist.escalations();
  await persist.finance();
  go('escalations-t3', id);
}
async function deleteTransfer(id){
  if(!confirm('Diesen Transfer-Eintrag löschen? (Team-Zuordnung des Fahrers bleibt unverändert.)')) return;
  DB.transfers = DB.transfers.filter(t=>t.id!==id);
  await persist.transfers();
  go('transfers');
}

/* ============================= ARCHIVE ============================= */
function archiveField(label, value, multiline){
  return `<div class="field archive-field"><label>${esc(label)}</label><div class="archive-value${multiline?' multiline':''}">${multiline?nl2br(value||'—'):esc(value||'—')}</div></div>`;
}
function pageArchive(){
  const cases=DB.cases.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const actions=DB.caseActivityLog.slice().sort((a,b)=>(b.ts||0)-(a.ts||0));
  const deleted=DB.deletedCaseLog.slice().sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0));
  return `<div class="pagehead"><div><div class="eyebrow">Verwaltung · Nur lesen</div><h1>Aktenarchiv</h1></div><div class="actions"><button class="btn" onclick="go('manage')">← Verwaltung</button></div></div>
  <div class="panel archive-intro"><h2>Gespeicherte <b>Akten</b></h2><p>Hier werden ausschließlich bereits angelegte Akten angezeigt. Die Archivansicht ist schreibgeschützt.</p></div>
  <div class="panel"><div class="archive-section-head"><h2>Aktennummern</h2><span>${cases.length} angelegt</span></div><div class="archive-case-list">${cases.map(c=>`<button class="archive-case-row" onclick="go('archive','${c.id}')"><span class="archive-case-no">${esc(c.stw||'Ohne Nummer')}</span><span class="archive-case-meta"><b>${esc(c.event||'Ohne Event')}</b><small>${esc(c.category||'Sonstiger Vorfall')} · ${esc(c.status||'Neu')}</small></span><span class="archive-category-dot" style="background:${categoryColor(c.category)}"></span><span class="archive-open">Ansehen →</span></button>`).join('')||'<div class="empty">Noch keine Akten angelegt.</div>'}</div></div>
  <div class="archive-log-grid"><section class="panel"><div class="archive-section-head"><h2>Aktionslog</h2><span>Nur ansehen</span></div><div class="archive-log">${actions.map(item=>`<div class="archive-log-row"><span class="archive-log-mark" style="background:${categoryColor(item.category)}"></span><div><b>${esc(item.stw)}</b><span>${esc(item.action)}</span><small>${fmtDateTime(item.ts)} · ${esc(item.category)}</small></div></div>`).join('')||'<div class="empty">Noch keine Aktionen protokolliert.</div>'}</div></section><section class="panel"><div class="archive-section-head"><h2>Gelöschte Akten</h2><span>Nur ansehen</span></div><div class="archive-log">${deleted.map(item=>`<div class="archive-log-row deleted"><span class="archive-log-mark"></span><div><b>${esc(item.stw||'Unbekannte Akte')}</b><span>Akte gelöscht</span><small>${fmtDateTime(item.deletedAt)} · ${esc(item.event||'Ohne Event')}</small></div></div>`).join('')||'<div class="empty">Keine gelöschten Akten protokolliert.</div>'}</div></section></div>`;
}
function pageArchiveCase(id){
  const c=DB.cases.find(item=>item.id===id);
  if(!c) return `<div class="pagehead"><div><div class="eyebrow">Aktenarchiv</div><h1>Akte nicht gefunden</h1></div><button class="btn" onclick="go('archive')">← Zum Archiv</button></div><div class="empty">Diese Akte ist nicht mehr im Archiv vorhanden.</div>`;
  const driver=driverById(c.driverInvolved), affected=driverById(c.driverAffected);
  return `<div class="pagehead"><div><div class="eyebrow">Aktenarchiv · Nur lesen</div><h1>${esc(c.stw||'Akte')}</h1></div><div class="actions"><button class="btn" onclick="go('archive')">← Zum Archiv</button></div></div><div class="panel archive-readonly-head"><div><span class="archive-case-no">${esc(c.stw||'—')}</span><h2>${esc(c.event||'Ohne Event')}</h2></div><span class="tag ${statusTagClass(c.status)}">${esc(c.status||'Neu')}</span></div><div class="panel"><div class="archive-section-head"><h2>Akteninhalt</h2><span>Schreibgeschützt</span></div><div class="grid cols-3">${archiveField('Saison',c.season)}${archiveField('Session',c.sessionType)}${archiveField('Zeitpunkt',c.incidentLap)}${archiveField('Kategorie',c.category)}${archiveField('Meldung durch',c.reportedBy)}${archiveField('Angelegt am',fmtDateTime(c.createdAt))}</div><div class="sectiontitle">Beteiligte</div><div class="grid cols-2">${archiveField('Beschuldigtes Team',teamById(c.teamInvolved)?.name)}${archiveField('Betroffener Fahrer',driverName(driver))}${archiveField('Geschädigtes Team',teamById(c.teamAffected)?.name)}${archiveField('Geschädigter Fahrer',driverName(affected))}</div><div class="sectiontitle">Sachverhalt</div>${archiveField('Beschreibung des Vorfalls',c.description,true)}<div class="grid cols-2">${archiveField('Beweismittel',c.evidenceLink)}${archiveField('Anhörung',c.hearingHeld?'Durchgeführt':'Nicht dokumentiert')}</div>${archiveField('Untersuchung / Anmerkungen',c.investigationNotes,true)}<div class="grid cols-2">${archiveField('Regelverstoß',c.regulationBreach)}${archiveField('Präzedenzfall',c.precedent)}</div><div class="sectiontitle">Entscheidung</div><div class="grid cols-2">${archiveField('Entscheidung',c.decision)}${archiveField('Strafpunkte',String(c.penaltyPoints||0))}${archiveField('Lizenzstatus',c.licenseStatusAfter)}${archiveField('Lizenzdetail',c.licenseStatusDetail)}</div>${archiveField('Begründung / Detail',c.decisionDetail,true)}</div>${c.history?.length?`<div class="panel"><div class="archive-section-head"><h2>Aktenhistorie</h2><span>Nur ansehen</span></div><div class="archive-log">${c.history.slice().reverse().map(item=>`<div class="archive-log-row"><span class="archive-log-mark" style="background:${categoryColor(c.category)}"></span><div><b>${fmtDateTime(item.ts)}</b><span>${esc(item.text)}</span></div></div>`).join('')}</div></div>`:''}`;
}

/* ============================= MANAGEMENT ============================= */
let MANAGE_TAB = 'cases';
function pageManage(){
  return `
  <div class="pagehead"><div><div class="eyebrow">Administration</div><h1>Verwaltung</h1></div></div>
  <div class="tabs">
    <div class="tab ${MANAGE_TAB==='cases'?'active':''}" onclick="setManageTab('cases')">Akten (${DB.cases.length})</div>
    <div class="tab ${MANAGE_TAB==='drivers'?'active':''}" onclick="setManageTab('drivers')">Fahrer (${DB.drivers.length})</div>
    <div class="tab ${MANAGE_TAB==='teams'?'active':''}" onclick="setManageTab('teams')">Teams (${DB.teams.length})</div>
    <div class="tab ${MANAGE_TAB==='transfers'?'active':''}" onclick="setManageTab('transfers')">Transfers (${DB.transfers.length})</div>
    <div class="tab ${MANAGE_TAB==='finance'?'active':''}" onclick="setManageTab('finance')">Finanzen</div>
    <div class="tab ${MANAGE_TAB==='integrations'?'active':''}" onclick="setManageTab('integrations')">Integrationen</div>
    <div class="tab ${MANAGE_TAB==='data'?'active':''}" onclick="setManageTab('data')">Daten &amp; Backup</div>
    <div class="tab ${MANAGE_TAB==='users'?'active':''}" onclick="setManageTab('users')">Benutzer &amp; Rollen</div>
    <div class="tab ${MANAGE_TAB==='esport'?'active':''}" onclick="setManageTab('esport')">CFC Esport</div>
  </div>
  <div id="manageBody"></div>
  `;
}
function setManageTab(t){
  MANAGE_TAB=t;
  document.getElementById('main').innerHTML = pageManage();
  renderManageBody();
  if(MANAGE_TAB==='integrations') renderPublicSharePanel();
}
function renderPublicSharePanel(){
  const el=document.getElementById('manageBody');
  if(!el) return;
  const panel=document.createElement('div');
  panel.className='panel';
  panel.innerHTML='<h2>Benutzerzugang</h2><p style="color:var(--grey);font-size:13.5px;">Jede Person benötigt ein persönliches Supabase-Auth-Konto. Neue Konten erhalten automatisch Tier 1; Position und höhere Rechte weist Tier 3 unter „Benutzer & Rollen“ zu.</p>';
  el.insertBefore(panel,el.firstChild);
}
function renderManageBody(){
  const el = document.getElementById('manageBody');
  if(MANAGE_TAB==='users'){ loadUserProfiles(el); return; }
  if(MANAGE_TAB==='cases'){
    el.innerHTML = `<div class="panel"><table><thead><tr><th>STW-Nr.</th><th>Event</th><th>Kategorie</th><th>Status</th><th></th></tr></thead><tbody>
      ${DB.cases.map(c=>`<tr><td class="pts">${esc(c.stw)}</td><td>${esc(c.event||'—')}</td><td>${esc(c.category||'—')}</td>
      <td><span class="tag ${statusTagClass(c.status)}">${esc(c.status)}</span></td>
      <td style="display:flex;gap:6px;"><button class="btn small" onclick="go('caseform','${c.id}')">Bearbeiten</button><button class="btn small" onclick="sendCaseDiscordNotification('${c.id}')">Discord</button><button class="btn small danger" onclick="deleteCase('${c.id}')">Löschen</button></td></tr>`).join('')
      || `<tr><td colspan="5"><div class="empty">Keine Akten vorhanden.</div></td></tr>`}
      </tbody></table></div>`;
  } else if(MANAGE_TAB==='drivers'){
    el.innerHTML = `<div class="panel"><table><thead><tr><th>Fahrer</th><th>Team</th><th>Lizenz</th><th></th></tr></thead><tbody>
      ${DB.drivers.map(d=>`<tr><td>${esc(driverName(d))}</td><td>${esc(teamById(d.teamId)?.name||'—')}</td>
      <td><span class="tag ${licenseTagClass(d.licenseStatus||'Nicht ausgestellt')}">${esc(d.licenseStatus||'Nicht ausgestellt')}</span></td>
      <td style="display:flex;gap:6px;"><button class="btn small" onclick="go('driverform','${d.id}')">Bearbeiten</button><button class="btn small danger" onclick="deleteDriver('${d.id}')">Löschen</button></td></tr>`).join('')
      || `<tr><td colspan="4"><div class="empty">Keine Fahrer vorhanden.</div></td></tr>`}
      </tbody></table></div>`;
  } else if(MANAGE_TAB==='teams'){
    el.innerHTML = `<div class="panel">
      <h2>Team <b>hinzufügen</b></h2>
      <div class="grid cols-4">
        <div class="field"><label>Name</label><input id="nt_name" type="text"></div>
        <div class="field"><label>Land</label><input id="nt_country" type="text"></div>
        <div class="field"><label>Farbe</label><input id="nt_color" type="text" placeholder="#RRGGBB" value="#c8102e"></div>
        <div class="field" style="display:flex;align-items:flex-end;"><button class="btn primary" onclick="addTeam()">Team anlegen</button></div>
      </div>
      <table><thead><tr><th>Team</th><th>Land</th><th></th></tr></thead><tbody>
      ${DB.teams.map(t=>`<tr><td><span class="teamchip"><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</span></td><td>${esc(t.country||'—')}</td>
      <td><button class="btn small danger" onclick="deleteTeam('${t.id}')">Löschen</button></td></tr>`).join('')}
      </tbody></table>
      <div class="footer-note">Hinweis: Beim Löschen eines Teams bleiben zugeordnete Fahrer und Akten bestehen, verlieren aber die Teamzuordnung.</div>
      </div>`;
  } else if(MANAGE_TAB==='transfers'){
    el.innerHTML = `<div class="panel"><table><thead><tr><th>Datum</th><th>Fahrer</th><th>Von</th><th>Nach</th><th></th></tr></thead><tbody>
      ${DB.transfers.map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${esc(driverName(driverById(t.driverId)))}</td>
      <td>${esc(teamById(t.fromTeamId)?.name||'—')}</td><td>${esc(teamById(t.toTeamId)?.name||'—')}</td>
      <td><button class="btn small danger" onclick="deleteTransfer('${t.id}')">Löschen</button></td></tr>`).join('')
      || `<tr><td colspan="5"><div class="empty">Keine Transfers vorhanden.</div></td></tr>`}
      </tbody></table></div>`;
  } else if(MANAGE_TAB==='finance'){
    const s=DB.financeSettings||{};
    el.innerHTML=`<div class="panel"><h2>Finanz<b>einstellungen</b></h2><div class="grid cols-4"><div class="field"><label>Saison</label><input id="fs_season" type="text" value="${esc(s.season||'2026')}"></div><div class="field"><label>Startkapital</label><input id="fs_capital" type="number" min="0" step="0.01" value="${Number(s.startingCapital||0)}"></div><div class="field"><label>Währung</label><select id="fs_currency">${selectOptions(['EUR','CHF','USD','GBP'],s.currency||'EUR')}</select></div><div class="field" style="display:flex;align-items:flex-end"><button class="btn primary" onclick="saveFinanceSettings()">Einstellungen speichern</button></div></div><p class="footer-note">Alle Beträge werden im Finanzjournal als Einnahme oder Ausgabe verbucht. Änderungen sind sofort im Dashboard sichtbar.</p></div><div class="panel"><h2>Aktuelle <b>Übersicht</b></h2><table><tbody><tr><td>Kontostand</td><td class="pts">${financeAmount(financeBalance())}</td></tr><tr><td>Buchungen</td><td class="pts">${DB.finance.length}</td></tr></tbody></table></div>`;
  } else if(MANAGE_TAB==='integrations'){
    const config=supabaseConfig(), s=DB.financeSettings||{};
    el.innerHTML=`<div class="panel"><h2>Supabase <b>Realtime</b></h2><p style="color:var(--grey);font-size:13.5px;">Trage die Projekt-URL und den öffentlichen anon-Key ein. Der gesamte Datenbestand wird danach live zwischen allen offenen Browsern synchronisiert. Für andere Geräte muss der Freigabelink aus diesem Bereich verwendet werden.</p><div class="grid cols-2"><div class="field"><label>Supabase Project URL</label><input id="sb_url" type="url" value="${esc(config.url||'')}" placeholder="https://xxxx.supabase.co"></div><div class="field"><label>Supabase anon public key</label><input id="sb_key" type="text" value="${esc(config.anonKey||'')}"></div></div><button class="btn primary" onclick="saveSupabaseSettings()">Supabase verbinden</button><span id="sb_status" class="footer-note" style="margin-left:12px;">${esc(SUPABASE.status)}</span></div><div class="panel"><h2>Discord <b>Webhooks</b></h2><p style="color:var(--grey);font-size:13.5px;">Verwende den Finanz-Webhook für Rechnungen und den Akten-Webhook für Steward-Akten. Beide können im selben oder in getrennten Kanälen liegen.</p><div class="field"><label>Finanz-Webhook URL</label><input id="discord_webhook" type="url" value="${esc(s.discordWebhookUrl||'')}" placeholder="https://discord.com/api/webhooks/…"></div><div class="field"><label>Akten-Webhook URL</label><input id="case_webhook" type="url" value="${esc(s.caseWebhookUrl||'')}" placeholder="https://discord.com/api/webhooks/…"></div><div class="field"><label>Öffentliche Website-URL</label><input id="finance_site_url" type="url" value="${esc(s.siteUrl||location.href.split('#')[0])}" placeholder="https://deine-domain.de/"></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn gold" onclick="saveFinanceSettings()">Webhooks speichern</button><button class="btn" onclick="sendDiscordTest()">Finanz-Test senden</button><button class="btn" onclick="sendCaseDiscordTest()">Akten-Test senden</button></div></div>`;
  } else if(MANAGE_TAB==='data'){
    el.innerHTML = `<div class="panel">
      <h2>Daten<b>sicherung</b></h2>
      <p style="color:var(--grey);font-size:13.5px;">Exportiere den gesamten Datenbestand als JSON-Datei oder spiele eine zuvor exportierte Sicherung wieder ein.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button class="btn gold" onclick="exportData()">Alle Daten exportieren (.json)</button>
        <label class="btn" style="cursor:pointer;">Backup importieren
          <input type="file" accept="application/json" style="display:none;" onchange="importData(event)">
        </label>
        <button class="btn danger" onclick="resetAllData()">Alle Daten zurücksetzen</button>
      </div>
    </div>`;
  } else if(MANAGE_TAB==='esport'){
    const esportDrivers=DB.drivers.filter(driver=>driver.esportProfile);
    const setupRows=DB.esportSetups.slice().sort((a,b)=>String(a.track).localeCompare(String(b.track),'de')).map(setup=>`<tr><td>${esc(setup.track)}</td><td>${esc(setup.name||'Race Setup')}</td><td class="pts">${fmtDateTime(setup.updatedAt)}</td><td style="white-space:nowrap"><button class="btn small" onclick="go('esport-setup','${esc(setup.track)}')">Bearbeiten</button><button class="btn small danger" onclick="deleteEsportSetupFromManage('${esc(setup.track)}')">Löschen</button></td></tr>`).join('');
    const driverRows=esportDrivers.map(driver=>{const profile=esportProfile(driver);const analysisCount=Object.keys(profile.trackAnalysis||{}).length;return `<tr><td><b>${esc(driverName(driver))}</b><div style="color:var(--grey);font-size:12px;">${esc(profile.role||'Esport-Fahrer')}</div></td><td>${esc(teamById(driver.teamId)?.name||'—')}</td><td><span class="tag ${profile.status==='Aktiv'?'active':profile.status==='Pausiert'?'suspended':'open'}">${esc(profile.status||'Assessment')}</span></td><td>${analysisCount} / ${ESPORT_TRACKS.length}</td><td style="white-space:nowrap"><button class="btn small" onclick="go('esport-driverform','${driver.id}')">Bearbeiten</button><button class="btn small danger" onclick="removeEsportProfile('${driver.id}')">Esport-Profil entfernen</button></td></tr>`;}).join('');
    el.innerHTML=`<div class="panel" style="border-top:3px solid #54d9e8"><h2>CFC Esport <b>Verwaltung</b></h2><p style="color:var(--grey);font-size:13.5px;margin-top:-4px;">Dieser Bereich enthält ausschließlich Esport-Daten. Stammdaten, Coaching, Streckenanalysen und Setups können hier direkt bearbeitet werden.</p><div class="esport-status"><span class="tag">${esportDrivers.length} Fahrerprofile</span><span class="tag">${DB.esportSetups.length} Strecken-Setups</span><span class="tag">${ESPORT_TRACKS.length} Strecken verfügbar</span></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" onclick="go('esport-driverform')">+ Esport-Fahrer erfassen</button><button class="btn gold" onclick="go('esport-setup')">+ Setup bearbeiten</button><button class="btn" onclick="go('esport')">Esport-Bereich öffnen</button></div></div><div class="panel"><h2>Esport-Fahrer <b>Profile</b></h2><div style="overflow:auto"><table><thead><tr><th>Fahrer</th><th>Team</th><th>Status</th><th>Streckenanalyse</th><th></th></tr></thead><tbody>${driverRows||'<tr><td colspan="5"><div class="empty"><b>Keine Esport-Profile</b>Lege ein Profil im CFC Esport Driver Room an.</div></td></tr>'}</tbody></table></div></div><div class="panel"><h2>F1 26 <b>Strecken-Setups</b></h2><div style="overflow:auto"><table><thead><tr><th>Strecke</th><th>Setup</th><th>Zuletzt geändert</th><th></th></tr></thead><tbody>${setupRows||'<tr><td colspan="4"><div class="empty"><b>Keine Setups gespeichert</b>Öffne das F1 26 Setup Lab, um ein Strecken-Setup zu erstellen.</div></td></tr>'}</tbody></table></div></div>`;
  }
}
async function loadUserProfiles(container){
  if(Number(AUTH.profile?.access_tier)<3){ container.innerHTML='<div class="panel"><h2>Zugriff verweigert</h2></div>'; return; }
  container.innerHTML='<div class="panel"><div class="loading">Benutzerprofile werden geladen …</div></div>';
  const result=await SUPABASE.client.from('zfc_user_profiles').select('id,email,display_name,position,access_tier,created_at').order('created_at');
  if(result.error){ container.innerHTML=`<div class="panel"><h2>Profile konnten nicht geladen werden</h2><p>${esc(result.error.message)}</p></div>`; return; }
  container.innerHTML=`<div class="panel"><h2>Neues Konto <b>einladen</b></h2><p class="footer-note">Die Person erhält einen einmaligen Bestätigungslink per E-Mail und wählt nach der Bestätigung ein eigenes Passwort.</p><div class="grid cols-4"><div class="field"><label>Name</label><input id="new_user_name" autocomplete="name" required></div><div class="field"><label>E-Mail</label><input id="new_user_email" type="email" autocomplete="email" required></div><div class="field"><label>Position</label><input id="new_user_position" placeholder="z. B. Steward" required></div><div class="field"><label>Tier</label><select id="new_user_tier"><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select></div></div><button class="btn primary" onclick="createManagedUser()">Einladung senden</button><span id="new_user_status" class="footer-note" role="status" style="margin-left:10px"></span><p class="footer-note">Voraussetzung: Edge Function „admin-create-user“ ist deployed und mit APP_URL sowie SUPABASE_SERVICE_ROLE_KEY konfiguriert.</p></div><div class="panel"><h2>Benutzer <b>und Berechtigungen</b></h2><div style="overflow:auto"><table><thead><tr><th>Benutzer</th><th>Position</th><th>Tier</th><th></th></tr></thead><tbody>${result.data.map(profile=>`<tr><td><strong>${esc(profile.display_name||profile.email)}</strong><div class="footer-note">${esc(profile.email)}</div></td><td><input id="position_${profile.id}" value="${esc(profile.position||'Steward')}" aria-label="Position"></td><td><select id="tier_${profile.id}" aria-label="Tier"><option value="1" ${Number(profile.access_tier)===1?'selected':''}>Tier 1</option><option value="2" ${Number(profile.access_tier)===2?'selected':''}>Tier 2</option><option value="3" ${Number(profile.access_tier)===3?'selected':''}>Tier 3</option></select></td><td><button class="btn small primary" onclick="saveUserProfile('${profile.id}')">Speichern</button></td></tr>`).join('')||'<tr><td colspan="4">Noch keine Benutzerprofile vorhanden.</td></tr>'}</tbody></table></div></div>`;
}
async function createManagedUser(){
  const status=document.getElementById('new_user_status');
  const payload={email:document.getElementById('new_user_email')?.value.trim(),displayName:document.getElementById('new_user_name')?.value.trim(),position:document.getElementById('new_user_position')?.value.trim(),accessTier:Number(document.getElementById('new_user_tier')?.value||1)};
  if(!payload.email||!payload.displayName||!payload.position){ if(status) status.textContent='Name, E-Mail und Position sind erforderlich.'; return; }
  if(status) status.textContent='Einladung wird gesendet …';
  const {data,error}=await SUPABASE.client.functions.invoke('admin-create-user',{body:payload});
  if(error){ if(status) status.textContent=`Einladung fehlgeschlagen: ${error.message}`; return; }
  await loadUserProfiles(document.getElementById('manageBody'));
  const refreshedStatus=document.getElementById('new_user_status');
  if(refreshedStatus) refreshedStatus.textContent=`Einladung an ${data.user.email} gesendet.`;
}
function pageSetPassword(){
  return `<div class="pagehead"><div><div class="eyebrow">Einladung bestätigt</div><h1>Eigenes Passwort setzen</h1></div></div><div class="panel"><h2>Passwort <b>festlegen</b></h2><p>Wähle ein persönliches Passwort für dein Konto.</p><div class="grid cols-2"><div class="field"><label>Neues Passwort</label><input id="invite_password" type="password" autocomplete="new-password" minlength="12" required></div><div class="field"><label>Passwort wiederholen</label><input id="invite_password_confirm" type="password" autocomplete="new-password" minlength="12" required></div></div><p id="invite_password_status" class="footer-note" role="status"></p><button class="btn primary" onclick="saveInvitedPassword()">Passwort speichern</button></div>`;
}
async function saveInvitedPassword(){
  const password=document.getElementById('invite_password')?.value||'';
  const confirmation=document.getElementById('invite_password_confirm')?.value||'';
  const status=document.getElementById('invite_password_status');
  if(password.length<12){ if(status) status.textContent='Das Passwort muss mindestens 12 Zeichen lang sein.'; return; }
  if(password!==confirmation){ if(status) status.textContent='Die Passwörter stimmen nicht überein.'; return; }
  const {error}=await SUPABASE.client.auth.updateUser({password});
  if(error){ if(status) status.textContent=`Passwort konnte nicht gespeichert werden: ${error.message}`; return; }
  const url=new URL(location.href); url.searchParams.delete('flow');
  history.replaceState(null,'',url.pathname+url.search+'#dashboard');
  go('dashboard');
}
async function saveUserProfile(id){
  const position=document.getElementById(`position_${id}`)?.value.trim()||'Steward';
  const access_tier=Number(document.getElementById(`tier_${id}`)?.value||1);
  const result=await SUPABASE.client.from('zfc_user_profiles').update({position,access_tier,updated_at:new Date().toISOString()}).eq('id',id);
  if(result.error){ alert(`Profil konnte nicht gespeichert werden: ${result.error.message}`); return; }
  if(id===AUTH.profile.id){ AUTH.profile={...AUTH.profile,position,access_tier}; renderAccountBadge(); }
  alert('Benutzerprofil gespeichert.');
  render();
}
function removeEsportProfile(id){
  const driver=driverById(id); if(!driver || !confirm(`Esport-Profil von ${driverName(driver)} entfernen? Die normale Fahrerakte bleibt erhalten.`)) return;
  delete driver.esportProfile; persist.drivers(); render();
}
function deleteEsportSetupFromManage(track){
  if(!confirm(`Setup für ${track} löschen?`)) return;
  DB.esportSetups=DB.esportSetups.filter(setup=>setup.track!==track); persist.esportSetups(); render();
}
async function saveFinanceSettings(){
  DB.financeSettings={...DB.financeSettings,season:document.getElementById('fs_season')?.value||DB.financeSettings.season,startingCapital:Number(document.getElementById('fs_capital')?.value||0),currency:document.getElementById('fs_currency')?.value||DB.financeSettings.currency,discordWebhookUrl:document.getElementById('discord_webhook')?.value||DB.financeSettings.discordWebhookUrl||'',caseWebhookUrl:document.getElementById('case_webhook')?.value||DB.financeSettings.caseWebhookUrl||'',siteUrl:document.getElementById('finance_site_url')?.value.trim()||DB.financeSettings.siteUrl||location.href.split('#')[0]};
  await persist.financeSettings();
  if(SUPABASE.client) await SUPABASE.client.from('zfc_finance_settings').upsert({id:'00000000-0000-0000-0000-000000000001',season:DB.financeSettings.season,starting_capital:DB.financeSettings.startingCapital,currency:DB.financeSettings.currency,discord_webhook_url:DB.financeSettings.discordWebhookUrl,case_webhook_url:DB.financeSettings.caseWebhookUrl,site_url:DB.financeSettings.siteUrl,updated_at:new Date().toISOString()});
  alert('Finanzeinstellungen gespeichert.'); render();
}
async function saveSupabaseSettings(){
  const config={url:document.getElementById('sb_url').value.trim().replace(/\/$/,''),anonKey:document.getElementById('sb_key').value.trim()};
  if(SUPABASE.channel && SUPABASE.client) await SUPABASE.client.removeChannel(SUPABASE.channel);
  SUPABASE.channel=null;
  SUPABASE.client=null;
  saveKey(KEYS.supabase,config); await initSupabase(); alert(SUPABASE.client?'Supabase verbunden.':'Verbindung konnte nicht aufgebaut werden.'); render();
}
async function copyPublicShareUrl(){
  const url=publicShareUrl();
  if(!url){ alert('Bitte zuerst Supabase verbinden.'); return; }
  await navigator.clipboard.writeText(url); alert('Öffentlicher Team-Link wurde kopiert.');
}
function openPublicShareUrl(){
  const url=publicShareUrl();
  if(!url){ alert('Bitte zuerst Supabase verbinden.'); return; }
  window.open(url,'_blank','noopener');
}
function createPublicQr(){
  const url=publicShareUrl(), target=document.getElementById('public_qr');
  if(!url){ alert('Bitte zuerst Supabase verbinden.'); return; }
  if(!window.QRCode || !target){ alert('QR-Code-Bibliothek konnte nicht geladen werden.'); return; }
  target.innerHTML=''; const canvas=document.createElement('canvas'); target.appendChild(canvas); QRCode.toCanvas(canvas,url,{width:220,margin:2},error=>{ if(error) target.textContent='QR-Code konnte nicht erzeugt werden.'; });
}
async function sendDiscordTest(){
  const webhook=document.getElementById('discord_webhook')?.value.trim()||DB.financeSettings.discordWebhookUrl;
  if(!webhook){ alert('Bitte zuerst eine Discord-Webhook-URL eintragen.'); return; }
  try{ const response=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'ZFC Racing Office',content:'✅ Testnachricht aus dem ZFC Racing Stewards Office.'})}); if(!response.ok) throw new Error('HTTP '+response.status); alert('Testnachricht wurde an Discord gesendet.'); }
  catch(error){ alert('Discord konnte nicht erreicht werden. Prüfe Webhook und Browser-Konsole.'); }
}
async function sendCaseDiscordTest(){
  const webhook=document.getElementById('case_webhook')?.value.trim()||DB.financeSettings.caseWebhookUrl;
  if(!webhook){ alert('Bitte zuerst einen Akten-Webhook eintragen.'); return; }
  try{ const response=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'ZFC Racing Stewards',content:'Testnachricht für Steward-Akten aus dem ZFC Racing Office.'})}); if(!response.ok) throw new Error('HTTP '+response.status); alert('Akten-Testnachricht wurde gesendet.'); }
  catch(error){ alert('Akten-Webhook konnte nicht erreicht werden.'); }
}
async function addTeam(){
  const name = document.getElementById('nt_name').value.trim();
  const country = document.getElementById('nt_country').value.trim();
  const color = document.getElementById('nt_color').value.trim() || '#c8102e';
  if(!name){ alert('Bitte einen Teamnamen angeben.'); return; }
  DB.teams.push({id: uid(), name, country, color});
  await persist.teams();
  renderManageBody();
}
async function deleteTeam(id){
  if(!confirm('Team wirklich löschen?')) return;
  DB.teams = DB.teams.filter(t=>t.id!==id);
  await persist.teams();
  renderManageBody();
}
function exportData(){
  const payload = { exportedAt: new Date().toISOString(), teams: DB.teams, drivers: DB.drivers, cases: DB.cases, transfers: DB.transfers, finance: DB.finance, financeSettings: DB.financeSettings, caseActivityLog: DB.caseActivityLog, deletedCaseLog: DB.deletedCaseLog };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `zfc-racing-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function importData(evt){
  const file = evt.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(!confirm('Import überschreibt alle aktuellen Daten. Fortfahren?')) return;
      DB.teams = data.teams || DB.teams;
      DB.drivers = data.drivers || [];
      DB.cases = data.cases || [];
      DB.transfers = data.transfers || [];
      DB.finance = data.finance || [];
      DB.financeSettings = data.financeSettings || DB.financeSettings;
      DB.caseActivityLog = data.caseActivityLog || [];
      DB.deletedCaseLog = data.deletedCaseLog || [];
      await persist.teams(); await persist.drivers(); await persist.cases(); await persist.transfers(); await persist.finance(); await persist.financeSettings(); await persist.caseActivityLog(); await persist.deletedCaseLog();
      alert('Import erfolgreich.');
      go('dashboard');
    }catch(e){ alert('Ungültige Backup-Datei.'); }
  };
  reader.readAsText(file);
}
async function resetAllData(){
  if(!confirm('WARNUNG: Dies löscht alle Akten, Fahrer, Teams und Transfers unwiderruflich. Fortfahren?')) return;
  if(!confirm('Bist du dir absolut sicher? Dieser Vorgang kann nicht rückgängig gemacht werden.')) return;
  DB.teams = defaultTeams(); DB.drivers = []; DB.cases = []; DB.transfers = []; DB.finance = []; DB.caseActivityLog = []; DB.deletedCaseLog = []; DB.financeSettings = {season:'2026',startingCapital:0,currency:'EUR',discordWebhookUrl:'',caseWebhookUrl:''};
  await persist.teams(); await persist.drivers(); await persist.cases(); await persist.transfers(); await persist.finance(); await persist.financeSettings(); await persist.caseActivityLog(); await persist.deletedCaseLog();
  go('dashboard');
}

/* ============================= PRINT: FIA REPORT & LICENSE ============================= */
function printDoc(html){
  document.getElementById('printArea').innerHTML = html;
  document.body.classList.add('printing');
  setTimeout(()=>{ window.print(); }, 950);
}
window.onafterprint = ()=> document.body.classList.remove('printing');

function signatureHtml(name, role){
  const cleanName = String(name||'').trim();
  if(!cleanName) return '';
  let seed = 0;
  for(let index=0; index<cleanName.length; index++) seed = (seed * 31 + cleanName.charCodeAt(index)) >>> 0;
  const initials = cleanName.split(/\s+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase();
  const angle = (seed % 9) - 4;
  const width = 136 + (seed % 28);
  const wave = 16 + (seed % 10);
  const flourish = 146 + (seed % 22);
  const path = `M8 36 C18 ${18-wave/3} 24 ${42+wave/4} 34 ${27-wave/4} S48 ${12+wave/3} 55 31 C${63+seed%7} 43 ${68+seed%11} 9 ${76+seed%9} 28 S${91+seed%8} ${43-wave/3} ${99+seed%7} 22 C${108+seed%6} 5 ${110+seed%10} 41 ${118+seed%8} 29 S${132+seed%7} 15 ${138+seed%6} 28 C${flourish-8} 40 ${flourish} 18 ${width} 23`;
  return `<div class="sigbox"><div class="signature-animation" aria-label="Unterschrift ${esc(cleanName)}"><svg class="signature-mark" viewBox="0 0 180 50" role="img" aria-hidden="true" style="transform:rotate(${angle}deg) scaleX(${(width/150).toFixed(2)});"><text x="8" y="29">${esc(initials)}</text><path d="${path}"/></svg></div><div class="sigline">${esc(cleanName)}<br>${esc(role)}</div></div>`;
}

function printCaseReport(id){
  const c = DB.cases.find(x=>x.id===id); if(!c) return;
  const ti = teamById(c.teamInvolved), di = driverById(c.driverInvolved);
  const ta = teamById(c.teamAffected), da = driverById(c.driverAffected);
  const html = `
  <div class="doc">
    <div class="doc-head">
      <div><div class="t1">ZFC <span>RACING</span></div><div class="t2">Official Document — Sportkommissare</div></div>
      <div><div class="stw">${esc(c.stw)}</div><div class="stwl">Aktennummer</div></div>
    </div>
    <p style="font-size:12px;color:#666;">${esc(c.event||'—')} · ${esc(c.sessionType||'—')} · Saison ${esc(c.season||'—')} · Status ${esc(c.status||'—')} · Erstellt am ${fmtDateTime(c.createdAt)} · Zuletzt geändert am ${fmtDateTime(c.updatedAt||c.createdAt)}</p>

    <h3>1. Beteiligte</h3>
    <table>
      <tr><td class="k">Betroffenes Team</td><td>${esc(ti?.name || '—')}</td></tr>
      <tr><td class="k">Betroffener Fahrer</td><td>${esc(driverName(di))} ${di?.number? '(#'+esc(di.number)+')':''}</td></tr>
      <tr><td class="k">Geschädigtes Team</td><td>${esc(ta?.name || '—')}</td></tr>
      <tr><td class="k">Geschädigter Fahrer</td><td>${esc(driverName(da)) || '—'}</td></tr>
      <tr><td class="k">Meldung durch</td><td>${esc(c.reportedBy||'—')}</td></tr>
      <tr><td class="k">Zeitpunkt des Vorfalls</td><td>${esc(c.incidentLap||'—')}</td></tr>
      <tr><td class="k">Kategorie</td><td>${esc(c.category||'—')}</td></tr>
    </table>

    <h3>2. Beschreibung des Vorfalls</h3>
    <p>${nl2br(c.description) || '—'}</p>

    <h3>3. Klarer Regelverstoß</h3>
    <p>${esc(c.regulationBreach) || '—'}</p>
    ${c.precedent? `<p style="color:#777;font-size:12px;">Vergleichbarer Fall: ${esc(c.precedent)}</p>`:''}

    <h3>4. Untersuchung</h3>
    <p>Anhörung der Beteiligten: <b>${c.hearingHeld? 'Ja':'Nein'}</b></p>
    <p>${nl2br(c.investigationNotes) || '—'}</p>
    ${c.evidenceLink? `<p style="font-size:12px;color:#777;">Beweismittel: ${esc(c.evidenceLink)}</p>`:''}

    <h3>5. Entscheidung der Sportkommissare</h3>
    <table>
      <tr><td class="k">Entscheidung</td><td><b>${esc(c.decision||'—')}</b></td></tr>
      <tr><td class="k">Strafpunkte</td><td>${esc(c.penaltyPoints||0)}</td></tr>
    </table>
    <p>${nl2br(c.decisionDetail) || '—'}</p>

    <h3>6. Status der Fahrlizenz</h3>
    <p><span class="stampline">${esc(c.licenseStatusAfter || 'Bleibt aktiv')}</span>${c.licenseStatusDetail? '  — '+esc(c.licenseStatusDetail):''}</p>
    <h3>7. Schriftliche Verwarnungen</h3>
    ${c.warningDocuments?.length? c.warningDocuments.map(warning=>`<table><tr><td class="k">Datum</td><td>${esc(warning.createdAt||'—')}</td></tr><tr><td class="k">Kategorie</td><td>${esc(warning.category)}</td></tr><tr><td class="k">Fahrer</td><td>${esc(warning.driverName||'—')}</td></tr></table><p>${nl2br(warning.text)||'—'}</p>`).join(''):'<p>Keine schriftliche Verwarnung abgelegt.</p>'}

    <div class="sig">
      ${signatureHtml(c.stewardChairman,'Vorsitzender Steward')}
      ${signatureHtml(c.steward2,'Steward')}
      ${signatureHtml(c.steward3,'Steward')}
    </div>

    <div class="foot">ZFC RACING STEWARD-SYSTEM // Automatisch generiert am ${fmtDateTime(Date.now())} // Aktenstatus: ${esc(c.status)}</div>
  </div>`;
  printDoc(html);
}

function printLicense(id){
  const d = driverById(id); if(!d) return;
  const t = teamById(d.teamId);
  const html = `
  <div class="doc license-certificate">
    <div class="doc-head">
      <div><div class="t1">ZFC <span>RACING</span></div><div class="t2">Fahrer-Lizenz · Official Racing Certificate</div></div>
      <div><div class="stw">${esc(d.licenseNo||'—')}</div><div class="stwl">Lizenznummer</div></div>
    </div>
    <div style="display:flex;gap:24px;align-items:flex-start;margin-top:6px;">
      <div style="width:110px;height:110px;border:2px solid #c9a227;flex:0 0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#f2f0eb;">
        ${d.photoUrl? `<img src="${esc(d.photoUrl)}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-family:'JetBrains Mono',monospace;font-size:26px;color:#999;">${esc((d.firstName[0]||'')+(d.lastName[0]||''))}</span>`}
      </div>
      <table style="flex:1;">
        <tr><td class="k">Name</td><td><b>${esc(driverName(d))}</b></td></tr>
        <tr><td class="k">Startnummer</td><td>${esc(d.number||'—')}</td></tr>
        <tr><td class="k">Nationalität</td><td>${esc(d.nationality||'—')}</td></tr>
        <tr><td class="k">Geburtsdatum</td><td>${fmtDate(d.dob)}</td></tr>
        <tr><td class="k">Team</td><td>${esc(t?.name||'—')}</td></tr>
        <tr><td class="k">Division</td><td><b>${esc(d.division||'—')}</b></td></tr>
        <tr><td class="k">Lizenzklasse</td><td><b>F1 26</b></td></tr>
      </table>
    </div>

    <h3>Gültigkeit</h3>
    <table>
      <tr><td class="k">Status</td><td><b>${esc(d.licenseStatus||'—')}</b></td></tr>
      <tr><td class="k">Erteilt am</td><td>${fmtDate(d.licenseIssued)}</td></tr>
      <tr><td class="k">Gültig bis</td><td>${fmtDate(d.licenseExpiry)}</td></tr>
      <tr><td class="k">Plattform</td><td>${esc(d.platform||'—')}</td></tr>
      <tr><td class="k">Fahrerklasse</td><td><b>F1 26</b></td></tr>
    </table>

    <h3>Erklärung</h3>
    <p>Der Inhaber dieser Lizenz bestätigt, das Sportliche Reglement der ZFC Racing gelesen, verstanden und vorbehaltlos akzeptiert zu haben, und verpflichtet sich zur Einhaltung sämtlicher sportlichen und disziplinarischen Bestimmungen der Liga.</p>
    <p><span class="stampline">${d.rulesAccepted? '✔ REGLEMENT AKZEPTIERT' : 'REGLEMENT NICHT BESTÄTIGT'}</span></p>

    <div class="sig">
      <div class="sigbox"><div class="sigline">${esc(driverName(d))}<br>Unterschrift Fahrer</div></div>
      <div class="sigbox"><div class="sigline">Race Director<br>ZFC Racing</div></div>
    </div>

    <div class="foot">ZFC RACING STEWARD-SYSTEM // Lizenzdokument automatisch generiert am ${fmtDateTime(Date.now())}</div>
  </div>`;
  printDoc(html);
}

/* ============================= INIT ============================= */
function init(){
  readSupabaseConfigFromUrl();
  loadAll();
  const h = location.hash.replace('#','');
  const [page,id] = h.split('/');
  ROUTE = {page: page||'dashboard', id: id||null};
  initSupabase();
}
init();
