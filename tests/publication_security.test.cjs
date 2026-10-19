/* Review every tracked file before merging/deploying the public GitHub Pages site.
 * Never print matched secret contents into CI logs. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');

function trackedPaths(){
  const buffer=execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:16*1024*1024});
  return buffer.toString('utf8').split('\0').filter(Boolean);
}
function privatePath(file){
  const pieces=file.split('/');
  const last=pieces[pieces.length-1];
  if(pieces.some(segment=>/^(?:\.env(?:\..*)?|\.aws|\.ssh|\.secrets?)$/i.test(segment)))return true;
  if(/^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|id_rsa|id_ed25519|credentials\.json|service-account(?:-.+)?\.json)$/i.test(last))return true;
  if(/\.(?:pem|key|p12|pfx|sqlite3?|db|bak|dump|log|zip|tar|tgz|7z)$/i.test(last))return true;
  if(/^Insight_(?:backup|pre_restore)_.+\.json$/i.test(last))return true;
  return false;
}
const detectors=[
  {name:'private key',pattern:/-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/},
  {name:'GitHub credential',pattern:/\b(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{24,})\b/},
  {name:'OpenAI credential',pattern:/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/},
  {name:'AWS access key',pattern:/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/},
  {name:'Google API key',pattern:/\bAIza[0-9A-Za-z_-]{35}\b/}
];
function credentialTypes(text){
  return detectors.filter(item=>item.pattern.test(text)).map(item=>item.name);
}

test('secret and backup files must be excluded by .gitignore',()=>{
  const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
  for(const pattern of ['.env','.env.*','*.pem','*.key','*.p12','*.pfx','.npmrc','Insight_backup_*.json','Insight_pre_restore_*.json']){
    assert.ok(ignore.split(/\r?\n/).includes(pattern),'missing ignore rule: '+pattern);
  }
});

test('public repository inventory excludes private local files and embedded credentials',()=>{
  const tracked=trackedPaths();
  assert.ok(tracked.includes('Index.html'),'expected published entrypoint');
  const forbidden=tracked.filter(privatePath);
  assert.deepEqual(forbidden,[],'tracked private files must never reach GitHub Pages');
  const problems=[];
  let scanned=0;
  for(const file of tracked){
    if(!/\.(?:html|js|cjs|css|json|yml|yaml|md|txt)$/.test(file))continue;
    const absolute=path.join(root,file);
    const data=fs.readFileSync(absolute);
    // Binary or unusually large files should not be silently accepted.
    if(data.includes(0)||data.length>10*1024*1024){
      problems.push(file+': binary/unusually large tracked asset');continue;
    }
    for(const name of credentialTypes(data.toString('utf8')))problems.push(file+': '+name);
    scanned++;
  }
  // GitHub Pages is served from repository root. Inventory all root-facing assets.
  const publicAssets=tracked.filter(file=>!file.includes('/')&&/\.(?:html|js|css)$/.test(file));
  console.log('[public assets] '+publicAssets.length+' root HTML/JS/CSS assets; '+scanned+' tracked text files reviewed');
  console.log('[public assets] '+publicAssets.join(', '));
  assert.deepEqual(problems,[],'Never publish detected credentials or unreviewed binary assets');
});

test('security gate rejects representative forbidden paths and synthetic secrets',()=>{
  for(const file of ['.env','.env.production','server/.env','id_rsa','private.pem','Insight_backup_20261019.json','config/.npmrc','db.sqlite']){
    assert.equal(privatePath(file),true,file);
  }
  assert.equal(privatePath('insight_storage_v1.js'),false);
  assert.equal(privatePath('docs/ai-memory/INSIGHT_MEMORY.md'),false);
  assert.deepEqual(credentialTypes('ghp_'+'x'.repeat(40)),['GitHub credential']);
  assert.deepEqual(credentialTypes('-----BEGIN '+'PRIVATE KEY-----'),['private key']);
  assert.deepEqual(credentialTypes('ordinary public static JavaScript'),[]);
});
