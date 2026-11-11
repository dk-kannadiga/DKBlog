(() => {
  const source = document.getElementById('calendar-source');
  const chart = document.getElementById('calendar-chart');
  const ctx = chart.getContext('2d', {willReadFrequently: true});
  if (!ctx) return;
  const width = chart.width, height = chart.height;
  // The printed grid occupies this rectangle in the rendered PDF page.
  const grid = {left: 38, top: 226, right: 2382, bottom: 1730};
  const row = document.getElementById('calendar-highlight-row');
  const column = document.getElementById('calendar-highlight-column');
  const cell = document.getElementById('calendar-highlight-cell');
  let original, selected;

  function isRule(x, y, horizontal) {
    let dark = 0;
    for (let offset = -9; offset <= 9; offset++) {
      const px = horizontal ? x + offset : x;
      const py = horizontal ? y : y + offset;
      if (px >= 0 && px < width && py >= 0 && py < height && original.data[(py * width + px) * 4] < 100) dark++;
    }
    return dark >= 16;
  }

  function boundary(x, y, step, horizontal) {
    const min = horizontal ? grid.top : grid.left;
    const max = horizontal ? grid.bottom : grid.right;
    const start = horizontal ? y : x;
    for (let i = start + step; i > min && i < max; i += step) {
      if (horizontal ? isRule(x, i, true) : isRule(i, y, false)) return i;
    }
    return step < 0 ? min : max;
  }

  function position(element, x, y, w, h) {
    element.style.left = `${x / width * 100}%`;
    element.style.top = `${y / height * 100}%`;
    element.style.width = `${w / width * 100}%`;
    element.style.height = `${h / height * 100}%`;
    element.hidden = false;
  }

  function highlight(x, y) {
    if (!original || x <= grid.left || x >= grid.right || y <= grid.top || y >= grid.bottom) return;
    const left = boundary(x, y, -1, false), right = boundary(x, y, 1, false);
    const top = boundary(x, y, -1, true), bottom = boundary(x, y, 1, true);
    position(row, grid.left, top, grid.right - grid.left, bottom - top);
    position(column, left, grid.top, right - left, grid.bottom - grid.top);
    position(cell, left, top, right - left, bottom - top);
    selected = {x, y, left, right, top, bottom};
  }

  function applyTheme() {
    if (!original) return;
    const style = getComputedStyle(document.documentElement);
    const rgb = (property, fallback) => {
      const hex = style.getPropertyValue(property).trim() || fallback;
      return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
    };
    const ink = rgb('--ink', '#2c1a0e'), paper = rgb('--cb', '#fffdf5');
    const pixels = ctx.createImageData(width, height);
    for (let i = 0; i < original.data.length; i += 4) {
      const light = original.data[i] / 255;
      for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = ink[channel] * (1 - light) + paper[channel] * light;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
  }

  function initialize() {
    ctx.drawImage(source, 0, 0, width, height);
    original = ctx.getImageData(0, 0, width, height);
    applyTheme();
    source.hidden = true;
    chart.hidden = false;
    new MutationObserver(applyTheme).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme', 'style']});
  }
  if (source.complete && source.naturalWidth) initialize();
  else source.addEventListener('load', initialize, {once: true});

  chart.addEventListener('click', event => {
    const rect = chart.getBoundingClientRect();
    highlight(Math.round((event.clientX - rect.left) * width / rect.width), Math.round((event.clientY - rect.top) * height / rect.height));
  });
  chart.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      row.hidden = column.hidden = cell.hidden = true;
      selected = null;
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (!selected) { highlight(grid.left + 18, grid.top + 50); return; }
    let {x, y} = selected;
    if (event.key === 'ArrowLeft') x = selected.left - 4;
    if (event.key === 'ArrowRight') x = selected.right + 4;
    if (event.key === 'ArrowUp') y = selected.top - 4;
    if (event.key === 'ArrowDown') y = selected.bottom + 4;
    highlight(x, y);
  });
})();
