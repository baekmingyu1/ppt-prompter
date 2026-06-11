import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const prompterRoot = path.join(distRoot, 'prompter');
const nestedPrompterRoot = path.join(prompterRoot, 'prompter');

const backendUrl = process.env.PROMPTER_BACKEND_URL || '';
const socketPath = process.env.PROMPTER_SOCKET_PATH || '/prompter/socket.io';

async function copyPublic(source, target) {
  await fs.mkdir(target, {
    recursive: true
  });

  await fs.cp(source, target, {
    recursive: true
  });
}

async function writeConfig(target) {
  const config = `window.PROMPTER_CONFIG = ${JSON.stringify({
    backendUrl,
    socketPath
  }, null, 2)};\n`;

  await fs.writeFile(path.join(target, 'config.js'), config, 'utf-8');
}

async function writeRedirects() {
  const redirects = [
    '/prompter/control /prompter/ 302',
    '/prompter/control/ /prompter/ 302',
    '/prompter/control/edit /prompter/edit.html 200'
  ].join('\n');

  await fs.writeFile(path.join(distRoot, '_redirects'), `${redirects}\n`, 'utf-8');
}

await fs.rm(distRoot, {
  recursive: true,
  force: true
});

async function buildSite(targetRoot) {
  await copyPublic(path.join(projectRoot, 'apps', 'control-ui', 'public'), targetRoot);
  await copyPublic(path.join(projectRoot, 'apps', 'audience-ui', 'public'), path.join(targetRoot, 'audience'));
  await copyPublic(path.join(projectRoot, 'apps', 'singer-ui', 'public'), path.join(targetRoot, 'singer'));

  await writeConfig(targetRoot);
  await writeConfig(path.join(targetRoot, 'audience'));
  await writeConfig(path.join(targetRoot, 'singer'));
}

await buildSite(distRoot);
await buildSite(prompterRoot);
await buildSite(nestedPrompterRoot);
await writeRedirects();

console.log(`Built Pages output: ${path.relative(projectRoot, distRoot)}`);
