#!/usr/bin/env node

/**
 * Guards the workspace package DAG and the dependency direction of the
 * reconstructed contracts, policy, domain, and web layers.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let activeRoot = DEFAULT_ROOT;
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/u;
const IMPORT_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/gu;
const PACKAGE_RULES = new Map([
  ['@cueq/contracts', new Set()],
  ['@cueq/policy', new Set()],
  ['@cueq/domain', new Set(['@cueq/policy'])],
  ['@cueq/web', new Set(['@cueq/contracts'])],
  ['@cueq/api', new Set(['@cueq/contracts', '@cueq/database', '@cueq/domain', '@cueq/policy'])],
]);
const SOURCE_RULES = [
  { packageName: '@cueq/contracts', directory: 'packages/contracts/src' },
  { packageName: '@cueq/policy', directory: 'packages/policy/src' },
  { packageName: '@cueq/domain', directory: 'packages/domain/src' },
  { packageName: '@cueq/web', directory: 'apps/web/src' },
  { packageName: '@cueq/api', directory: 'apps/api/src' },
];
const LEGACY_PACKAGE_NAMES = new Set(['@cueq/shared', '@cueq/core']);
const LEGACY_DIRECTORIES = [
  'packages/shared',
  'packages/core',
  'apps/api/src/phase2',
  'apps/web/src/lib',
];
const IGNORED_DIRECTORIES = new Set(['.next', '.turbo', 'coverage', 'dist', 'node_modules']);
const WORKFLOW_FOREIGN_MUTATION =
  /\btx\.(absence|booking|shift|shiftAssignment|person|timeAccount)\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(/gu;
const FEATURE_PUBLIC_IMPORT =
  /import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\.\/([^/'"]+)\/public\.js['"]/gu;
const FORWARD_REF = /\bforwardRef\s*\(/u;

function relativePath(filePath) {
  return path.relative(activeRoot, filePath).split(path.sep).join('/');
}

async function collectFiles(directory, predicate) {
  const files = [];

  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
        await visit(path.join(current, entry.name));
      } else if (entry.isFile() && predicate(entry.name)) {
        files.push(path.join(current, entry.name));
      }
    }
  }

  if (existsSync(directory)) await visit(directory);
  return files;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function workspacePackages() {
  const manifests = await Promise.all(
    ['apps', 'packages'].flatMap(async (parent) => {
      const parentPath = path.join(activeRoot, parent);
      const entries = await readdir(parentPath, { withFileTypes: true });
      return Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const manifestPath = path.join(parentPath, entry.name, 'package.json');
            if (!existsSync(manifestPath)) return null;
            const manifest = await readJson(manifestPath);
            return { manifestPath, manifest };
          }),
      );
    }),
  );
  return manifests.flat().filter(Boolean);
}

function workspaceDependencies(manifest) {
  const dependencies = new Set();
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (name.startsWith('@cueq/')) dependencies.add(name);
      if (name.startsWith('@cueq/') && !String(version).startsWith('workspace:')) {
        throw new Error(`${manifest.name} declares ${name} without a workspace: protocol range.`);
      }
    }
  }
  return dependencies;
}

function findCycles(graph) {
  const cycles = [];
  const active = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(node) {
    if (visiting.has(node)) {
      cycles.push([...active.slice(active.indexOf(node)), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    active.push(node);
    for (const dependency of graph.get(node) ?? []) visit(dependency);
    active.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) visit(node);
  return cycles;
}

function importedModules(source) {
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1]);
}

function isLegacyPackage(specifier) {
  return [...LEGACY_PACKAGE_NAMES].some(
    (packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`),
  );
}

async function checkLegacyPackageReferences(errors) {
  const sourceRoots = ['apps', 'packages'].map((directory) => path.join(activeRoot, directory));
  for (const sourceRoot of sourceRoots) {
    for (const filePath of await collectFiles(sourceRoot, (name) => SOURCE_EXTENSION.test(name))) {
      for (const specifier of importedModules(await readFile(filePath, 'utf8'))) {
        if (isLegacyPackage(specifier)) {
          errors.push(`${relativePath(filePath)} imports legacy package ${specifier}.`);
        }
      }
    }
  }
}

async function checkSourceRules(errors, manifests) {
  const manifestByName = new Map(manifests.map(({ manifest }) => [manifest.name, manifest]));

  for (const { packageName, directory } of SOURCE_RULES) {
    const absoluteDirectory = path.join(activeRoot, directory);
    const files = await collectFiles(absoluteDirectory, (name) => SOURCE_EXTENSION.test(name));
    const allowed = PACKAGE_RULES.get(packageName);
    const declared = workspaceDependencies(manifestByName.get(packageName));

    for (const filePath of files) {
      const source = await readFile(filePath, 'utf8');
      for (const specifier of importedModules(source)) {
        if (specifier.startsWith('@cueq/') && !allowed.has(specifier)) {
          errors.push(
            `${relativePath(filePath)} imports ${specifier}, which ${packageName} may not depend on.`,
          );
        }
        if (specifier.startsWith('@cueq/') && !declared.has(specifier)) {
          errors.push(
            `${relativePath(filePath)} imports undeclared workspace package ${specifier}.`,
          );
        }
      }

      if (directory === 'apps/api/src') continue;
      const sourceDirectory = path.dirname(filePath);
      for (const specifier of importedModules(source).filter((value) => value.startsWith('.'))) {
        const resolved = path.resolve(sourceDirectory, specifier);
        if (
          directory === 'apps/web/src' &&
          resolved.startsWith(path.join(activeRoot, 'apps/web/src/lib'))
        ) {
          errors.push(`${relativePath(filePath)} imports the retired apps/web/src/lib boundary.`);
        }
      }
    }
  }

  const apiSource = path.join(activeRoot, 'apps/api/src');
  for (const filePath of await collectFiles(apiSource, (name) => SOURCE_EXTENSION.test(name))) {
    const sourceDirectory = path.dirname(filePath);
    for (const specifier of importedModules(await readFile(filePath, 'utf8')).filter((value) =>
      value.startsWith('.'),
    )) {
      const resolved = path.resolve(sourceDirectory, specifier);
      if (resolved.startsWith(path.join(activeRoot, 'apps/api/src/phase2'))) {
        errors.push(`${relativePath(filePath)} imports the retired apps/api/src/phase2 boundary.`);
      }
    }
  }

  const allowedApiEdges = new Map([
    ['application', new Set(['application', 'persistence'])],
    ['platform', new Set(['application', 'persistence', 'platform'])],
    ['persistence', new Set(['persistence'])],
    ['modules', new Set(['application', 'platform', 'persistence', 'modules'])],
  ]);
  for (const filePath of await collectFiles(apiSource, (name) => SOURCE_EXTENSION.test(name))) {
    const sourceDirectory = path.dirname(filePath);
    const sourceParts = path.relative(apiSource, filePath).split(path.sep);
    const sourceLayer = sourceParts[0];
    const sourceFeature = sourceLayer === 'modules' ? sourceParts[1] : null;
    const source = await readFile(filePath, 'utf8');

    if (sourceLayer === 'modules' && sourceFeature === 'workflows') {
      for (const match of source.matchAll(WORKFLOW_FOREIGN_MUTATION)) {
        errors.push(
          `${relativePath(filePath)} may not directly mutate ${match[1]} via tx.${match[1]}.${match[2]}; use the owning feature workflow-effects port.`,
        );
      }
    }

    for (const specifier of importedModules(source).filter((value) => value.startsWith('.'))) {
      const resolved = path.resolve(sourceDirectory, specifier);
      const targetParts = path.relative(apiSource, resolved).split(path.sep);
      if (targetParts[0] === '..' || path.isAbsolute(targetParts[0])) continue;
      const targetLayer = targetParts[0];

      if (targetLayer === 'modules') {
        const targetFeature = targetParts[1];
        const targetsPublicSurface =
          targetParts.length === 3 &&
          (targetParts[2] === 'public.js' || targetParts[2] === 'workflow-runtime.public.js');
        if (sourceFeature === targetFeature) continue;
        if (sourceLayer === 'modules' && targetsPublicSurface) continue;
        if (
          (sourceLayer === 'app.module.ts' ||
            sourceLayer === 'main.ts' ||
            sourceLayer === 'commands') &&
          targetsPublicSurface
        )
          continue;
        errors.push(
          `${relativePath(filePath)} may not import ${targetFeature} feature internals via ${specifier}.`,
        );
        continue;
      }

      const allowedTargets = allowedApiEdges.get(sourceLayer);
      if (allowedTargets && !allowedTargets.has(targetLayer)) {
        errors.push(
          `${relativePath(filePath)} violates the API ${sourceLayer} -> ${targetLayer} layer edge via ${specifier}.`,
        );
      }
    }
  }
}

async function checkFeatureModuleGraph(errors) {
  const modulesRoot = path.join(activeRoot, 'apps/api/src/modules');
  const moduleFiles = await collectFiles(modulesRoot, (name) => name.endsWith('.module.ts'));
  const graph = new Map();

  for (const filePath of moduleFiles) {
    const relative = path.relative(modulesRoot, filePath).split(path.sep);
    const feature = relative[0];
    const source = await readFile(filePath, 'utf8');
    const dependencies = graph.get(feature) ?? new Set();
    graph.set(feature, dependencies);

    if (FORWARD_REF.test(source)) {
      errors.push(
        `${relativePath(filePath)} uses forwardRef(); feature module dependencies must be acyclic.`,
      );
    }

    const importedFeatureModules = new Map();
    for (const match of source.matchAll(FEATURE_PUBLIC_IMPORT)) {
      const importedFeature = match[2];
      for (const binding of match[1].split(',')) {
        const [exportedName, alias] = binding.trim().split(/\s+as\s+/u);
        if (exportedName) importedFeatureModules.set(alias ?? exportedName, importedFeature);
      }
    }

    const importsMetadata = source.match(/\bimports\s*:\s*\[([\s\S]*?)\]/u)?.[1] ?? '';
    for (const importedModule of importsMetadata.matchAll(/\b[A-Za-z_$][\w$]*\b/gu)) {
      const importedFeature = importedFeatureModules.get(importedModule[0]);
      if (importedFeature && importedFeature !== feature) dependencies.add(importedFeature);
    }
  }

  for (const cycle of findCycles(graph)) {
    errors.push(`Feature module cycle: ${cycle.join(' -> ')}.`);
  }
}

export async function checkArchitecture(root = DEFAULT_ROOT) {
  const previousRoot = activeRoot;
  activeRoot = root;
  const errors = [];
  try {
    for (const directory of LEGACY_DIRECTORIES) {
      const absoluteDirectory = path.join(activeRoot, directory);
      if (existsSync(absoluteDirectory) && (await stat(absoluteDirectory)).isDirectory()) {
        errors.push(`Retired directory remains: ${directory}.`);
      }
    }

    const manifests = await workspacePackages();
    const graph = new Map();
    for (const { manifestPath, manifest } of manifests) {
      if (!manifest.name?.startsWith('@cueq/')) {
        errors.push(`${relativePath(manifestPath)} must declare an @cueq/* name.`);
        continue;
      }
      try {
        graph.set(manifest.name, workspaceDependencies(manifest));
      } catch (error) {
        errors.push(error.message);
      }
    }

    for (const [packageName, dependencies] of graph) {
      for (const dependency of dependencies) {
        if (LEGACY_PACKAGE_NAMES.has(dependency)) {
          errors.push(`${packageName} depends on legacy package ${dependency}.`);
        } else if (!graph.has(dependency)) {
          errors.push(`${packageName} depends on missing workspace package ${dependency}.`);
        }
      }
      const allowed = PACKAGE_RULES.get(packageName);
      if (allowed && [...dependencies].some((dependency) => !allowed.has(dependency))) {
        errors.push(
          `${packageName} violates its dependency boundary: ${[...dependencies].join(', ')}.`,
        );
      }
    }

    for (const cycle of findCycles(graph))
      errors.push(`Workspace dependency cycle: ${cycle.join(' -> ')}.`);
    await checkLegacyPackageReferences(errors);
    await checkSourceRules(errors, manifests);
    await checkFeatureModuleGraph(errors);

    const edgeCount = [...graph.values()].reduce(
      (count, dependencies) => count + dependencies.size,
      0,
    );
    return { errors, packageCount: graph.size, edgeCount };
  } finally {
    activeRoot = previousRoot;
  }
}

async function main() {
  const result = await checkArchitecture();
  if (result.errors.length > 0) {
    process.stderr.write(
      `Architecture check failed:\n${result.errors.map((error) => `- ${error}`).join('\n')}\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Architecture check passed: ${result.packageCount} workspace packages, ${result.edgeCount} workspace edges.\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
