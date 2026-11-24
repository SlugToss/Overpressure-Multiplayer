import * as esbuild from 'esbuild';
import fs from 'fs';
await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/bundle.js', target: 'es2020', logLevel: 'warning' });
let js = fs.readFileSync('dist/bundle.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync('src/template.html', 'utf8').replace('/*BUNDLE*/', () => js);
fs.writeFileSync('dist/index.html', html);
console.log('built', (html.length / 1024).toFixed(0) + ' KB');
fs.cpSync('assets', 'dist/assets', { recursive: true });
// single-file build with embedded models (for hosts that only serve .html)
const guns = {};
for (const f of fs.readdirSync('assets/guns')) guns[f] = fs.readFileSync('assets/guns/' + f).toString('base64');
const kit = fs.readFileSync('assets/factory_kit.glb').toString('base64');
const city = fs.readFileSync('assets/city_kit.glb').toString('base64');
const chars = {}; for (const f of ['guardsman.glb', 'automaton.glb']) chars[f] = fs.readFileSync('assets/' + f).toString('base64');
fs.writeFileSync('dist/overpressure-single.html', html.replace('<script>', '<script>window.__GUNS=' + JSON.stringify(guns) + ';window.__KIT="' + kit + '";window.__CITY="' + city + '";window.__CHARS=' + JSON.stringify(chars) + ';</script><script>'));
console.log('single', (fs.statSync('dist/overpressure-single.html').size / 1048576).toFixed(1) + ' MB');

// multiplayer build: same game with the lobby switched on, served by server/server.js
const single = fs.readFileSync('dist/overpressure-single.html', 'utf8');
fs.mkdirSync('server/public', { recursive: true });
fs.writeFileSync('server/public/index.html', single.replace('<script>', '<script>window.__MP=1;</script><script>'));
console.log('multiplayer page → server/public/index.html');
