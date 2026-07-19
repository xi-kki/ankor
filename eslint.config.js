const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');

module.exports = [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        MediaRecorder: 'readonly',
        MediaStream: 'readonly',
        SpeechRecognition: 'readonly',
        webkitSpeechRecognition: 'readonly',
        AbortController: 'readonly',
        indexedDB: 'readonly',
        // Service Worker globals
        self: 'readonly',
        caches: 'readonly',
        Response: 'readonly',
        // IndexedDB globals
        IDBKeyRange: 'readonly',
        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-debugger': 'error',
      eqeqeq: ['error', 'always'],
      curly: 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-empty': 'warn',
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'build/', '*.min.js'],
  },
];
