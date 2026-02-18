import terser from '@rollup/plugin-terser';

const terserOptions = {
  compress: { drop_console: true },
  format: { comments: false },
};

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/smart-gallery.esm.min.js',
      format: 'esm',
      plugins: [terser(terserOptions)],
    },
    {
      file: 'dist/smart-gallery.cjs.min.js',
      format: 'cjs',
      exports: 'auto',
      plugins: [terser(terserOptions)],
    },
    {
      file: 'dist/smart-gallery.min.js',
      format: 'umd',
      name: 'SmartGallery',
      plugins: [terser(terserOptions)],
    },
  ],
};
