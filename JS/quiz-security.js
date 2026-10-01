/* Shared publishing contract. Active quizzes never contain answers or explanations. */
(function(root){
  function validateQuiz(quiz){
    if(!quiz||!/^[A-Za-z0-9-]{1,64}$/.test(String(quiz.id)))throw new Error('Invalid quiz ID.');
    if(!['upcoming','live','closed'].includes(quiz.state))throw new Error('Invalid quiz state.');
    if(!['certificate','prize'].includes(quiz.type))throw new Error('Invalid quiz type.');
    if(!Array.isArray(quiz.questions)||quiz.questions.length<1||quiz.questions.length>100)throw new Error('A quiz needs 1–100 questions.');
    quiz.questions.forEach((q,i)=>{
      if(typeof q.q!=='string'||!q.q.trim()||!Array.isArray(q.opts)||q.opts.length<2||q.opts.length>20||q.opts.some(o=>typeof o!=='string'||!o.trim())||!Number.isInteger(q.ans)||q.ans<0||q.ans>=q.opts.length)throw new Error('Check the options and correct answer for question '+(i+1)+'.');
    });
  }
  function publicQuiz(quiz,version){
    validateQuiz(quiz);
    return {id:quiz.id,title:String(quiz.title||''),description:String(quiz.description||''),type:quiz.type,state:quiz.state,date:String(quiz.date||''),deadline:String(quiz.deadline||''),prize:String(quiz.prize||''),questions:quiz.questions.map(q=>({q:q.q,opts:[...q.opts]})),certificateTemplate:quiz.certificateTemplate||null,securityVersion:2,version};
  }
  const api={validateQuiz,publicQuiz};
  if(typeof module!=='undefined')module.exports=api;
  else root.DKQuizSecurity=api;
})(typeof window==='undefined'?globalThis:window);
