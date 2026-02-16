const {
  queryCyberBackup,
  queryRuBackup,
  queryVeeam,
} = require('./connectors');

const providers = {
  'cyber-backup': {
    title: 'Кибер Бекап',
    query: queryCyberBackup,
  },
  'ru-backup': {
    title: 'RuBackup',
    query: queryRuBackup,
  },
  veeam: {
    title: 'Veeam',
    query: queryVeeam,
  },
};

const defaultConfig = {
  refreshIntervalSeconds: 60,
  providers: {
    'cyber-backup': {
      baseUrl: process.env.CYBER_BACKUP_BASE_URL || 'http://localhost:9001',
      token: process.env.CYBER_BACKUP_TOKEN || 'demo-token',
      endpoints: {
        jobs: process.env.CYBER_BACKUP_JOBS_PATH || '/api/jobs',
        tasks: process.env.CYBER_BACKUP_TASKS_PATH || '/api/tasks',
        actions: process.env.CYBER_BACKUP_ACTIONS_PATH || '/api/activities',
      },
    },
    'ru-backup': {
      baseUrl: process.env.RU_BACKUP_BASE_URL || 'http://localhost:9002',
      token: process.env.RU_BACKUP_TOKEN || 'demo-token',
      endpoints: {
        jobs: process.env.RU_BACKUP_JOBS_PATH || '/api/tasks',
        tasks: process.env.RU_BACKUP_TASKS_PATH || '/api/plans',
        actions: process.env.RU_BACKUP_ACTIONS_PATH || '/api/actions',
      },
    },
    veeam: {
      baseUrl: process.env.VEEAM_BASE_URL || 'http://localhost:9003',
      token: process.env.VEEAM_TOKEN || 'demo-token',
      endpoints: {
        sessions: process.env.VEEAM_SESSIONS_PATH || '/api/sessions',
      },
    },
  },
};

function fallbackResult(providerId) {
  const now = Date.now();
  const jobs = Array.from({ length: 12 }, (_, idx) => ({
    timestamp: now - (11 - idx) * 5 * 60_000,
    value: Math.round(10 + Math.random() * 70),
  }));

  const tasks = Array.from({ length: 8 }, (_, idx) => ({
    id: `${providerId}-task-${idx + 1}`,
    name: `Задача ${idx + 1}`,
    status: idx % 4 === 0 ? 'failed' : idx % 3 === 0 ? 'running' : 'success',
    startedAt: new Date(now - idx * 35 * 60_000).toISOString(),
    durationMinutes: Math.round(5 + Math.random() * 70),
    type: 'backup',
  }));

  const actions = Array.from({ length: 10 }, (_, idx) => ({
    id: `${providerId}-action-${idx + 1}`,
    name: `Действие ${idx + 1}`,
    status: idx % 5 === 0 ? 'warning' : idx % 2 === 0 ? 'success' : 'running',
    startedAt: new Date(now - idx * 20 * 60_000).toISOString(),
    durationMinutes: Math.round(1 + Math.random() * 20),
    type: idx % 2 === 0 ? 'backup' : 'validation',
  }));

  return {
    provider: providerId,
    jobs,
    failedJobs: Math.round(Math.random() * 2),
    successfulJobs: Math.round(10 + Math.random() * 40),
    tasks,
    actions,
    taskStatusSummary: tasks.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {}),
    actionStatusSummary: actions.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {}),
    actionTypeSummary: actions.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {}),
    recentTasks: tasks.slice(0, 5),
    recentActions: actions.slice(0, 5),
    source: 'fallback',
  };
}

async function collectProvider(providerId) {
  const provider = providers[providerId];
  const config = defaultConfig.providers[providerId];

  if (!provider || !config) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  try {
    const result = await provider.query(config);
    return { ...result, source: 'api' };
  } catch (error) {
    return {
      ...fallbackResult(providerId),
      error: error.message,
    };
  }
}

async function collectAll() {
  const entries = await Promise.all(
    Object.keys(providers).map(async (providerId) => [providerId, await collectProvider(providerId)]),
  );

  return Object.fromEntries(entries);
}

module.exports = {
  providers,
  defaultConfig,
  collectAll,
  collectProvider,
};
