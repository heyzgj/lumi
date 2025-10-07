import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/content.js',
  output: {
    file: 'content.js',
    format: 'iife',  // ⚠️ Manifest V3: content scripts 必须是 IIFE
    name: 'LumiContent',
    sourcemap: true
  },
  plugins: [resolve()]
};
