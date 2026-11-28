'use strict';
const fs=require('node:fs');
const path=require('node:path');
const fixtureRoot=path.resolve(__dirname,'../..');
const MiB=1024*1024;
const plaintextLimit=100*MiB;
const encryptedFileLimit=136*MiB;

function candidateSource(name,{plaintextMiB=100,encryptedMiB=136}={}){
  const substitutions={
    'insight_backup_crypto_v1.js':[['MAX_PLAINTEXT_BYTES=15*1024*1024',`MAX_PLAINTEXT_BYTES=${plaintextMiB}*1024*1024`]],
    'insight_backup_guard_v1.js':[['ENCRYPTED_FILE_LIMIT=21*1024*1024',`ENCRYPTED_FILE_LIMIT=${encryptedMiB}*1024*1024`],['21MiB',`${encryptedMiB}MiB`]]
  };
  if(!Object.hasOwn(substitutions,name))throw new Error('Unknown experimental source');
  let source=fs.readFileSync(path.join(fixtureRoot,name),'utf8');
  for(const [before,after] of substitutions[name]){
    if(!source.includes(before))throw new Error('Baseline has changed: '+before);
    source=source.replaceAll(before,after);
  }
  return source;
}
module.exports={candidateSource,MiB,plaintextLimit,encryptedFileLimit};
