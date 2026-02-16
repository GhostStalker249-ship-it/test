const DEFAULT_TIMEOUT_MS = 8000;

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function mapMetric(items, metric) {
  const now = Date.now();
  if (!Array.isArray(items) || items.length === 0) {
    return Array.from({ length: 10 }, (_, idx) => ({
      timestamp: now - (9 - idx) * 60_000,
      value: 0,
    }));
  }

  return items.map((item, idx) => ({
    timestamp: new Date(item.timestamp || item.time || item.startedAt || now - (items.length - idx) * 60_000).getTime(),
    value: Number(item[metric] ?? item.value ?? 0),
    status: item.status,
  }));
}

function toArray(payload, preferredKeys = []) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  for (const key of preferredKeys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  if (Array.isArray(payload.value)) {
    return payload.value;
  }

  return [];
}

function durationMinutes(item) {
  const direct = Number(item.durationMinutes ?? item.duration ?? item.executionTimeMinutes);
  if (!Number.isNaN(direct) && Number.isFinite(direct) && direct > 0) {
    return Math.round(direct);
  }

  const start = new Date(item.startedAt || item.startTime || item.createdAt || 0).getTime();
  const end = new Date(item.finishedAt || item.endTime || item.updatedAt || Date.now()).getTime();
  if (start > 0 && end > start) {
    return Math.round((end - start) / 60_000);
  }

  return 0;
}

function normalizeCyberEntity(item, index = 0) {
  const startedAt = item.startedAt || item.startTime || item.createdAt || new Date(Date.now() - index * 60_000).toISOString();
  const status = (item.state || item.status || item.result || 'unknown').toString().toLowerCase();

  return {
    id: String(item.id || item.taskId || item.actionId || index + 1),
    name: item.name || item.taskName || item.actionName || item.policyName || `Entity #${index + 1}`,
    status,
    startedAt,
    finishedAt: item.finishedAt || item.endTime || item.updatedAt || null,
    type: item.type || item.operation || item.actionType || 'n/a',
    durationMinutes: durationMinutes(item),
  };
}

function normalizeRuEntity(item, index = 0) {
  const startedAt = item.startedAt || item.startTime || item.createdAt || item.beginTime || item.dateStart || new Date(Date.now() - index * 60_000).toISOString();
  const status = (item.status || item.state || item.result || item.lastResult || 'unknown').toString().toLowerCase();

  return {
    id: String(item.id || item.taskId || item.jobId || item.operationId || index + 1),
    name: item.name || item.taskName || item.jobName || item.planName || item.objectName || `RuBackup entity #${index + 1}`,
    status,
    startedAt,
    finishedAt: item.finishedAt || item.endTime || item.updatedAt || item.dateEnd || null,
    type: item.type || item.taskType || item.operationType || item.actionType || 'n/a',
    durationMinutes: durationMinutes(item),
    sourceHost: item.hostName || item.agent || item.nodeName || item.serverName || 'n/a',
  };
}

function summarizeByStatus(items) {
  return items.reduce((acc, item) => {
    const status = item.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function summarizeByType(items) {
  return items.reduce((acc, item) => {
    const type = item.type || 'n/a';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
}

function topRecent(items, limit = 10) {
  return [...items]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}

async function queryCyberBackup(config) {
  const headers = {
    Authorization: `Bearer ${config.token}`,
  };

  const jobsPayload = await fetchJson(`${config.baseUrl}${config.endpoints.jobs}`, { headers });
  const tasksPayload = await fetchJson(`${config.baseUrl}${config.endpoints.tasks}`, { headers });

  let actionsPayload = { items: [] };
  try {
    actionsPayload = await fetchJson(`${config.baseUrl}${config.endpoints.actions}`, { headers });
  } catch {
    actionsPayload = { items: [] };
  }

  const jobs = mapMetric(toArray(jobsPayload, ['jobs', 'sessions']), 'durationMinutes');
  const tasks = toArray(tasksPayload, ['tasks', 'activities']).map(normalizeCyberEntity);
  const actions = toArray(actionsPayload, ['actions', 'operations', 'activities']).map(normalizeCyberEntity);

  const failedJobs = Number(jobsPayload.failedJobs ?? jobsPayload.failed ?? tasks.filter((item) => item.status.includes('fail')).length);
  const successfulJobs = Number(jobsPayload.successfulJobs ?? jobsPayload.success ?? tasks.filter((item) => item.status.includes('success')).length);

  return {
    provider: 'cyber-backup',
    jobs,
    failedJobs,
    successfulJobs,
    tasks,
    actions,
    taskStatusSummary: summarizeByStatus(tasks),
    actionStatusSummary: summarizeByStatus(actions),
    actionTypeSummary: summarizeByType(actions),
    recentTasks: topRecent(tasks),
    recentActions: topRecent(actions),
  };
}

async function queryRuBackup(config) {
  const headers = {
    'X-API-Key': config.token,
    Authorization: `Bearer ${config.token}`,
  };

  const jobsPayload = await fetchJson(`${config.baseUrl}${config.endpoints.jobs}`, {
    headers: {
      ...headers,
    },
  });

  let tasksPayload = { items: [] };
  try {
    tasksPayload = await fetchJson(`${config.baseUrl}${config.endpoints.tasks}`, { headers });
  } catch {
    tasksPayload = { items: [] };
  }

  let actionsPayload = { items: [] };
  try {
    actionsPayload = await fetchJson(`${config.baseUrl}${config.endpoints.actions}`, { headers });
  } catch {
    actionsPayload = { items: [] };
  }

  const jobs = mapMetric(toArray(jobsPayload, ['jobs', 'sessions', 'history']), 'durationMinutes');
  const tasks = toArray(tasksPayload, ['tasks', 'plans', 'jobs']).map(normalizeRuEntity);
  const actions = toArray(actionsPayload, ['actions', 'operations', 'activities']).map(normalizeRuEntity);

  const failedJobs = Number(
    jobsPayload.failedJobs
      ?? jobsPayload.failed
      ?? tasks.filter((item) => item.status.includes('fail') || item.status.includes('error')).length,
  );
  const successfulJobs = Number(
    jobsPayload.successfulJobs
      ?? jobsPayload.completed
      ?? jobsPayload.success
      ?? tasks.filter((item) => item.status.includes('success') || item.status.includes('completed')).length,
  );

  return {
    provider: 'ru-backup',
    jobs,
    failedJobs,
    successfulJobs,
    tasks,
    actions,
    taskStatusSummary: summarizeByStatus(tasks),
    actionStatusSummary: summarizeByStatus(actions),
    actionTypeSummary: summarizeByType(actions),
    recentTasks: topRecent(tasks),
    recentActions: topRecent(actions),
  };
}

async function queryVeeam(config) {
  const url = `${config.baseUrl}${config.endpoints.sessions}`;
  const data = await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });
  return {
    provider: 'veeam',
    jobs: mapMetric(data.sessions || data.items || [], 'durationMinutes'),
    failedJobs: Number(data.failed ?? 0),
    successfulJobs: Number(data.success ?? 0),
  };
}

module.exports = {
  queryCyberBackup,
  queryRuBackup,
  queryVeeam,
  mapMetric,
  normalizeCyberEntity,
  normalizeRuEntity,
  summarizeByStatus,
  summarizeByType,
};
