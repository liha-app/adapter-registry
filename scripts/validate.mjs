import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

const args = new Set(process.argv.slice(2));
const rootFlag = process.argv.indexOf('--root');
const root = resolve(rootFlag >= 0 ? process.argv[rootFlag + 1] : process.cwd());
const shouldWrite = args.has('--write');
const shouldCheck = args.has('--check') || !shouldWrite;
const errors = [];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const at = (path, message) => errors.push(`${path}: ${message}`);
const hasOnly = (value, allowed, path) => {
  if (!isObject(value)) return at(path, 'must be an object');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) at(`${path}.${key}`, 'is not allowed');
};
const string = (value, path, { min = 0, max = Infinity, pattern } = {}) => {
  if (typeof value !== 'string') return at(path, 'must be a string');
  if (value.length < min || value.length > max) at(path, `must contain ${min}–${max} characters`);
  if (pattern && !pattern.test(value)) at(path, 'has an invalid format');
};
const array = (value, path, { min = 0, max = Infinity } = {}) => {
  if (!Array.isArray(value)) {
    at(path, 'must be an array');
    return [];
  }
  if (value.length < min || value.length > max) at(path, `must contain ${min}–${max} items`);
  return value;
};

const TOP_KEYS = ['id', 'name', 'version', 'description', 'category', 'author', 'homepage', 'verifiedAt', 'origins', 'tools'];
const TOOL_KEYS = ['name', 'title', 'description', 'capability', 'inputSchema', 'probeSelectors', 'steps'];
const CATEGORIES = new Set(['crm', 'commerce', 'productivity', 'developer-tools', 'registry', 'other']);
const CAPABILITIES = new Set(['READ', 'INTERACT', 'WRITE', 'DESTRUCTIVE']);
const INPUT_TYPES = new Set(['string', 'number', 'integer', 'boolean']);
const STEP_KEYS = {
  click: ['type', 'selector'], fill: ['type', 'selector', 'value'], select: ['type', 'selector', 'value'],
  check: ['type', 'selector'], uncheck: ['type', 'selector'], submit: ['type', 'selector'],
  waitFor: ['type', 'selector', 'state', 'timeoutMs'], assertVisible: ['type', 'selector'],
  assertText: ['type', 'selector', 'contains'], readText: ['type', 'selector', 'as'],
  readAttribute: ['type', 'selector', 'attribute', 'as'],
  readList: ['type', 'selector', 'as', 'limit', 'fields'], navigate: ['type', 'path'],
};
const SELECTOR_STEPS = new Set(Object.keys(STEP_KEYS).filter((type) => type !== 'navigate'));
const TEMPLATE_FIELDS = ['value', 'contains', 'path'];
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function exactOrigin(value) {
  if (typeof value !== 'string' || value.includes('*')) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value &&
      (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(url.hostname) ||
        /^\[[0-9a-f:.]+\]$/.test(url.hostname));
  } catch {
    return false;
  }
}

function validateInputSchema(schema, path) {
  hasOnly(schema, ['type', 'properties', 'required'], path);
  if (!isObject(schema)) return new Set();
  if (schema.type !== 'object') at(`${path}.type`, 'must equal object');
  if (!isObject(schema.properties)) {
    at(`${path}.properties`, 'must be an object');
    return new Set();
  }
  const names = new Set(Object.keys(schema.properties));
  for (const [name, property] of Object.entries(schema.properties)) {
    const propertyPath = `${path}.properties.${name}`;
    hasOnly(property, ['type', 'description', 'format', 'enum'], propertyPath);
    if (!isObject(property)) continue;
    if (!INPUT_TYPES.has(property.type)) at(`${propertyPath}.type`, 'must be string, number, integer or boolean');
    if (property.description !== undefined) string(property.description, `${propertyPath}.description`, { max: 500 });
    if (property.format !== undefined) string(property.format, `${propertyPath}.format`, { max: 64 });
    if (property.enum !== undefined) {
      for (const [index, item] of array(property.enum, `${propertyPath}.enum`, { min: 1, max: 50 }).entries()) {
        string(item, `${propertyPath}.enum.${index}`);
      }
    }
  }
  for (const [index, name] of array(schema.required ?? [], `${path}.required`).entries()) {
    string(name, `${path}.required.${index}`);
    if (!names.has(name)) at(`${path}.required.${index}`, `references undeclared property ${JSON.stringify(name)}`);
  }
  return names;
}

