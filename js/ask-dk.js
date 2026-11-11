(() => {
  const form = document.getElementById('ask-dk-form');
  const questionInput = document.getElementById('ask-dk-question');
  const languageInput = document.getElementById('ask-dk-language');
  const result = document.getElementById('ask-dk-result');
  const submit = form.querySelector('button[type=submit]');
  const ignored = new Set('a an and are about can did dk do does find for from give has how i in is it me of on or please say tell the this to was what when where which who why with write you ಡೀಕೆ ಡೀಕೆಯ ಏನು ಯಾರು ಹೇಗೆ ಬಗ್ಗೆ ಕುರಿತು ತಿಳಿಸಿ ಕೊಡಿ ಹೇಳಿ ಮತ್ತು ಒಂದು ಯಾವ ಎಲ್ಲಿ'.split(' '));
  const kannada = /[\u0c80-\u0cff]/;

  function words(text) {
    return [...new Set((String(text).normalize('NFC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || []).filter(word => word.length > 1 && !ignored.has(word)))];
  }

  function passages(post) {
    let body = post.body || '';
    if (post.html) {
      const template = document.createElement('template');
      template.innerHTML = post.html;
      template.content.querySelectorAll('script,style').forEach(node => node.remove());
      template.content.querySelectorAll('p,div,br,li,h2,h3,blockquote').forEach(node => node.append('\n'));
      body = template.content.textContent;
    }
    return [...new Set([post.exc, ...String(body).split(/\n+|(?<=[.!?।])\s+/)].map(text => String(text || '').trim()).filter(Boolean))];
  }

  function retrieve(posts, terms) {
    if (!terms.length) return [];
    const hits = (text) => {
      const tokens = words(text);
      return terms.filter(term => tokens.some(token => token === term || (kannada.test(term) && term.length >= 4 && token.startsWith(term)))).length;
    };
    const matches = [];
    for (const post of posts) {
      const titleHits = hits(post.title || '');
      let best = null;
      for (const passage of passages(post)) {
        const excerpt = passage.slice(0, 500);
        const passageHits = hits(excerpt);
        if (!passageHits && !titleHits) continue;
        const score = passageHits * 3 + titleHits * 4 + hits((post.labels || []).join(' '));
        if (!best || score > best.score) best = {post, excerpt, score, matched: Math.max(titleHits, passageHits)};
      }
      if (best && best.matched >= Math.min(2, terms.length)) matches.push(best);
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  async function translator(sourceLanguage, targetLanguage) {
    if (!globalThis.Translator) return null;
    try {
      const options = {sourceLanguage, targetLanguage};
      if (await Translator.availability(options) === 'unavailable') return null;
      return await Translator.create(options);
    } catch { return null; }
  }

  function paragraph(text) {
    const node = document.createElement('p');
    node.textContent = text;
    return node;
  }

  async function answerEndpoint() {
    const url = 'https://firestore.googleapis.com/v1/projects/dkblog-6c5e5/databases/(default)/documents/siteSettings/askDk';
    const response = await fetch(url, {signal: AbortSignal.timeout(5000)});
    if (!response.ok) return '';
    const data = await response.json();
    const endpoint = data.fields?.url?.stringValue || '';
    return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint) ? endpoint : '';
  }

  function requestAnswer(endpoint, question, language, mode = 'answer') {
    return new Promise(resolve => {
      const nonce = crypto.randomUUID().replace(/-/g, '');
      const frame = document.createElement('iframe');
      frame.name = 'askdk-' + nonce;
      frame.hidden = true;
      frame.title = 'DKBlog answer response';
      const request = document.createElement('form');
      request.method = 'POST';
      request.action = endpoint;
      request.target = frame.name;
      request.hidden = true;
      for (const [name, value] of Object.entries({nonce, question, language, mode})) {
        const field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        field.value = value;
        request.appendChild(field);
      }
      function finish(response) {
        clearTimeout(timeout);
        window.removeEventListener('message', receive);
        frame.remove();
        request.remove();
        resolve(response);
      }
      function receive(event) {
        if (!/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+\.)?googleusercontent\.com)$/.test(event.origin)) return;
        if (event.data?.dkAnswer === 1 && event.data.nonce === nonce) finish(event.data.result);
      }
      const timeout = setTimeout(() => finish({status: 'unavailable'}), 35000);
      window.addEventListener('message', receive);
      document.body.append(frame, request);
      request.submit();
    });
  }

  window.refreshAskDkUsage = async () => {
    const count = document.getElementById('ask-dk-usage');
    const button = document.getElementById('ask-dk-usage-refresh');
    if (button.disabled) return;
    button.disabled = true;
    count.textContent = 'Checking AI usage…';
    try {
      const endpoint = await answerEndpoint();
      if (!endpoint) throw Error('Assistant unavailable');
      const data = await requestAnswer(endpoint, '', '', 'usage');
      if (data?.status !== 'ok' || !Number.isInteger(data.remaining) || !Number.isInteger(data.limit)) throw Error('Usage unavailable');
      count.textContent = `${data.remaining} of ${data.limit} AI requests remaining today`;
    } catch {
      count.textContent = 'AI usage unavailable';
    } finally {
      button.disabled = false;
    }
  };

  function showAnswer(data, english) {
    const status = {
      no_answer: english ? 'I couldn’t find enough evidence in DKBlog to answer this.' : 'ಉತ್ತರಿಸಲು ಡೀಕೆಯ ಬರಹಗಳಲ್ಲಿ ಸಾಕಷ್ಟು ಮಾಹಿತಿ ಸಿಗಲಿಲ್ಲ.',
      limit: english ? 'Today’s AI answer limit has been reached.' : 'ಇಂದಿನ ಎಐ ಉತ್ತರಗಳ ಮಿತಿ ತಲುಪಿದೆ.',
      unavailable: english ? 'AI answers are temporarily unavailable.' : 'ಸದ್ಯ ಎಐ ಉತ್ತರಗಳು ಲಭ್ಯವಿಲ್ಲ.'
    };
    if (data?.status !== 'ok' || typeof data.answer !== 'string' || !Array.isArray(data.citations)) {
      result.textContent = status[data?.status] || status.unavailable;
      return;
    }
    const content = [paragraph(data.answer)];
    for (const citation of data.citations) {
      if (!/^\d{1,20}$/.test(citation.id)) continue;
      const article = document.createElement('article');
      const source = document.createElement('a');
      source.href = routePath('post', citation.id);
      source.textContent = citation.title;
      article.append(source, paragraph(citation.quote));
      content.push(article);
    }
    result.replaceChildren(...content);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const question = questionInput.value.trim();
    if (!question) return;
    const english = languageInput.value === 'en';
    submit.disabled = true;
    result.textContent = english ? 'Searching published articles…' : 'ಪ್ರಕಟಿತ ಬರಹಗಳಲ್ಲಿ ಹುಡುಕಲಾಗುತ್ತಿದೆ…';
    const translators = [];
    try {
      const endpoint = await answerEndpoint().catch(() => '');
      if (endpoint) {
        showAnswer(await requestAnswer(endpoint, question, languageInput.value), english);
        return;
      }
      const inputLanguage = kannada.test(question) ? 'kn' : 'en';
      const outputLanguage = english ? 'en' : 'kn';
      const searchTranslation = translator(inputLanguage, inputLanguage === 'kn' ? 'en' : 'kn');
      await window.firebaseReady;
      const posts = await ensureAllPosts();
      const inputTranslator = await searchTranslation;
      if (inputTranslator) translators.push(inputTranslator);
      let matches = retrieve(posts, words(question));
      if (inputTranslator) {
        try {
          const translated = await inputTranslator.translate(question);
          const combined = [...matches, ...retrieve(posts, words(translated))].sort((a, b) => b.score - a.score);
          matches = [...new Map(combined.reverse().map(match => [String(match.post.id), match])).values()].sort((a, b) => b.score - a.score).slice(0, 3);
        } catch { /* Continue with original-language matches. */ }
      }
      if (!matches.length) {
        result.textContent = english ? 'I couldn’t find a relevant passage in DKBlog. Try an article title or a more specific keyword.' : 'ಡೀಕೆಯ ಪ್ರಕಟಿತ ಬರಹಗಳಲ್ಲಿ ಸಂಬಂಧಿಸಿದ ಭಾಗ ಸಿಗಲಿಲ್ಲ. ಬರಹದ ಶೀರ್ಷಿಕೆ ಅಥವಾ ನಿರ್ದಿಷ್ಟ ಪದ ಬಳಸಿ ನೋಡಿ.';
        return;
      }
      const content = [paragraph(english ? 'Relevant passages from DKBlog' : 'ಡೀಕೆಯ ಬರಹಗಳಿಂದ ಸಂಬಂಧಿಸಿದ ಭಾಗಗಳು')];
      let fallback = false;
      const sourceLanguage = outputLanguage === 'kn' ? 'en' : 'kn';
      const needsTranslation = matches.some(match => (kannada.test(match.excerpt) ? 'kn' : 'en') !== outputLanguage);
      const outputTranslator = needsTranslation ? (inputLanguage === sourceLanguage ? inputTranslator : await translator(sourceLanguage, outputLanguage)) : null;
      if (outputTranslator && !translators.includes(outputTranslator)) translators.push(outputTranslator);
      for (const {post, excerpt} of matches) {
        const article = document.createElement('article');
        let text = excerpt;
        if ((kannada.test(excerpt) ? 'kn' : 'en') !== outputLanguage) {
          if (outputTranslator) {
            try { text = await outputTranslator.translate(excerpt); } catch { fallback = true; }
          } else fallback = true;
        }
        const source = document.createElement('a');
        source.href = routePath('post', post.id);
        source.textContent = post.title;
        article.append(paragraph(text), source);
        content.push(article);
      }
      if (fallback) content.push(paragraph(english ? 'Some passages are shown in their original language because translation is unavailable in this browser.' : 'ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಅನುವಾದ ಲಭ್ಯವಿಲ್ಲದ ಕಾರಣ ಕೆಲವು ಭಾಗಗಳನ್ನು ಮೂಲ ಭಾಷೆಯಲ್ಲಿ ತೋರಿಸಲಾಗಿದೆ.'));
      result.replaceChildren(...content);
    } catch (error) {
      console.error('DKBlog search failed', error);
      result.textContent = english ? 'The articles couldn’t be loaded. Please try again.' : 'ಬರಹಗಳನ್ನು ತರಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
    } finally {
      for (const instance of translators) instance.destroy?.();
      submit.disabled = false;
    }
  });
})();
