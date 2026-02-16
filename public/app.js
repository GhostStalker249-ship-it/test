const storageKey = 'backup-dashboard-widgets-v2';

const dashboardEl = document.getElementById('dashboard');
const addWidgetBtn = document.getElementById('add-widget-btn');
const cyberSettingsBtn = document.getElementById('cyber-settings-btn');
const ruSettingsBtn = document.getElementById('ru-settings-btn');
const lastUpdateEl = document.getElementById('last-update');

const dialog = document.getElementById('widget-dialog');
const form = document.getElementById('widget-form');
const providerSelect = form.elements.provider;
const typeSelect = form.elements.type;
const grafanaWrap = document.getElementById('grafana-url-wrap');
const specialFilterWrap = document.getElementById('special-filter-wrap');
const maxRowsWrap = document.getElementById('max-rows-wrap');

const cyberDialog = document.getElementById('cyber-settings-dialog');
const cyberForm = document.getElementById('cyber-settings-form');
const ruDialog = document.getElementById('ru-settings-dialog');
const ruForm = document.getElementById('ru-settings-form');

let providers = [];
let metrics = {};
let widgets = [];
let editingId = null;
const chartInstances = new Map();

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultSettings() {
  return {
    taskStatuses: 'running,success,failed,warning',
    actionStatuses: 'running,success,failed,warning',
    maxRows: 8,
  };
}

function loadProviderSettings(providerId) {
  const raw = localStorage.getItem(`${providerId}-settings-v1`);
  if (!raw) {
    return defaultSettings();
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      taskStatuses: parsed.taskStatuses || defaultSettings().taskStatuses,
      actionStatuses: parsed.actionStatuses || defaultSettings().actionStatuses,
      maxRows: Number(parsed.maxRows || defaultSettings().maxRows),
    };
  } catch {
    return defaultSettings();
  }
}

function saveProviderSettings(providerId, settings) {
  localStorage.setItem(`${providerId}-settings-v1`, JSON.stringify(settings));
}

