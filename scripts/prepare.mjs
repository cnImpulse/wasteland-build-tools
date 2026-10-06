import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`);
  return `${result.stdout}\n${result.stderr}`.trim();
}
export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function prepare(upstreamDirectory) {
  const sources = JSON.parse(await readFile(path.join(root, 'sources.json'), 'utf8'));
  const dist = path.join(root, 'dist');
  await mkdir(dist, { recursive: true });
  const manifest = { tag: sources.tag, repository: sources.repository, platforms: {} };
  for (const [platform, source] of Object.entries(sources.platforms)) {
    const work = await mkdtemp(path.join(dist, '.prepare-'));
    try {
      for (const download of source.downloads) {
        const archive = path.join(work, download.file);
        if (upstreamDirectory) {
          await copyFile(path.join(upstreamDirectory, download.file), archive);
        } else {
          const response = await fetch(download.url);
          if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${download.url}`);
          await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
        }
        const actual = await sha256(archive);
        if (actual !== download.sha256) throw new Error(`SHA-256 mismatch: ${download.file}`);
        if (source.repack) run('unzip', ['-q', archive, '-d', work]);
      }
      const archive = `${sources.tag}-${platform}.${source.repack ? 'tar.gz' : 'tar.xz'}`;
      const output = path.join(dist, archive);
      if (source.repack) {
        const bundle = path.join(work, 'bundle');
        await mkdir(path.join(bundle, 'bin'), { recursive: true });
        for (const command of ['ffmpeg', 'ffprobe']) {
          await copyFile(path.join(work, command), path.join(bundle, 'bin', command));
          await chmod(path.join(bundle, 'bin', command), 0o755);
        }
        await copyFile(path.join(root, 'licenses/COPYING.GPLv3'), path.join(bundle, 'COPYING.GPLv3'));
        await writeFile(path.join(bundle, 'SOURCE-INFO.json'), `${JSON.stringify(source, null, 2)}\n`);
        run('tar', ['-czf', output, '-C', bundle, '.']);
      } else {
        await copyFile(path.join(work, source.downloads[0].file), output);
      }
      manifest.platforms[platform] = {
        archive, sha256: await sha256(output), version: source.version,
        binaries: source.binaries,
        url: `https://github.com/${sources.repository}/releases/download/${sources.tag}/${archive}`,
      };
      console.log(`${platform}: ${archive} ${manifest.platforms[platform].sha256}`);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Redistribution source status: ${sources.corresponding_source.status}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepare(process.argv[2] && path.resolve(process.argv[2]));
}
