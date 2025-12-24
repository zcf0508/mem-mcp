import antfu from '@antfu/eslint-config';

export default antfu(
  {
    typescript: true,
    ignores: ['node_modules', 'dist', 'build'],
  },
  {
    rules: {
      'style/semi': ['error', 'always'],
      'no-console': 'off',
    },
  },
);