function validateStep(step, path, declared) {
  if (!isObject(step) || typeof step.type !== 'string' || !STEP_KEYS[step.type]) {
    return at(`${path}.type`, 'must be a supported declarative step');
  }
  hasOnly(step, STEP_KEYS[step.type], path);
  if (SELECTOR_STEPS.has(step.type)) {
    string(step.selector, `${path}.selector`, { min: 1, max: 500 });
    if (typeof step.selector === 'string' && step.selector.includes('{{')) {
      at(`${path}.selector`, 'must not interpolate tool input');
    }
  }
  for (const field of TEMPLATE_FIELDS) {
    if (step[field] === undefined) continue;
    string(step[field], `${path}.${field}`, { min: field === 'path' ? 1 : 0, max: field === 'path' ? 500 : 2000 });
    if (typeof step[field] === 'string') {
      for (const match of step[field].matchAll(PLACEHOLDER)) {
        if (!declared.has(match[1])) at(`${path}.${field}`, `references undeclared placeholder {{${match[1]}}}`);
      }
    }
  }
  if (step.type === 'navigate' && (typeof step.path !== 'string' || !step.path.startsWith('/') || step.path.startsWith('//'))) {
    at(`${path}.path`, 'must be a same-origin path beginning with one slash');
  }
  if (['readText', 'readAttribute', 'readList'].includes(step.type)) string(step.as, `${path}.as`, { min: 1, max: 64 });
  if (step.type === 'readAttribute') string(step.attribute, `${path}.attribute`, { min: 1, max: 64 });
  if (step.type === 'waitFor') {
    if (step.state !== undefined && !['present', 'absent'].includes(step.state)) at(`${path}.state`, 'must be present or absent');
    if (step.timeoutMs !== undefined && (!Number.isInteger(step.timeoutMs) || step.timeoutMs < 0 || step.timeoutMs > 30000)) {
      at(`${path}.timeoutMs`, 'must be an integer from 0 to 30000');
    }
  }
  if (step.type === 'readList') {
    if (step.limit !== undefined && (!Number.isInteger(step.limit) || step.limit < 1 || step.limit > 100)) {
      at(`${path}.limit`, 'must be an integer from 1 to 100');
    }
    if (step.fields !== undefined) {
      if (!isObject(step.fields)) at(`${path}.fields`, 'must be an object');
      else for (const [name, field] of Object.entries(step.fields)) {
        const fieldPath = `${path}.fields.${name}`;
        hasOnly(field, ['selector', 'attribute'], fieldPath);
        if (!isObject(field)) continue;
        if (field.selector !== undefined) string(field.selector, `${fieldPath}.selector`, { min: 1, max: 500 });
        if (field.attribute !== undefined) string(field.attribute, `${fieldPath}.attribute`, { min: 1, max: 64 });
        if (field.selector === undefined && field.attribute === undefined) at(fieldPath, 'must declare selector or attribute');
      }
    }
  }
}

