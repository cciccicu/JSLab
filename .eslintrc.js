module.exports = {
  root: true,
  env: {
    es6: true
  },
  overrides: [
    {
      files: ['**/*.ux'],
      extends: ['plugin:ux/base'],
      processor: 'ux/.ux'
    },
    {
      files: ['**/*.js'],
      parser: 'babel-eslint',
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module'
      }
    }
  ]
};
