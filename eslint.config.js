import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.astro', 'data'] },
  ...tseslint.configs.recommended,
);