function parseFilter(filterValue) {
  return filterValue
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function loadWidgets() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return [
      { id: uid(), title: 'Кибер Бекап: длительность задач', provider: 'cyber-backup', type: 'line' },
      { id: uid(), title: 'Кибер Бекап: задачи', provider: 'cyber-backup', type: 'cyber-tasks', statusFilter: 'running,success,failed', maxRows: 8 },
      { id: uid(), title: 'Кибер Бекап: действия', provider: 'cyber-backup', type: 'cyber-actions', statusFilter: 'running,success,failed,warning', maxRows: 8 },
      { id: uid(), title: 'RuBackup: задачи', provider: 'ru-backup', type: 'ru-tasks', statusFilter: 'running,success,failed', maxRows: 8 },
      { id: uid(), title: 'RuBackup: действия', provider: 'ru-backup', type: 'ru-actions', statusFilter: 'running,success,failed,warning', maxRows: 8 },
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

function updateWidgetTypeControls() {
  const special = ['cyber-tasks', 'cyber-actions', 'ru-tasks', 'ru-actions'].includes(typeSelect.value);
  grafanaWrap.classList.toggle('hidden', typeSelect.value !== 'grafana');
  specialFilterWrap.classList.toggle('hidden', !special);
  maxRowsWrap.classList.toggle('hidden', !special);
}

function openDialog(widget = null) {
  editingId = widget?.id || null;
  form.elements.title.value = widget?.title || '';
  form.elements.provider.value = widget?.provider || providers[0]?.id || '';
  form.elements.type.value = widget?.type || 'line';
  form.elements.grafanaUrl.value = widget?.grafanaUrl || '';
  form.elements.statusFilter.value = widget?.statusFilter || '';
  form.elements.maxRows.value = Number(widget?.maxRows || 8);
  updateWidgetTypeControls();
  dialog.showModal();
}

function renderStat(metricData) {
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

function renderSummary(summary, emptyLabel = 'нет данных') {
  const entries = Object.entries(summary || {});
  if (entries.length === 0) {
    return `<div class="summary-empty">${emptyLabel}</div>`;
  }

  return `
    <div class="summary-grid">
      ${entries
        .map(
          ([key, value]) => `
            <div class="tile compact">
              <span>${key}</span>
              <strong>${value}</strong>
            </div>
          `,
        )
        .join('')}
    </div>
  `;
}

function filterRows(rows, filterValue, maxRows) {
  const allowedStatuses = parseFilter(filterValue || '');
  const filtered = allowedStatuses.length
    ? rows.filter((row) => allowedStatuses.includes((row.status || '').toLowerCase()))
    : rows;

  return filtered.slice(0, Number(maxRows || 8));
}

function renderEntityTable(rows, tableType) {
  if (!rows.length) {
    return '<p class="summary-empty">Нет данных для выбранного фильтра.</p>';
  }

  return `
    <table class="entity-table">
      <thead>
        <tr>
          <th>Название</th>
          <th>Статус</th>
          <th>${tableType === 'actions' ? 'Тип действия' : 'Тип задачи'}</th>
          <th>Длительность</th>
          <th>Источник</th>
          <th>Старт</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${row.name}</td>
                <td><span class="status status-${(row.status || 'unknown').replace(/[^a-z0-9-]/gi, '')}">${row.status}</span></td>
                <td>${row.type || 'n/a'}</td>
                <td>${row.durationMinutes} мин</td>
                <td>${row.sourceHost || 'n/a'}</td>
                <td>${new Date(row.startedAt).toLocaleString('ru-RU')}</td>
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderEntityWidget(providerId, widget, metricData, widgetKind) {
  const settings = loadProviderSettings(providerId);
  const isActions = widgetKind === 'actions';
  const rows = filterRows(
    isActions ? (metricData.recentActions || metricData.actions || []) : (metricData.recentTasks || metricData.tasks || []),
    widget.statusFilter || (isActions ? settings.actionStatuses : settings.taskStatuses),
    widget.maxRows || settings.maxRows,
  );

  const titlePrefix = providerId === 'cyber-backup' ? 'Кибер Бекап' : 'RuBackup';
  return `
    <section>
      <h4>${titlePrefix}: ${isActions ? 'действия' : 'задачи'}</h4>
      ${renderSummary(isActions ? metricData.actionStatusSummary : metricData.taskStatusSummary, 'Сводка недоступна')}
      ${isActions ? `<h4>Типы действий</h4>${renderSummary(metricData.actionTypeSummary, 'Типы действий недоступны')}` : ''}
      <h4>Последние записи</h4>
      ${renderEntityTable(rows, widgetKind)}
    </section>
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
    body.innerHTML = renderStat(metricData);
  } else if (widget.type === 'cyber-tasks') {
    body.innerHTML = renderEntityWidget('cyber-backup', widget, metricData, 'tasks');
  } else if (widget.type === 'cyber-actions') {
    body.innerHTML = renderEntityWidget('cyber-backup', widget, metricData, 'actions');
  } else if (widget.type === 'ru-tasks') {
    body.innerHTML = renderEntityWidget('ru-backup', widget, metricData, 'tasks');
  } else if (widget.type === 'ru-actions') {
    body.innerHTML = renderEntityWidget('ru-backup', widget, metricData, 'actions');
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

function openProviderSettings(providerId, formRef, dialogRef) {
  const settings = loadProviderSettings(providerId);
  formRef.elements.taskStatuses.value = settings.taskStatuses;
  formRef.elements.actionStatuses.value = settings.actionStatuses;
  formRef.elements.maxRows.value = settings.maxRows;
  dialogRef.showModal();
}

function saveSettingsFromForm(providerId, formRef, dialogRef) {
  const data = new FormData(formRef);
  const settings = {
    taskStatuses: data.get('taskStatuses')?.toString().trim() || defaultSettings().taskStatuses,
    actionStatuses: data.get('actionStatuses')?.toString().trim() || defaultSettings().actionStatuses,
    maxRows: Number(data.get('maxRows') || defaultSettings().maxRows),
  };

  saveProviderSettings(providerId, settings);
  dialogRef.close();
  renderDashboard();
}

async function init() {
  widgets = loadWidgets();

  const providerResponse = await fetch('/api/providers');
  providers = await providerResponse.json();
  providerSelect.innerHTML = providers.map((provider) => `<option value="${provider.id}">${provider.title}</option>`).join('');

  addWidgetBtn.addEventListener('click', () => openDialog());
  cyberSettingsBtn.addEventListener('click', () => openProviderSettings('cyber-backup', cyberForm, cyberDialog));
  ruSettingsBtn.addEventListener('click', () => openProviderSettings('ru-backup', ruForm, ruDialog));

  typeSelect.addEventListener('change', updateWidgetTypeControls);

  document.getElementById('cancel-btn').addEventListener('click', () => dialog.close());
  document.getElementById('cyber-cancel-btn').addEventListener('click', () => cyberDialog.close());
  document.getElementById('ru-cancel-btn').addEventListener('click', () => ruDialog.close());

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const data = new FormData(form);
    const widgetData = {
      id: editingId || uid(),
      title: data.get('title'),
      provider: data.get('provider'),
      type: data.get('type'),
      grafanaUrl: data.get('grafanaUrl')?.toString().trim(),
      statusFilter: data.get('statusFilter')?.toString().trim(),
      maxRows: Number(data.get('maxRows') || 8),
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

  cyberForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveSettingsFromForm('cyber-backup', cyberForm, cyberDialog);
  });

  ruForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveSettingsFromForm('ru-backup', ruForm, ruDialog);
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
