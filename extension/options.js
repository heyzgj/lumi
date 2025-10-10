const STORAGE_KEY = 'lumiSettings';
const DEFAULT_SETTINGS = {
  serverUrl: 'http://127.0.0.1:3456',
  defaultEngine: 'codex',
  codex: {
    model: 'gpt-5-codex-high',
    sandbox: 'workspace-write',
    approvals: 'never',
    extraArgs: ''
  },
  claude: {
    model: 'claude-sonnet-4.5',
    tools: ['TextEditor', 'Read'],
    outputFormat: 'json',
    permissionMode: 'acceptEdits',
    extraArgs: ''
  },
  projects: []
};

let currentProjects = [];
let lastInvalidProjectCount = 0;
let toastTimeout = null;

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  if (!message) {
    toast.classList.remove('visible', 'success', 'error', 'info');
    return;
  }

  toast.textContent = message;
  toast.classList.remove('success', 'error', 'info');
  toast.classList.add(type || 'info');

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 3400);
}

function $(id) {
  return document.getElementById(id);
}

function generateProjectId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeHostPattern(value) {
  if (!value) return '';
  let pattern = String(value).trim().toLowerCase();
  if (!pattern) return '';

  if (pattern.startsWith('http://')) {
    pattern = pattern.slice(7);
  } else if (pattern.startsWith('https://')) {
    pattern = pattern.slice(8);
  }

  if (pattern.startsWith('//')) {
    pattern = pattern.slice(2);
  }

  pattern = pattern.replace(/\s+/g, '');

  if (pattern.endsWith('/')) {
    pattern = pattern.replace(/\/+$/, '');
  }

  return pattern;
}

function sanitizeProjects(projects = []) {
  if (!Array.isArray(projects)) return [];
  return projects
    .map((project, index) => {
      if (!project || typeof project !== 'object') return null;
      const id = typeof project.id === 'string' && project.id.trim().length
        ? project.id.trim()
        : generateProjectId() + `-${index}`;
      const name = typeof project.name === 'string' ? project.name.trim() : '';
      const workingDirectory = typeof project.workingDirectory === 'string'
        ? project.workingDirectory.trim()
        : '';
      const hosts = Array.isArray(project.hosts)
        ? project.hosts.map((host) => normalizeHostPattern(host)).filter(Boolean)
        : [];
      const enabled = project.enabled !== false;

      if (!workingDirectory || hosts.length === 0) {
        return null;
      }

      return {
        id,
        name,
        workingDirectory,
        hosts,
        enabled,
        note: typeof project.note === 'string' ? project.note : undefined
      };
    })
    .filter(Boolean);
}

function ensureProjectShape(project) {
  const base = project && typeof project === 'object' ? { ...project } : {};
  if (!base.id) base.id = generateProjectId();
  base.name = typeof base.name === 'string' ? base.name : '';
  base.workingDirectory = typeof base.workingDirectory === 'string'
    ? base.workingDirectory
    : '';
  base.hosts = Array.isArray(base.hosts)
    ? base.hosts.map((host) => normalizeHostPattern(host)).filter(Boolean)
    : [];
  base.hostsText = typeof base.hostsText === 'string'
    ? base.hostsText
    : base.hosts.join(', ');
  base.enabled = base.enabled !== false;
  return base;
}

function updateProject(id, updates) {
  const index = currentProjects.findIndex((project) => project.id === id);
  if (index === -1) return;
  currentProjects[index] = { ...currentProjects[index], ...updates };
}

function syncProjectsFromUI() {
  const list = $('projectsList');
  if (!list) return;
  const rows = Array.from(list.querySelectorAll('.project-row'));
  rows.forEach((row) => {
    const id = row.dataset.id;
    if (!id) return;
    const nameInput = row.querySelector('.project-name');
    const directoryInput = row.querySelector('.project-directory');
    const hostsInput = row.querySelector('.project-hosts');
    const hostsValue = hostsInput?.value || '';
    const normalizedHosts = hostsValue
      .split(',')
      .map((host) => normalizeHostPattern(host))
      .filter(Boolean);
    updateProject(id, {
      name: nameInput?.value || '',
      workingDirectory: directoryInput?.value || '',
      hostsText: hostsValue,
      hosts: normalizedHosts
    });
  });
}

