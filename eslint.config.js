import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src/lib/wasm/pkg', 'src/lib/wasm/ocr/pkg', 'src-rust/pkg'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_+', varsIgnorePattern: '^_+' }],
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'prefer-const': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='URL'] > TemplateLiteral:first-child[expressions.length>0]",
          message: 'Dynamic new URL() with template literal and import.meta.url causes Vite to scan the entire repo root. Use fetch() with absolute paths instead.'
        }
      ]
    },
  }
);
