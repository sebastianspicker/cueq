import tsParser from '@typescript-eslint/parser';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import nextPlugin from '@next/eslint-plugin-next';
import { fileURLToPath } from 'node:url';

const typescriptFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];
const webRootDirectory = fileURLToPath(new URL('./apps/web/', import.meta.url));

const productionSourceFiles = [
  'apps/api/src/**/*.{ts,mts,cts}',
  'apps/web/src/**/*.{ts,tsx,mts,cts}',
  'packages/domain/src/**/*.{ts,mts,cts}',
  'packages/database/src/**/*.{ts,mts,cts}',
  'packages/policy/src/**/*.{ts,mts,cts}',
  'packages/contracts/src/**/*.{ts,mts,cts}',
];

const nonProductionSourceFiles = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.mts',
  '**/*.test.cts',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.spec.mts',
  '**/*.spec.cts',
  '**/__tests__/**',
  '**/*.typecheck.ts',
];

const cueqPlugin = {
  rules: {
    'no-manual-schema-types': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Prevent manual schema shape types in contract schema files; prefer zod schemas + z.infer.',
        },
        schema: [],
      },
      create(context) {
        return {
          TSInterfaceDeclaration(node) {
            context.report({
              node,
              message:
                'Do not declare interfaces in schema files. Define a zod schema and export z.infer type instead.',
            });
          },
          TSTypeAliasDeclaration(node) {
            const annotation = node.typeAnnotation;
            const manualTypes = new Set([
              'TSTypeLiteral',
              'TSUnionType',
              'TSIntersectionType',
              'TSMappedType',
              'TSTupleType',
            ]);
            if (manualTypes.has(annotation.type)) {
              context.report({
                node,
                message:
                  'Manual schema shape type aliases are disallowed in schema files. Prefer zod schema + z.infer.',
              });
            }
          },
        };
      },
    },
  },
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.d.ts',
      'contracts/openapi/openapi.generated.json',
    ],
  },
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    // Next 15 inspects the root flat config during `next build`; keeping one
    // disabled rule here makes the plugin visible while web rules stay scoped.
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    files: typescriptFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsEslintPlugin,
    },
    rules: {
      'no-console': ['warn', { allow: ['log', 'warn', 'error'] }],
    },
  },
  {
    files: ['apps/web/src/**/*.{js,jsx,ts,tsx}'],
    settings: {
      next: {
        rootDir: webRootDirectory,
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    files: productionSourceFiles,
    ignores: nonProductionSourceFiles,
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      complexity: ['error', 15],
    },
  },
  {
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@cueq/database',
              message: 'Core domain logic must not import persistence adapters.',
            },
            {
              name: '@prisma/client',
              message: 'Core domain logic must remain framework-agnostic and pure.',
            },
            { name: 'next', message: 'Core domain logic must not import UI framework code.' },
            { name: 'react', message: 'Core domain logic must not import UI framework code.' },
            { name: 'express', message: 'Core domain logic must not import HTTP framework code.' },
            { name: 'axios', message: 'Core domain logic must not import HTTP client code.' },
            {
              name: 'node:http',
              message: 'Core domain logic must not depend on transport adapters.',
            },
            {
              name: 'node:https',
              message: 'Core domain logic must not depend on transport adapters.',
            },
          ],
          patterns: [
            {
              group: ['@nestjs/*'],
              message: 'Core domain logic must not import NestJS.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/contracts/src/schemas/**/*.ts'],
    plugins: {
      cueq: cueqPlugin,
    },
    rules: {
      'cueq/no-manual-schema-types': 'error',
    },
  },
];
