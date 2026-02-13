#!/usr/bin/env npx ts-node

/**
 * Fetches CRD YAML files from upstream operator repositories.
 *
 * Usage:
 *   npx ts-node scripts/fetch-crds.ts
 *   yarn fetch-crds
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// Types
interface CRDConfig {
  file: string;
  kind: string;
  group: string;
  version: string;
}

interface SourceConfig {
  name: string;
  repo: string;
  ref: string;
  crds: CRDConfig[];
}

interface CRDSourcesConfig {
  sources: SourceConfig[];
}

// Paths
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'crd-sources.json');
const CRDS_DIR = path.join(ROOT_DIR, 'crds');

/**
 * Fetches content from a URL
 */
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            fetchUrl(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${url}`));
          return;
        }

        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          resolve(data);
        });
        response.on('error', reject);
      })
      .on('error', reject);
  });
}

/**
 * Builds the raw GitHub URL for a file
 */
function buildGitHubUrl(repo: string, ref: string, filePath: string): string {
  return `https://raw.githubusercontent.com/${repo}/${ref}/${filePath}`;
}

/**
 * Ensures a directory exists
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Fetches CRDs for a single source. Returns paths of successfully written CRD files.
 * Throws if any CRD fetch fails (fail-fast).
 */
async function fetchSourceCRDs(source: SourceConfig): Promise<string[]> {
  const sourceDir = path.join(CRDS_DIR, source.name);
  ensureDir(sourceDir);

  console.log(`\n📦 Fetching CRDs from ${source.repo} (ref: ${source.ref})`);

  const written: string[] = [];
  const errors: string[] = [];

  for (const crd of source.crds) {
    const url = buildGitHubUrl(source.repo, source.ref, crd.file);
    const outputFileName = `${crd.group}_${crd.kind.toLowerCase()}.yaml`;
    const outputPath = path.join(sourceDir, outputFileName);
    const relativePath = path.relative(ROOT_DIR, outputPath);

    try {
      console.log(`  ⏳ Fetching ${crd.kind}...`);
      const content = await fetchUrl(url);
      fs.writeFileSync(outputPath, content);
      written.push(relativePath);
      console.log(`  ✅ ${crd.kind} -> ${relativePath}`);
    } catch (error) {
      const msg = `${crd.kind}: ${error}`;
      errors.push(msg);
      console.error(`  ❌ Failed to fetch ${msg}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Failed to fetch CRDs: ${errors.join('; ')}`);
  }
  return written;
}

/**
 * Creates a manifest file listing all fetched CRDs (only those that were successfully written).
 */
function createManifest(config: CRDSourcesConfig, _writtenBySource: string[][]): void {
  const manifest = {
    fetchedAt: new Date().toISOString(),
    sources: config.sources.map((source) => ({
      name: source.name,
      repo: source.repo,
      ref: source.ref,
      crds: source.crds.map((crd) => ({
        kind: crd.kind,
        group: crd.group,
        version: crd.version,
        localPath: `crds/${source.name}/${crd.group}_${crd.kind.toLowerCase()}.yaml`,
      })),
    })),
  };

  const manifestPath = path.join(CRDS_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n📄 Manifest written to ${path.relative(ROOT_DIR, manifestPath)}`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('🔄 Fetching CRDs from upstream repositories...\n');

  // Load config
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌ Config file not found: ${CONFIG_PATH}`);
    process.exit(1);
  }

  const config: CRDSourcesConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  // Ensure base CRDs directory exists
  ensureDir(CRDS_DIR);

  // Fetch CRDs from each source (fail-fast on any error)
  const writtenBySource: string[][] = [];
  for (const source of config.sources) {
    const written = await fetchSourceCRDs(source);
    writtenBySource.push(written);
  }

  // Create manifest
  createManifest(config, writtenBySource);

  console.log('\n✨ Done! CRDs fetched successfully.\n');
  console.log('Next step: Run `yarn generate-types` to generate TypeScript interfaces.\n');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
