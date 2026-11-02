import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
let token;
for(const path of [join(homedir(),'.config/configstore/firebase-tools.json'),join(process.env.APPDATA||'','configstore/firebase-tools.json')]){try{token=JSON.parse(await readFile(path,'utf8')).tokens.access_token;if(token)break}catch{}}
if(!token)throw Error('Firebase login unavailable');
const endpoint='https://firestore.googleapis.com/v1/projects/dkblog-6c5e5/databases/(default)/documents/quizzes/archive-202511280040';
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const before=await fetch(endpoint,{headers});if(!before.ok)throw Error(await before.text());
const original=await before.json();
const fields={title:{stringValue:'ರಾಜ್ಯೋತ್ಸವ ಕ್ವಿಜ಼್ ೪.೦ - ಕನ್ನಡ ನುಡಿಯ ವಿದೇಶ ಯಾತ್ರೆ'},date:{stringValue:'ನವೆಂಬರ್ 21–28, 2025'},type:{stringValue:'prize'},quizTypeUnconfirmed:{booleanValue:false},description:{stringValue:'ರಾಜ್ಯೋತ್ಸವ ಕ್ವಿಜ಼್ ೪.೦ — ಕನ್ನಡ ನುಡಿಯ ವಿದೇಶ ಯಾತ್ರೆ. ನವೆಂಬರ್ 21ರಿಂದ 28, 2025ರವರೆಗೆ ನಡೆದ ಬಹುಮಾನದ ಕ್ವಿಜ಼್. ಭಾಗವಹಿಸುವಿಕೆ ಮತ್ತು ಉತ್ತರಗಳ ಅಂಕಿಅಂಶಗಳು ಲಭ್ಯವಿಲ್ಲ.'}};
const params=new URLSearchParams();for(const key of Object.keys(fields))params.append('updateMask.fieldPaths',key);
params.set('currentDocument.updateTime',original.updateTime);
const response=await fetch(`${endpoint}?${params}`,{method:'PATCH',headers,body:JSON.stringify({fields})});
if(!response.ok)throw Error(await response.text());
const saved=await response.json();
if(saved.fields.questions.arrayValue.values.length!==25||saved.fields.statisticsAvailable.booleanValue!==false)throw Error('Verification failed');
console.log('Updated title, November 21–28 date range, and prize type. All 25 questions preserved; participant statistics remain unknown.');
