import terser from '@rollup/plugin-terser';

const terserOptions = {
  compress: { drop_console: true },
  format: { comments: false },
};

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/smart-gallery.esm.js',
      format: 'esm',
      plugins: [terser(terserOptions)],
    },
    {
      file: 'dist/smart-gallery.cjs',
      format: 'cjs',
      exports: 'auto',
      plugins: [terser(terserOptions)],
    },
    {
      file: 'dist/smart-gallery.umd.js',
      format: 'umd',
      name: 'SmartGallery',
      plugins: [terser(terserOptions)],
    },
  ],
};