function validateAdapter(adapter, filename) {
  const path = `adapters/${filename}`;
  hasOnly(adapter, TOP_KEYS, path);
  if (!isObject(adapter)) return;
  string(adapter.id, `${path}.id`, { min: 1, max: 64, pattern: /^[a-z][a-z0-9-]*$/ });
  if (`${adapter.id}.json` !== filename) at(`${path}.id`, 'must match the filename');
  string(adapter.name, `${path}.name`, { min: 1, max: 120 });
  string(adapter.version, `${path}.version`, { pattern: /^\d+\.\d+\.\d+$/ });
  if (adapter.description !== undefined) string(adapter.description, `${path}.description`, { max: 1000 });
  if (adapter.category !== undefined && !CATEGORIES.has(adapter.category)) at(`${path}.category`, 'is not supported');
  if (adapter.author !== undefined) string(adapter.author, `${path}.author`, { max: 120 });
  if (adapter.homepage !== undefined) string(adapter.homepage, `${path}.homepage`, { max: 300 });
  if (adapter.verifiedAt !== undefined) string(adapter.verifiedAt, `${path}.verifiedAt`, { pattern: /^\d{4}-\d{2}-\d{2}$/ });
  for (const [index, origin] of array(adapter.origins, `${path}.origins`, { min: 1, max: 4 }).entries()) {
    if (!exactOrigin(origin)) at(`${path}.origins.${index}`, 'must be a canonical exact http(s) origin');
  }
  const names = new Set();
  for (const [index, tool] of array(adapter.tools, `${path}.tools`, { min: 1, max: 50 }).entries()) {
    const toolPath = `${path}.tools.${index}`;
    hasOnly(tool, TOOL_KEYS, toolPath);
    if (!isObject(tool)) continue;
    string(tool.name, `${toolPath}.name`, { min: 1, max: 64, pattern: /^[a-z][a-z0-9_]*$/ });
    if (names.has(tool.name)) at(`${toolPath}.name`, 'duplicates another tool name');
    names.add(tool.name);
    if (tool.title !== undefined) string(tool.title, `${toolPath}.title`, { max: 120 });
    string(tool.description, `${toolPath}.description`, { min: 1, max: 1000 });
    if (!CAPABILITIES.has(tool.capability)) at(`${toolPath}.capability`, 'is not supported');
    const declared = validateInputSchema(tool.inputSchema, `${toolPath}.inputSchema`);
    if (tool.probeSelectors !== undefined) for (const [probeIndex, selector] of array(tool.probeSelectors, `${toolPath}.probeSelectors`, { max: 10 }).entries()) {
      string(selector, `${toolPath}.probeSelectors.${probeIndex}`, { min: 1, max: 500 });
    }
    const steps = array(tool.steps, `${toolPath}.steps`, { min: 1, max: 50 });
    steps.forEach((step, stepIndex) => validateStep(step, `${toolPath}.steps.${stepIndex}`, declared));
    if (tool.capability === 'READ') {
      const transition = steps.find((step) => step?.type === 'submit' || step?.type === 'navigate');
      if (transition) at(`${toolPath}.capability`, `READ cannot use ${transition.type}`);
    }
  }
}

async function main() {
  let registry;
  try {
    registry = JSON.parse(await readFile(resolve(root, 'registry.json'), 'utf8'));
  } catch (error) {
    console.error(`registry.json: ${error.message}`);
    process.exit(1);
  }
  hasOnly(registry, ['schemaVersion', 'official', 'verified'], 'registry.json');
  if (registry.schemaVersion !== 1) at('registry.json.schemaVersion', 'must equal 1');
  const official = new Set(array(registry.official, 'registry.json.official'));
  const verified = isObject(registry.verified) ? registry.verified : {};
  if (!isObject(registry.verified)) at('registry.json.verified', 'must be an object');

  const adapterDir = resolve(root, 'adapters');
  const files = (await readdir(adapterDir)).filter((file) => file.endsWith('.json')).sort();
  const adapters = [];
  for (const file of files) {
    try {
      const adapter = JSON.parse(await readFile(resolve(adapterDir, file), 'utf8'));
      validateAdapter(adapter, file);
      adapters.push(adapter);
    } catch (error) {
      at(`adapters/${file}`, `is not valid JSON: ${error.message}`);
    }
  }
  const ids = new Set(adapters.map((adapter) => adapter.id));
  for (const id of official) if (!ids.has(id)) at('registry.json.official', `references missing adapter ${id}`);
  for (const [id, version] of Object.entries(verified)) {
    const adapter = adapters.find((candidate) => candidate.id === id);
    if (!adapter) at('registry.json.verified', `references missing adapter ${id}`);
    else if (adapter.version !== version) at(`registry.json.verified.${id}`, `must match current version ${adapter.version}`);
  }

  const catalog = {
    schemaVersion: 1,
    adapters: adapters.map((adapter) => ({
      status: official.has(adapter.id) ? 'official' : 'community',
      verified: verified[adapter.id] === adapter.version,
      source: `adapters/${adapter.id}.json`,
      adapter,
    })),
  };
  const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
  const catalogPath = resolve(root, 'catalog.json');
  if (shouldWrite && errors.length === 0) await writeFile(catalogPath, serialized);
  if (shouldCheck) {
    let current = '';
    try { current = await readFile(catalogPath, 'utf8'); } catch { /* reported below */ }
    if (current !== serialized) at('catalog.json', 'is stale; run npm run build');
  }

  if (errors.length > 0) {
    console.error(errors.map((error) => `✗ ${error}`).join('\n'));
    process.exit(1);
  }
  console.log(`✓ ${adapters.length} adapters validated; catalog.json is current`);
}

await main();
