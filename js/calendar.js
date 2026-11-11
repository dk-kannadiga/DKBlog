(() => {
  const months = ['ಜನವರಿ', 'ಫೆಬ್ರವರಿ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿಲ್', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗಸ್ಟ್', 'ಸೆಪ್ಟೆಂಬರ್', 'ಅಕ್ಟೋಬರ್', 'ನವೆಂಬರ್', 'ಡಿಸೆಂಬರ್'];
  const weekdays = ['ಭಾನುವಾರ', 'ಸೋಮವಾರ', 'ಮಂಗಳವಾರ', 'ಬುಧವಾರ', 'ಗುರುವಾರ', 'ಶುಕ್ರವಾರ', 'ಶನಿವಾರ'];
  const shortDays = ['ಭಾ', 'ಸೋ', 'ಮಂ', 'ಬು', 'ಗು', 'ಶು', 'ಶ'];
  const input = document.getElementById('calendar-year');
  const previous = document.getElementById('calendar-previous');
  const next = document.getElementById('calendar-next');
  const error = document.getElementById('calendar-error');
  const today = new Date();
  let year = today.getFullYear();

  function dateAt(y, month, day) {
    const date = new Date(0);
    date.setUTCFullYear(y, month, day);
    return date;
  }

  function monthTable(month) {
    const firstDay = dateAt(year, month, 1).getUTCDay();
    const lastDate = dateAt(year, month + 1, 0).getUTCDate();
    const cells = [];
    for (let week = 0; week < 6; week++) {
      const row = [];
      for (let weekday = 0; weekday < 7; weekday++) {
        const day = week * 7 + weekday - firstDay + 1;
        const valid = day > 0 && day <= lastDate;
        const current = valid && year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
        row.push(`<td${current ? ' aria-current="date"' : ''}>${valid ? day : ''}</td>`);
      }
      cells.push(`<tr>${row.join('')}</tr>`);
    }
    const headings = shortDays.map((label, index) => `<th scope="col" aria-label="${weekdays[index]}" title="${weekdays[index]}">${label}</th>`).join('');
    return `<section class="calendar-month"><table><caption>${months[month]}</caption><thead><tr>${headings}</tr></thead><tbody>${cells.join('')}</tbody></table></section>`;
  }

  function showYear(value) {
    year = value;
    input.value = String(year).padStart(4, '0');
    error.textContent = '';
    previous.disabled = year === 0;
    next.disabled = year === 9999;
    document.getElementById('calendar-year-label').textContent = `${input.value}ರ ಕ್ಯಾಲೆಂಡರ್`;
    document.getElementById('calendar-months').innerHTML = months.map((_, month) => monthTable(month)).join('');
  }

  document.getElementById('calendar-year-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = input.value.trim().replace(/[೦-೯]/g, digit => String(digit.charCodeAt(0) - '೦'.charCodeAt(0)));
    if (!/^\d{1,4}$/.test(value)) {
      error.textContent = 'ದಯವಿಟ್ಟು ೦೦೦೦ರಿಂದ ೯೯೯೯ರ ನಡುವಿನ ವರ್ಷವನ್ನು ನಮೂದಿಸಿ.';
      return;
    }
    showYear(Number(value));
  });
  previous.addEventListener('click', () => { if (year > 0) showYear(year - 1); });
  next.addEventListener('click', () => { if (year < 9999) showYear(year + 1); });
  showYear(year);
})();
