// Owner-only configuration of the approved, versioned Apps Script grading endpoint.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const url=process.argv[2];
assert.match(url||'',/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/,'A versioned Apps Script /exec URL is required.');
const healthResponse=await fetch(url);
assert.equal(healthResponse.status,200,'Grading service is not publicly reachable.');
const health=await healthResponse.json();
assert.equal(health.service,'DK secure quiz grading');
assert.equal(health.version,2);
const credentials=JSON.parse(await readFile(join(homedir(),'.config','configstore','firebase-tools.json'),'utf8'));
const headers={Authorization:`Bearer ${credentials.tokens.access_token}`,'Content-Type':'application/json'};
const base='https://firestore.googleapis.com/v1/projects/dkblog-6c5e5/databases/(default)/documents';
const existing=await fetch(`${base}/siteSettings/quizService`,{headers});
assert.ok(existing.status===200||existing.status===404,'Cannot inspect the current grading configuration.');
const old=existing.status===200?await existing.json():null;
if(old?.fields?.url?.stringValue===url){
  console.log('Verified grading endpoint is already connected.');
}else{
  const name='projects/dkblog-6c5e5/databases/(default)/documents/siteSettings/quizService';
  const write={update:{name,fields:{url:{stringValue:url},securityVersion:{integerValue:'2'}}},currentDocument:old?{updateTime:old.updateTime}:{exists:false},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]};
  const saved=await fetch(`${base}:commit`,{method:'POST',headers,body:JSON.stringify({writes:[write]})});
  assert.equal(saved.status,200,'Owner configuration write failed. No grading URL was replaced.');
  console.log('Verified secure grading service connected to Firebase.');
}
