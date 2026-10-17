#!/usr/bin/env node
// Finish the GitHub Pages build: dist/client/_shell.html -> index.html + 404.html.
// The SSR pass can hash the stylesheet differently from the client pass, so point
// the shell at the CSS file that actually exists in assets/.
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "dist/client";
const css = readdirSync(join(dir, "assets")).filter((f) => /^styles-.*\.css$/.test(f));
if (css.length !== 1) throw new Error(`expected exactly one styles CSS, found: ${css}`);

const shell = join(dir, "_shell.html");
const html = readFileSync(shell, "utf8").replace(/styles-[A-Za-z0-9_-]+\.css/g, css[0]);
writeFileSync(join(dir, "index.html"), html);
writeFileSync(join(dir, "404.html"), html);
writeFileSync(join(dir, ".nojekyll"), "");
console.log(`pages build ready (css: ${css[0]})`);
