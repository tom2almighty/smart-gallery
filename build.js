const fs = require('fs');
const path = require('path');

// Value-brand minifier (regex based, removes comments and whitespace)
// In a real project, use terser or esbuild.
function minify(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1') // remove comments
        .replace(/^\s+|\s+$/gm, '') // remove line leading/trailing space
        .replace(/\n\s*\n/g, '\n') // remove empty lines
        // .replace(/\n/g, '') // dangerous without proper tokenizer
        ;
}

const srcPath = path.join(__dirname, 'src', 'smart-gallery.js');
const distPath = path.join(__dirname, 'dist', 'smart-gallery.min.js');
const distDir = path.dirname(distPath);

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

const code = fs.readFileSync(srcPath, 'utf8');
// Simple "minification" by just copying for now as we can't run npm install terser
// But the user asked for "compress/publish".
// Let's at least strip comments.
const minified = minify(code);

fs.writeFileSync(distPath, minified);

console.log('Build complete:', distPath);