function renderProjects(projects = currentProjects) {
  currentProjects = Array.isArray(projects)
    ? projects.map((project) => ensureProjectShape(project))
    : [];

  const list = $('projectsList');
  const emptyState = $('projectsEmpty');
  if (!list || !emptyState) return;

  list.innerHTML = '';

  if (currentProjects.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  currentProjects.forEach((project) => {
    const row = createProjectRow(project);
    list.appendChild(row);
  });
}

function createProjectRow(project) {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.id = project.id;

  row.innerHTML = `
    <div class="row-header">
      <h3>${project.name ? project.name : 'Unnamed Project'}</h3>
      <div class="row-actions">
        <button type="button" class="remove-project">Remove</button>
      </div>
    </div>
    <div class="row-body">
      <div class="field">
        <label>Display Name</label>
        <input type="text" class="project-name" placeholder="Marketing Site" />
      </div>
      <div class="field">
        <label>Working Directory</label>
        <input type="text" class="project-directory directory-input" placeholder="/Users/you/project" />
        <small>Absolute path where Codex/Claude should run.</small>
      </div>
      <div class="field">
        <label>Host Patterns</label>
        <input type="text" class="project-hosts hosts-input" placeholder="localhost:3000, staging.example.com" />
        <small>Comma separated. Supports * wildcards, e.g., *.example.com</small>
      </div>
    </div>
  `;

  const title = row.querySelector('.row-header h3');
  const nameInput = row.querySelector('.project-name');
  const directoryInput = row.querySelector('.project-directory');
  const hostsInput = row.querySelector('.project-hosts');
  const removeBtn = row.querySelector('.remove-project');

  if (nameInput) {
    nameInput.value = project.name || '';
    nameInput.addEventListener('input', () => {
      updateProject(project.id, { name: nameInput.value });
      title.textContent = nameInput.value.trim() || 'Unnamed Project';
    });
  }

  if (directoryInput) {
    directoryInput.value = project.workingDirectory || '';
    directoryInput.addEventListener('input', () => {
      updateProject(project.id, { workingDirectory: directoryInput.value });
    });
  }

  if (hostsInput) {
    hostsInput.value = project.hostsText || project.hosts?.join(', ') || '';
    const scheduleNormalize = () => {
      const raw = hostsInput.value || '';
      const normalized = raw
        .split(',')
        .map((host) => normalizeHostPattern(host))
        .filter(Boolean);
      updateProject(project.id, {
        hostsText: raw,
        hosts: normalized
      });
    };
    hostsInput.addEventListener('input', scheduleNormalize);
    hostsInput.addEventListener('blur', () => {
      scheduleNormalize();
      const latest = currentProjects.find((item) => item.id === project.id);
      if (latest && Array.isArray(latest.hosts)) {
        hostsInput.value = latest.hosts.join(', ');
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      syncProjectsFromUI();
      currentProjects = currentProjects.filter((item) => item.id !== project.id);
      renderProjects();
    });
  }

  return row;
}

function collectProjects() {
  syncProjectsFromUI();
  const sanitized = sanitizeProjects(currentProjects);
  lastInvalidProjectCount = currentProjects.length - sanitized.length;
  return sanitized;
}

function addNewProject() {
  syncProjectsFromUI();
  const newProject = ensureProjectShape({
    id: generateProjectId(),
    name: 'New Project',
    workingDirectory: '',
    hosts: [],
    hostsText: ''
  });
  currentProjects = [...currentProjects, newProject];
  renderProjects();
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY, 'engine'], (result) => {
      const stored = result[STORAGE_KEY];
      const merged = mergeSettings(stored || {});
      if (!merged.defaultEngine && result.engine) {
        merged.defaultEngine = result.engine;
      }
      resolve(merged);
    });
  });
}

function mergeSettings(input) {
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    codex: {
      ...DEFAULT_SETTINGS.codex,
      ...(input.codex || {})
    },
    claude: {
      ...DEFAULT_SETTINGS.claude,
      ...(input.claude || {})
    },
    projects: Array.isArray(input.projects) ? input.projects : DEFAULT_SETTINGS.projects
  };
}

function applySettings(settings) {
  $('serverUrl').value = settings.serverUrl;
  document.querySelectorAll('input[name="defaultEngine"]').forEach((radio) => {
    radio.checked = radio.value === settings.defaultEngine;
  });

  $('codexModel').value = settings.codex.model;
  $('codexSandbox').value = settings.codex.sandbox;
  $('codexApprovals').value = settings.codex.approvals;
  $('codexExtraArgs').value = settings.codex.extraArgs || '';

  $('claudeModel').value = settings.claude.model;
  $('claudeOutputFormat').value = settings.claude.outputFormat;
  $('claudePermissionMode').value = settings.claude.permissionMode;
  $('claudeExtraArgs').value = settings.claude.extraArgs || '';

  const tools = new Set(settings.claude.tools || []);
  document.querySelectorAll('fieldset input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = tools.has(checkbox.value);
  });

  renderProjects(settings.projects || []);
}

function collectSettings() {
  const defaultEngine = document.querySelector('input[name="defaultEngine"]:checked')?.value || 'codex';
  const serverUrl = $('serverUrl').value.trim() || DEFAULT_SETTINGS.serverUrl;

  const claudeTools = Array.from(document.querySelectorAll('fieldset input[type="checkbox"]'))
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);

  const projects = collectProjects();

  return {
    serverUrl,
    defaultEngine,
    codex: {
      model: $('codexModel').value.trim() || DEFAULT_SETTINGS.codex.model,
      sandbox: $('codexSandbox').value,
      approvals: $('codexApprovals').value,
      extraArgs: $('codexExtraArgs').value.trim()
    },
    claude: {
      model: $('claudeModel').value.trim() || DEFAULT_SETTINGS.claude.model,
      tools: claudeTools.length ? claudeTools : DEFAULT_SETTINGS.claude.tools,
      outputFormat: $('claudeOutputFormat').value,
      permissionMode: $('claudePermissionMode').value,
      extraArgs: $('claudeExtraArgs').value.trim()
    },
    projects
  };
}

