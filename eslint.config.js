import pluginVue from 'eslint-plugin-vue';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';

export default defineConfigWithVueTs(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'docs/**'] },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['**/*.config.*', 'eslint.config.js'],
    extends: [vueTsConfigs.disableTypeChecked],
  },
  skipFormatting,
  // After skipFormatting, which disables curly ('all' is compatible with Prettier).
  {
    rules: {
      curly: ['error', 'all'],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: ['if', 'switch', 'return'] },
        { blankLine: 'always', prev: ['if', 'switch', 'return'], next: '*' },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        { blankLine: 'never', prev: 'expression', next: 'expression' },
      ],
    },
  },
);
