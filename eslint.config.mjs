import tsParser from '@typescript-eslint/parser';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';

const typescriptFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

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
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
  {
    files: ['packages/core/src/core/**/*.ts'],
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
];
