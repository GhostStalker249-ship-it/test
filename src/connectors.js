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
    timestamp: new Date(item.timestamp || item.time || now - (items.length - idx) * 60_000).getTime(),
    value: Number(item[metric] ?? item.value ?? 0),
    status: item.status,
  }));
}

async function queryCyberBackup(config) {
  const url = `${config.baseUrl}${config.endpoints.jobs}`;
  const data = await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });
  return {
    provider: 'cyber-backup',
    jobs: mapMetric(data.jobs || data.items || [], 'durationMinutes'),
    failedJobs: Number(data.failedJobs ?? 0),
    successfulJobs: Number(data.successfulJobs ?? 0),
  };
}

async function queryRuBackup(config) {
  const url = `${config.baseUrl}${config.endpoints.tasks}`;
  const data = await fetchJson(url, {
    headers: {
      'X-API-Key': config.token,
    },
  });
  return {
    provider: 'ru-backup',
    jobs: mapMetric(data.tasks || data.items || [], 'durationMinutes'),
    failedJobs: Number(data.failed ?? 0),
    successfulJobs: Number(data.completed ?? 0),
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
};