function setStatus(message, type = 'info') {
  const card = document.getElementById('statusCard');
  const content = document.getElementById('statusMessage');
  if (!message) {
    card.hidden = true;
    card.classList.remove('success', 'error', 'info');
    content.textContent = '';
    showToast('');
    return;
  }
  card.hidden = false;
  card.classList.remove('success', 'error', 'info');
  if (type === 'success') card.classList.add('success');
  if (type === 'error') card.classList.add('error');
  if (type === 'info') card.classList.add('info');
  content.textContent = message;

  if (type === 'success' || type === 'error') {
    showToast(message, type);
  }
}

function labelFor(section) {
  switch (section) {
    case 'connection':
      return 'connection';
    case 'projects':
      return 'projects';
    case 'codex':
      return 'codex';
    case 'claude':
      return 'claude';
    default:
      return 'settings';
  }
}

async function saveSettings(section) {
  const settings = collectSettings();
  let invalidNotice = '';
  if (lastInvalidProjectCount > 0) {
    invalidNotice = ` Skipped ${lastInvalidProjectCount}.`;
    lastInvalidProjectCount = 0;
  }
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: settings, engine: settings.defaultEngine });
    await sendMessage({ type: 'APPLY_SETTINGS', payload: settings });
    renderProjects(settings.projects);
    const label = labelFor(section);
    setStatus(`Saved ${label}.${invalidNotice}`, 'success');
  } catch (error) {
    setStatus(`Save failed. ${error.message}`, 'error');
  }
}

function resetSection(section) {
  const label = labelFor(section);
  switch (section) {
    case 'connection': {
      $('serverUrl').value = DEFAULT_SETTINGS.serverUrl;
      document.querySelectorAll('input[name="defaultEngine"]').forEach((radio) => {
        radio.checked = radio.value === DEFAULT_SETTINGS.defaultEngine;
      });
      break;
    }
    case 'projects': {
      currentProjects = [];
      renderProjects();
      break;
    }
    case 'codex': {
      $('codexModel').value = DEFAULT_SETTINGS.codex.model;
      $('codexSandbox').value = DEFAULT_SETTINGS.codex.sandbox;
      $('codexApprovals').value = DEFAULT_SETTINGS.codex.approvals;
      $('codexExtraArgs').value = DEFAULT_SETTINGS.codex.extraArgs;
      break;
    }
    case 'claude': {
      $('claudeModel').value = DEFAULT_SETTINGS.claude.model;
      $('claudeOutputFormat').value = DEFAULT_SETTINGS.claude.outputFormat;
      $('claudePermissionMode').value = DEFAULT_SETTINGS.claude.permissionMode;
      $('claudeExtraArgs').value = DEFAULT_SETTINGS.claude.extraArgs;
      const tools = new Set(DEFAULT_SETTINGS.claude.tools);
      document.querySelectorAll('fieldset input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = tools.has(checkbox.value);
      });
      break;
    }
    default:
      applySettings(DEFAULT_SETTINGS);
      break;
  }
  setStatus(`Reset ${label}.`, 'info');
}

function normalizeUrl(url) {
  if (!url) return DEFAULT_SETTINGS.serverUrl;
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function testConnection() {
  setStatus('Testing...', 'info');
  const button = document.getElementById('testConnection');
  button.disabled = true;
  try {
    const { serverUrl } = collectSettings();
    const normalized = normalizeUrl(serverUrl);
    const response = await fetch(`${normalized}/health`, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
    const data = await response.json();
    const codexAvailable = Boolean(data?.config?.cliCapabilities?.codex?.available);
    const claudeAvailable = Boolean(data?.config?.cliCapabilities?.claude?.available);
    setStatus(`Connected. Codex ${codexAvailable ? 'yes' : 'no'} · Claude ${claudeAvailable ? 'yes' : 'no'}`, 'success');
  } catch (error) {
    setStatus(`Connection failed. ${error.message}`, 'error');
  } finally {
    button.disabled = false;
  }
}

function setActiveSection(panelId) {
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === panelId);
  });
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.target === panelId);
  });
}

function registerEvents() {
  $('testConnection').addEventListener('click', (event) => {
    event.preventDefault();
    testConnection();
  });
  const addProjectBtn = $('addProject');
  if (addProjectBtn) {
    addProjectBtn.addEventListener('click', (event) => {
      event.preventDefault();
      addNewProject();
    });
  }

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setActiveSection(link.dataset.target);
    });
  });

  document.querySelectorAll('.section-save').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      saveSettings(button.dataset.section);
    });
  });

  document.querySelectorAll('.section-reset').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      resetSection(button.dataset.section);
    });
  });

  setActiveSection('connection-panel');
}

async function init() {
  const settings = await loadSettings();
  applySettings(settings);
  registerEvents();
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => setStatus(`Initialization failed: ${error.message}`, 'error'));
});
