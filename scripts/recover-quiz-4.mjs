import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
const source=await readFile(process.argv[2],'utf8');
const questions=[...source.matchAll(/question:\s*("(?:[^"\\]|\\.)*"),\s*options:\s*(\[[\s\S]*?\]),\s*correct:\s*(\d+)/g)].map(m=>({q:JSON.parse(m[1]),opts:JSON.parse(m[2]),ans:Number(m[3])}));
if(questions.length!==25||questions.some(q=>q.opts.length!==4||q.ans<0||q.ans>=4))throw Error('Question validation failed');
let token;
for(const path of [join(homedir(),'.config/configstore/firebase-tools.json'),join(process.env.APPDATA||'','configstore/firebase-tools.json')]){try{token=JSON.parse(await readFile(path,'utf8')).tokens.access_token;if(token)break}catch{}}
if(!token)throw Error('Firebase login unavailable');
const base='https://firestore.googleapis.com/v1/projects/dkblog-6c5e5/databases/(default)/documents';
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const existing=await fetch(`${base}/quizzes?pageSize=1000`,{headers});if(!existing.ok)throw Error(await existing.text());
const docs=(await existing.json()).documents||[];
console.log('Existing archives:',docs.filter(d=>d.fields.state?.stringValue==='archived').map(d=>d.fields.title?.stringValue).join(' | '));
const quiz={id:202511280040,title:'ಕ್ವಿಜ಼್ 4.0',description:'ಮರುಪಡೆಯಲಾದ ಹಳೆಯ ಕ್ವಿಜ಼್. ಭಾಗವಹಿಸುವಿಕೆ ಮತ್ತು ಉತ್ತರಗಳ ಅಂಕಿಅಂಶಗಳು ಲಭ್ಯವಿಲ್ಲ.',state:'archived',type:'certificate',date:'ನವೆಂಬರ್ 28, 2025',total:0,questions,source:'recovered-original',statisticsAvailable:false,quizTypeUnconfirmed:true};
function value(v){if(typeof v==='string')return{stringValue:v};if(typeof v==='number')return{integerValue:String(v)};if(typeof v==='boolean')return{booleanValue:v};if(Array.isArray(v))return{arrayValue:{values:v.map(value)}};return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,value(x)]))}}}
const target=`${base}/quizzes/archive-${quiz.id}`;
const check=await fetch(target,{headers});if(check.status!==404)throw Error('Archive already exists or lookup failed; no overwrite');
const result=await fetch(`${base}:commit`,{method:'POST',headers,body:JSON.stringify({writes:[{update:{name:`projects/dkblog-6c5e5/databases/(default)/documents/quizzes/archive-${quiz.id}`,fields:value(quiz).mapValue.fields},currentDocument:{exists:false}}]})});
if(!result.ok)throw Error(await result.text());
console.log('Recovered 25 questions with 4 options and valid answer keys. Archive created.');
