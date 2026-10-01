// Disposable anonymous test session; no production quiz/post/library data is changed.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const project='dkblog-6c5e5',apiKey='AIzaSyCHuyfBo7zAKlYc6Gq9uOPQavv_bwxh4x4';
const base=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const identity=async(action,data)=>fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const credentials=JSON.parse(await readFile(join(homedir(),'.config','configstore','firebase-tools.json'),'utf8'));
const owner=credentials.tokens.access_token;
const sessionResponse=await identity('signUp',{returnSecureToken:true});
assert.equal(sessionResponse.status,200,'Test session creation failed.');
const session=await sessionResponse.json();
const headers={Authorization:`Bearer ${session.idToken}`,'Content-Type':'application/json'};
const fields={quizId:{stringValue:'security-probe'},userId:{stringValue:session.localId},participantName:{stringValue:'Security test'},answers:{arrayValue:{values:[{integerValue:'0'}]}},score:{integerValue:'999'}};
let receiptPath;
try{
  for(const collection of ['quizSubmissions','prizeQuizEntries']){
    const response=await fetch(`${base}/${collection}/security-probe_${session.localId}`,{method:'PATCH',headers,body:JSON.stringify({fields})});
    assert.equal(response.status,403,`${collection} unexpectedly accepted a browser write.`);
  }
  for(const path of ['quizKeys/security-probe','quizSubmissions/security-probe_foreign','prizeQuizEntries/security-probe_foreign','quizReceipts/security-probe_foreign']){
    const response=await fetch(`${base}/${path}`,{headers});
    assert.equal(response.status,403,`${path} unexpectedly readable.`);
  }
  const own=await fetch(`${base}/quizSubmissions/security-probe_${session.localId}`,{headers});
  assert.equal(own.status,404,'Own missing-result lookup was not authorized.');
  const activeResponse=await fetch(`${base}/siteSettings/activeQuiz`);
  assert.equal(activeResponse.status,200);
  const active=await activeResponse.json();
  const questions=active.fields?.quiz?.mapValue?.fields?.questions?.arrayValue?.values||[];
  for(const question of questions){assert.equal('ans' in question.mapValue.fields,false);assert.equal('exp' in question.mapValue.fields,false);}
  console.log('Live Firebase checks passed: forged writes denied, private keys/contact/other results denied, own lookups allowed, active answer keys absent.');
  const serviceResponse=await fetch(`${base}/siteSettings/quizService`);
  const service=await serviceResponse.json();
  const url=service.fields?.url?.stringValue;
  if(!url){console.log('Grading endpoint not yet activated; endpoint test pending.');}
  else{
    const forged=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({quizId:'security-probe',requestId:randomUUID(),idToken:'forged',participantName:'Security test',answers:[0]})});
    assert.equal((await forged.json()).status,'rejected','Forged token unexpectedly accepted.');
    const requestId=randomUUID();
    receiptPath=`quizReceipts/${requestId}_${session.localId}`;
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({quizId:'security-probe',requestId,idToken:session.idToken,participantName:'Security test',answers:[0],score:999})});
    assert.equal((await response.json()).status,'rejected');
    const receipt=await fetch(`${base}/${receiptPath}`,{headers});
    assert.equal(receipt.status,200,'Authenticated server receipt missing.');
    const body=await receipt.json();
    assert.equal(body.fields.code.stringValue,'QUIZ_CLOSED','Non-live quiz was not rejected by the trusted service.');
    console.log('Live grading endpoint checks passed: forged token denied; valid Firebase session verified; nonexistent/closed quiz rejected; private server receipt readable only by its owner.');
  }
}finally{
  // Delete only this test's exact generated receipt, not participant results.
  if(receiptPath)await fetch(`${base}/${receiptPath}`,{method:'DELETE',headers:{Authorization:`Bearer ${owner}`}});
  const deleted=await identity('delete',{idToken:session.idToken});
  assert.equal(deleted.status,200,'Could not remove the disposable auth test session.');
}
