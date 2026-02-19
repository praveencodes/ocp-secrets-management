#!/usr/bin/env npx ts-node

/**
 * Generates TypeScript interfaces from CRD YAML files.
 *
 * This script reads CRD YAML files from the crds/ directory and generates
 * TypeScript interfaces in src/generated/crds/.
 *
 * Usage:
 *   npx ts-node scripts/generate-types.ts
 *   yarn generate-types
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Types
interface OpenAPISchema {
  type?: string;
  description?: string;
  properties?: Record<string, OpenAPISchema>;
  additionalProperties?: OpenAPISchema | boolean;
  items?: OpenAPISchema;
  required?: string[];
  enum?: string[];
  default?: unknown;
  format?: string;
  'x-kubernetes-preserve-unknown-fields'?: boolean;
  'x-kubernetes-int-or-string'?: boolean;
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
}

interface CRDVersion {
  name: string;
  served: boolean;
  storage: boolean;
  schema?: {
    openAPIV3Schema?: OpenAPISchema;
  };
}

interface CRD {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
  };
  spec: {
    group: string;
    names: {
      kind: string;
      plural: string;
      singular?: string;
    };
    scope: 'Namespaced' | 'Cluster';
    versions: CRDVersion[];
  };
}

interface ManifestCRD {
  kind: string;
  group: string;
  version: string;
  localPath: string;
}

interface ManifestSource {
  name: string;
  repo: string;
  ref: string;
  crds: ManifestCRD[];
}

interface Manifest {
  fetchedAt: string;
  sources: ManifestSource[];
}

// Paths
const ROOT_DIR = path.resolve(__dirname, '..');
const CRDS_DIR = path.join(ROOT_DIR, 'crds');
const OUTPUT_DIR = path.join(ROOT_DIR, 'src', 'generated', 'crds');
const MANIFEST_PATH = path.join(CRDS_DIR, 'manifest.json');

/** Replace irregular whitespace (e.g. non-breaking space) with normal space for ESLint no-irregular-whitespace */
function sanitizeDescription(text: string): string {
  return text
    .replace(/[\u00A0\uFEFF\u200B-\u200D\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts an OpenAPI type to TypeScript type
 */
function openAPITypeToTS(schema: OpenAPISchema, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (!schema || !schema.type) {
    // Handle x-kubernetes-preserve-unknown-fields
    if (schema?.['x-kubernetes-preserve-unknown-fields']) {
      return 'Record<string, unknown>';
    }
    // Handle x-kubernetes-int-or-string
    if (schema?.['x-kubernetes-int-or-string']) {
      return 'string | number';
    }
    // Handle oneOf/anyOf
    if (schema?.oneOf || schema?.anyOf) {
      return 'unknown';
    }
    return 'unknown';
  }

  switch (schema.type) {
    case 'string':
      if (schema.enum && schema.enum.length > 0) {
        return schema.enum.map((e) => `'${e}'`).join(' | ');
      }
      return 'string';

    case 'integer':
    case 'number':
      return 'number';

    case 'boolean':
      return 'boolean';

    case 'array':
      if (schema.items) {
        const itemType = openAPITypeToTS(schema.items, indent);
        return `${itemType}[]`;
      }
      return 'unknown[]';

    case 'object':
      if (schema.properties) {
        const props = Object.entries(schema.properties)
          .map(([key, propSchema]) => {
            const optional = !schema.required?.includes(key) ? '?' : '';
            const propType = openAPITypeToTS(propSchema, indent + 1);
            const description = propSchema.description
              ? `${spaces}  /** ${sanitizeDescription(propSchema.description)} */\n`
              : '';
            // Escape property names with special characters
            const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
            return `${description}${spaces}  ${safeName}${optional}: ${propType};`;
          })
          .join('\n');
        return `{\n${props}\n${spaces}}`;
      }
      if (schema.additionalProperties) {
        if (typeof schema.additionalProperties === 'boolean') {
          return 'Record<string, unknown>';
        }
        const valueType = openAPITypeToTS(schema.additionalProperties, indent);
        return `Record<string, ${valueType}>`;
      }
      return 'Record<string, unknown>';

    default:
      return 'unknown';
  }
}

/**
 * Generates TypeScript interface from a CRD schema
 */
function generateInterface(crd: CRD): string {
  const kind = crd.spec.names.kind;
  const group = crd.spec.group;
  const scope = crd.spec.scope;

  // Find the storage version
  const storageVersion = crd.spec.versions.find((v) => v.storage);
  if (!storageVersion?.schema?.openAPIV3Schema) {
    console.warn(`  ⚠️  No schema found for ${kind}`);
    return '';
  }

  const schema = storageVersion.schema.openAPIV3Schema;
  const specSchema = schema.properties?.spec;
  const statusSchema = schema.properties?.status;

  let output = `/**
 * ${kind} - ${group}/${storageVersion.name}
 *
 * Scope: ${scope}
 * Auto-generated from CRD. Do not edit manually.
 */

import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

`;

  // Generate Spec: use type alias when result is not an object (e.g. Record<string, unknown>)
  if (specSchema) {
    const specType = openAPITypeToTS(specSchema);
    output += specType.startsWith('{')
      ? `export interface ${kind}Spec ${specType}\n\n`
      : `export type ${kind}Spec = ${specType};\n\n`;
  }

  // Generate Status: use type alias when result is not an object (e.g. Record<string, unknown>)
  if (statusSchema) {
    const statusType = openAPITypeToTS(statusSchema);
    output += statusType.startsWith('{')
      ? `export interface ${kind}Status ${statusType}\n\n`
      : `export type ${kind}Status = ${statusType};\n\n`;
  }

  // Generate main interface
  output += `export interface ${kind} extends K8sResourceCommon {\n`;
  output += `  apiVersion: '${group}/${storageVersion.name}';\n`;
  output += `  kind: '${kind}';\n`;
  if (specSchema) {
    output += `  spec?: ${kind}Spec;\n`;
  }
  if (statusSchema) {
    output += `  status?: ${kind}Status;\n`;
  }
  output += `}\n\n`;

  // Generate model reference constant
  output += `export const ${kind}Model = {\n`;
  output += `  apiVersion: '${storageVersion.name}',\n`;
  output += `  apiGroup: '${group}',\n`;
  output += `  kind: '${kind}',\n`;
  output += `  plural: '${crd.spec.names.plural}',\n`;
  output += `  namespaced: ${scope === 'Namespaced'},\n`;
  output += `} as const;\n`;

  return output;
}

/**
 * Generates an index file that exports all types
 */
function generateIndex(sources: ManifestSource[]): string {
  let output = `/**
 * Generated CRD TypeScript interfaces
 *
 * Auto-generated. Do not edit manually.
 * Run \`yarn generate-types\` to regenerate.
 */

`;

  for (const source of sources) {
    output += `// ${source.name}\n`;
    for (const crd of source.crds) {
      const fileName = `${crd.kind}`;
      output += `export * from './${source.name}/${fileName}';\n`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Generates model references for use with useK8sWatchResource
 */
function generateModels(sources: ManifestSource[]): string {
  let output = `/**
 * Kubernetes model references for use with useK8sWatchResource
 *
 * Auto-generated. Do not edit manually.
 */

import { K8sModel } from '@openshift-console/dynamic-plugin-sdk';

`;

  for (const source of sources) {
    output += `// ${source.name}\n`;
    for (const crd of source.crds) {
      output += `export { ${crd.kind}Model } from './${source.name}/${crd.kind}';\n`;
    }
    output += '\n';
  }

  // Generate a combined models object (use CRD spec.names.plural for correct plural form)
  output += `/**
 * All models by kind for convenience
 */
export const Models: Record<string, K8sModel> = {\n`;
  for (const source of sources) {
    for (const crd of source.crds) {
      const crdPath = path.join(ROOT_DIR, crd.localPath);
      let plural = `${crd.kind.toLowerCase()}s`;
      if (fs.existsSync(crdPath)) {
        try {
          const crdContent = fs.readFileSync(crdPath, 'utf-8');
          const crdObj = yaml.load(crdContent) as CRD;
          if (crdObj?.spec?.names?.plural) {
            plural = crdObj.spec.names.plural;
          }
        } catch {
          // fallback to default plural
        }
      }
      const label = crd.kind;
      // Use CRD spec.names.plural for correct plural form (avoids "Statuss" etc.); capitalize for display
      const labelPlural = plural.charAt(0).toUpperCase() + plural.slice(1);
      const abbr = label.replace(/[a-z]/g, '').slice(0, 2) || label.slice(0, 1).toUpperCase();
      output += `  ${crd.kind}: {\n`;
      output += `    abbr: '${abbr}',\n`;
      output += `    apiVersion: '${crd.version}',\n`;
      output += `    apiGroup: '${crd.group}',\n`;
      output += `    kind: '${crd.kind}',\n`;
      output += `    label: '${label}',\n`;
      output += `    labelPlural: '${labelPlural}',\n`;
      output += `    plural: '${plural}',\n`;
      output += `  },\n`;
    }
  }
  output += `};\n`;

  return output;
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
 * Main function
 */
async function main(): Promise<void> {
  console.log('🔄 Generating TypeScript interfaces from CRDs...\n');

  // Check for manifest
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('❌ Manifest not found. Run `yarn fetch-crds` first.');
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

  // Ensure output directory exists
  ensureDir(OUTPUT_DIR);

  // Process each source
  for (const source of manifest.sources) {
    const sourceOutputDir = path.join(OUTPUT_DIR, source.name);
    ensureDir(sourceOutputDir);

    console.log(`📦 Processing ${source.name}...`);

    for (const crdInfo of source.crds) {
      const crdPath = path.join(ROOT_DIR, crdInfo.localPath);

      if (!fs.existsSync(crdPath)) {
        console.warn(`  ⚠️  CRD file not found: ${crdInfo.localPath}`);
        continue;
      }

      try {
        const crdContent = fs.readFileSync(crdPath, 'utf-8');
        const crd = yaml.load(crdContent) as CRD;

        const tsContent = generateInterface(crd);
        if (tsContent) {
          const outputPath = path.join(sourceOutputDir, `${crdInfo.kind}.ts`);
          fs.writeFileSync(outputPath, tsContent);
          console.log(`  ✅ ${crdInfo.kind} -> ${path.relative(ROOT_DIR, outputPath)}`);
        }
      } catch (error) {
        console.error(`  ❌ Failed to process ${crdInfo.kind}: ${error}`);
      }
    }
  }

  // Generate index file
  const indexContent = generateIndex(manifest.sources);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.ts'), indexContent);
  console.log(`\n📄 Index file generated: src/generated/crds/index.ts`);

  // Generate models file
  const modelsContent = generateModels(manifest.sources);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'models.ts'), modelsContent);
  console.log(`📄 Models file generated: src/generated/crds/models.ts`);

  console.log('\n✨ Done! TypeScript interfaces generated successfully.\n');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
