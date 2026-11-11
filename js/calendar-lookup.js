(() => {
  const {yearRows, blocks} = window.DKCalendarData;
  const grid = document.getElementById('calendar-grid');
  const result = document.getElementById('calendar-result');
  const input = document.getElementById('calendar-date');
  const digits = '೦೧೨೩೪೫೬೭೮೯';
  const abbreviations = ['ಭಾ', 'ಸೋ', 'ಮಂ', 'ಬು', 'ಗು', 'ಶು', 'ಶ'];
  const weekdays = ['ಭಾನುವಾರ', 'ಸೋಮವಾರ', 'ಮಂಗಳವಾರ', 'ಬುಧವಾರ', 'ಗುರುವಾರ', 'ಶುಕ್ರವಾರ', 'ಶನಿವಾರ'];
  const state = {century: null, year: null, month: null, day: null};
  const toAscii = text => text.replace(/[೦-೯]/g, digit => String(digits.indexOf(digit)));
  const two = number => String(number).padStart(2, '0');
  const toKannada = number => two(number).replace(/\d/g, digit => digits[Number(digit)]);

  const suffixCells = [];
  const dateCells = [];
  const years = yearRows.map((line, row) => {
    const group = Math.floor(row / 4);
    const centuries = row % 4 ? '' : Array.from({length: 25}, (_, column) => {
      const value = column * 4 + group;
      return `<td rowspan="4"><button type="button" data-century="${value}" aria-label="ವರ್ಷದ ಮೊದಲ ಅಂಕಿಗಳು ${toKannada(value)}">${toKannada(value)}</button></td>`;
    }).join('');
    const suffixes = line.split(' ').map((label, column) => {
      if (label === '*') return `<td data-band="${group}">*</td>`;
      const value = Number(toAscii(label));
      suffixCells.push({group, column, value});
      return `<td data-band="${group}"><button type="button" data-year="${value}" data-group="${group}" aria-label="ವರ್ಷದ ಕೊನೆಯ ಅಂಕಿಗಳು ${label}">${label}</button></td>`;
    }).join('');
    return `<tr${row % 4 === 0 ? ' class="block-top"' : ''}>${centuries}${suffixes}</tr>`;
  }).join('');

  let rowNumber = 0;
  const body = blocks.map((block, blockIndex) => {
    const notes = blockIndex === 0 ? '<td class="calendar-notes" colspan="5" rowspan="31">ವರ್ಷದ ಮೊದಲ ಎರಡು ಅಂಕಿಗಳನ್ನು ಎಡದಲ್ಲಿ ಆರಿಸಿ. ಬಲದಲ್ಲಿ ಕೊನೆಯ ಎರಡು ಅಂಕಿಗಳನ್ನು ಆರಿಸಿ. ತಿಂಗಳು ಮತ್ತು ದಿನದ ಸಾಲು ವರ್ಷಕ್ಕೆ ಸೇರಿದ ಅಂಕಣವನ್ನು ಸೇರುವಲ್ಲಿ ವಾರ ಕಾಣಿಸುತ್ತದೆ.</td>' : '';
    const headings = block.months.map(label => `<th colspan="5">${label}</th>`).join('');
    const rows = block.dates.map((line, offset) => {
      const row = rowNumber++;
      const left = line.split(' ').map((label, column) => {
        if (label === '*' || label === '-') return `<td data-row="${row}">${label === '*' ? '*' : ''}</td>`;
        const month = blockIndex * 4 + Math.floor(column / 5);
        const day = Number(toAscii(label));
        dateCells.push({month, day, row, column, weekdayRow: block.weekdays[offset]});
        return `<td data-row="${row}"><button type="button" data-date="${dateCells.length - 1}" aria-label="${block.months[column / 5 | 0]} ${label}">${label}</button></td>`;
      }).join('');
      const right = [...block.weekdays[offset]].map((weekday, column) => `<td data-row="${row}" data-column="${column}" title="${weekdays[weekday]}">${abbreviations[weekday]}</td>`).join('');
      return `<tr>${left}${right}</tr>`;
    }).join('');
    return `<tr>${notes}${headings}<th colspan="28">ವಾರ</th></tr>${rows}`;
  }).join('');

  grid.innerHTML = `<colgroup><col span="25"><col span="28" class="weekday-column"></colgroup><thead><tr><th colspan="25">ವರ್ಷದ ಮೊದಲ ಎರಡು ಅಂಕಿಗಳು</th><th colspan="28">ವರ್ಷದ ಕೊನೆಯ ಎರಡು ಅಂಕಿಗಳು</th></tr></thead><tbody>${years}${body}</tbody>`;

  function findDate(year, month, day) {
    const date = new Date(0);
    date.setUTCFullYear(year, month, day);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
    return date.getUTCDay();
  }

  function showSelection(reveal = false) {
    const group = state.century === null ? null : state.century % 4;
    const suffix = suffixCells.find(cell => cell.group === group && cell.value === state.year);
    const year = suffix ? state.century * 100 + suffix.value : null;
    const validDates = new Set();
    let chosen = null;
    if (suffix) dateCells.forEach((cell, index) => {
      const weekday = findDate(year, cell.month, cell.day);
      if (weekday === null || Number(cell.weekdayRow[suffix.column]) !== weekday) return;
      validDates.add(index);
      if (cell.month === state.month && cell.day === state.day) chosen = {...cell, index, weekday};
    });
    grid.querySelectorAll('[data-century]').forEach(button => {
      const selected = Number(button.dataset.century) === state.century;
      button.setAttribute('aria-pressed', String(selected));
      button.parentElement.classList.toggle('selected', selected);
    });
    grid.querySelectorAll('[data-band]').forEach(cell => cell.classList.toggle('year-band', Number(cell.dataset.band) === group));
    grid.querySelectorAll('[data-year]').forEach(button => {
      button.disabled = Number(button.dataset.group) !== group;
      const selected = !button.disabled && Number(button.dataset.year) === state.year;
      button.setAttribute('aria-pressed', String(selected));
      button.parentElement.classList.toggle('selected', selected);
    });
    grid.querySelectorAll('[data-date]').forEach(button => {
      const index = Number(button.dataset.date);
      button.disabled = !validDates.has(index);
      button.parentElement.classList.toggle('date-available', !button.disabled);
      button.setAttribute('aria-pressed', String(chosen?.index === index));
      button.parentElement.classList.toggle('selected', chosen?.index === index);
    });
    grid.querySelectorAll('[data-row]').forEach(cell => cell.classList.toggle('date-row', Number(cell.dataset.row) === chosen?.row));
    let intersection;
    grid.querySelectorAll('[data-column]').forEach(cell => {
      const inColumn = Number(cell.dataset.column) === suffix?.column;
      const matches = inColumn && Number(cell.dataset.row) === chosen?.row;
      cell.classList.toggle('year-column', inColumn);
      cell.classList.toggle('intersection', matches);
      if (matches) intersection = cell;
    });
    if (chosen) {
      const date = `${two(chosen.day)}-${two(chosen.month + 1)}-${String(year).padStart(4, '0')}`;
      input.value = date;
      result.textContent = `${date} — ${weekdays[chosen.weekday]}`;
      if (reveal) intersection?.scrollIntoView({block: 'nearest', inline: 'nearest'});
    } else {
      input.value = '';
      result.textContent = group === null ? 'ಮೊದಲು ವರ್ಷದ ಮೊದಲ ಎರಡು ಅಂಕಿಗಳನ್ನು ಆರಿಸಿ.' : suffix ? 'ತಿಂಗಳು ಮತ್ತು ದಿನವನ್ನು ಆರಿಸಿ.' : 'ಗುರುತಿಸಿದ ಸಾಲುಗಳಲ್ಲಿ ವರ್ಷದ ಕೊನೆಯ ಎರಡು ಅಂಕಿಗಳನ್ನು ಆರಿಸಿ.';
    }
  }

  grid.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.century !== undefined) {
      Object.assign(state, {century: Number(button.dataset.century), year: null, month: null, day: null});
    } else if (button.dataset.year !== undefined) {
      Object.assign(state, {year: Number(button.dataset.year), month: null, day: null});
    } else {
      const {month, day} = dateCells[Number(button.dataset.date)];
      Object.assign(state, {month, day});
    }
    showSelection(button.dataset.date !== undefined);
  });

  document.getElementById('calendar-date-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = toAscii(input.value.trim());
    const match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const [day, month, year] = match ? match.slice(1).map(Number) : iso ? iso.slice(1).reverse().map(Number) : [];
    if (!match && !iso || findDate(year, month - 1, day) === null) {
      result.textContent = 'ಸರಿಯಾದ ದಿನಾಂಕವನ್ನು DD-MM-YYYY ರೂಪದಲ್ಲಿ ನಮೂದಿಸಿ.';
      return;
    }
    Object.assign(state, {century: Math.floor(year / 100), year: year % 100, month: month - 1, day});
    showSelection(true);
  });
  showSelection();
})();
