const storageKey = 'backup-dashboard-widgets-v1';

const dashboardEl = document.getElementById('dashboard');
const addWidgetBtn = document.getElementById('add-widget-btn');
const lastUpdateEl = document.getElementById('last-update');
const dialog = document.getElementById('widget-dialog');
const form = document.getElementById('widget-form');
const providerSelect = form.elements.provider;
const typeSelect = form.elements.type;
const grafanaWrap = document.getElementById('grafana-url-wrap');

let providers = [];
let metrics = {};
let widgets = [];
let editingId = null;
const chartInstances = new Map();

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function loadWidgets() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return [
      { id: uid(), title: 'Кибер Бекап: длительность job', provider: 'cyber-backup', type: 'line' },
      { id: uid(), title: 'RuBackup: статистика', provider: 'ru-backup', type: 'stat' },
      { id: uid(), title: 'Veeam: длительность job', provider: 'veeam', type: 'bar' },
    ];
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveWidgets() {
  localStorage.setItem(storageKey, JSON.stringify(widgets));
}

function openDialog(widget = null) {
  editingId = widget?.id || null;
  form.elements.title.value = widget?.title || '';
  form.elements.provider.value = widget?.provider || providers[0]?.id || '';
  form.elements.type.value = widget?.type || 'line';
  form.elements.grafanaUrl.value = widget?.grafanaUrl || '';
  grafanaWrap.classList.toggle('hidden', form.elements.type.value !== 'grafana');
  dialog.showModal();
}

function renderStat(widget, metricData) {
  const latest = metricData.jobs.at(-1)?.value ?? 0;
  return `
    <div class="stat">
      <div class="tile"><span>Успешно</span><strong>${metricData.successfulJobs}</strong></div>
      <div class="tile"><span>Ошибки</span><strong>${metricData.failedJobs}</strong></div>
      <div class="tile"><span>Последняя длительность</span><strong>${latest} мин</strong></div>
      <div class="tile"><span>Источник</span><strong>${metricData.source}</strong></div>
    </div>
  `;
}

function renderWidget(widget) {
  const metricData = metrics[widget.provider] || { jobs: [], successfulJobs: 0, failedJobs: 0, source: 'n/a' };

  const article = document.createElement('article');
  article.className = 'widget';
  article.innerHTML = `
    <header>
      <strong>${widget.title}</strong>
      <div class="widget-actions">
        <button data-edit="${widget.id}">⚙</button>
        <button data-delete="${widget.id}">✕</button>
      </div>
    </header>
    <div class="widget-body"></div>
  `;

  const body = article.querySelector('.widget-body');

  if (widget.type === 'stat') {
    body.innerHTML = renderStat(widget, metricData);
  } else if (widget.type === 'grafana') {
    body.innerHTML = widget.grafanaUrl
      ? `<iframe src="${widget.grafanaUrl}" loading="lazy"></iframe>`
      : '<p>Укажите URL панели Grafana в настройках виджета.</p>';
  } else {
    const canvas = document.createElement('canvas');
    body.appendChild(canvas);
    const labels = metricData.jobs.map((point) => new Date(point.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    const dataset = metricData.jobs.map((point) => point.value);

    const chart = new Chart(canvas, {
      type: widget.type,
      data: {
        labels,
        datasets: [
          {
            label: widget.title,
            data: dataset,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.35)',
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });

    chartInstances.set(widget.id, chart);
    canvas.style.minHeight = '180px';
  }

  return article;
}

function renderDashboard() {
  chartInstances.forEach((chart) => chart.destroy());
  chartInstances.clear();
  dashboardEl.innerHTML = '';

  widgets.forEach((widget) => {
    dashboardEl.appendChild(renderWidget(widget));
  });
}

async function refreshData() {
  const response = await fetch('/api/metrics');
  const payload = await response.json();
  metrics = payload.metrics;
  lastUpdateEl.textContent = `Обновление: ${new Date(payload.timestamp).toLocaleTimeString('ru-RU')}`;
  renderDashboard();
}

async function init() {
  widgets = loadWidgets();

  const providerResponse = await fetch('/api/providers');
  providers = await providerResponse.json();
  providerSelect.innerHTML = providers.map((provider) => `<option value="${provider.id}">${provider.title}</option>`).join('');

  addWidgetBtn.addEventListener('click', () => openDialog());

  typeSelect.addEventListener('change', () => {
    grafanaWrap.classList.toggle('hidden', typeSelect.value !== 'grafana');
  });

  document.getElementById('cancel-btn').addEventListener('click', () => dialog.close());

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const data = new FormData(form);
    const widgetData = {
      id: editingId || uid(),
      title: data.get('title'),
      provider: data.get('provider'),
      type: data.get('type'),
      grafanaUrl: data.get('grafanaUrl')?.toString().trim(),
    };

    if (editingId) {
      widgets = widgets.map((widget) => (widget.id === editingId ? widgetData : widget));
    } else {
      widgets.push(widgetData);
    }

    saveWidgets();
    dialog.close();
    renderDashboard();
  });

  dashboardEl.addEventListener('click', (event) => {
    const element = event.target;

    if (element.dataset.edit) {
      const widget = widgets.find((item) => item.id === element.dataset.edit);
      if (widget) {
        openDialog(widget);
      }
    }

    if (element.dataset.delete) {
      widgets = widgets.filter((item) => item.id !== element.dataset.delete);
      saveWidgets();
      renderDashboard();
    }
  });

  await refreshData();
  setInterval(refreshData, 60_000);
}

init();
