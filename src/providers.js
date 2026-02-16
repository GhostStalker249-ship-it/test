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
      },
    },
    'ru-backup': {
      baseUrl: process.env.RU_BACKUP_BASE_URL || 'http://localhost:9002',
      token: process.env.RU_BACKUP_TOKEN || 'demo-token',
      endpoints: {
        tasks: process.env.RU_BACKUP_TASKS_PATH || '/api/tasks',
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
  return {
    provider: providerId,
    jobs,
    failedJobs: Math.round(Math.random() * 2),
    successfulJobs: Math.round(10 + Math.random() * 40),
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
