import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const pagesOutputDir = join(process.cwd(), 'dist', 'bella-mujer-mvp', 'browser');
const indexPath = join(pagesOutputDir, 'index.html');
const notFoundPath = join(pagesOutputDir, '404.html');
const noJekyllPath = join(pagesOutputDir, '.nojekyll');

await copyFile(indexPath, notFoundPath);
await writeFile(noJekyllPath, '');
