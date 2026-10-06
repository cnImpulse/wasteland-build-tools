import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run, sha256 } from './prepare.mjs';

const directory = path.resolve(process.argv[2] ?? 'dist');
const platform = `${process.platform}-${process.arch}`;
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const release = manifest.platforms[platform];
assert(release, `Unsupported platform: ${platform}`);
const archive = path.join(directory, release.archive);
assert.equal(await sha256(archive), release.sha256, 'Archive SHA-256');
const work = await mkdtemp(path.join(tmpdir(), 'ffmpeg-smoke-'));
try {
  const unpacked = path.join(work, 'tools');
  await mkdir(unpacked);
  run('tar', ['-xf', archive, '-C', unpacked]);
  const commands = Object.fromEntries(Object.entries(release.binaries).map(([name, relative]) => [name, path.join(unpacked, relative)]));
  for (const [command, executable] of Object.entries(commands)) {
    assert.equal(run(executable, ['-version']).split('\n')[0].split(/\s+/)[2], release.version, `${command} exact version`);
    if (process.platform === 'darwin') {
      const dependencies = run('otool', ['-L', executable]).split('\n').slice(1).map(line => line.trim().split(' ')[0]);
      assert(dependencies.every(name => name.startsWith('/System/Library/') || name.startsWith('/usr/lib/')), `Non-system dylib: ${dependencies}`);
    } else {
      const dependencies = run('ldd', [executable]);
      assert(!dependencies.includes('not found'), dependencies);
    }
  }
  assert(run(commands.ffmpeg, ['-hide_banner', '-encoders']).includes('libmp3lame'));
  const source = path.join(work, 'source.wav');
  run(commands.ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-ar', '48000', '-ac', '2', source]);
  for (const rule of [
    { name: 'background.mp3', codec: 'libmp3lame', format: 'mp3', rate: 48000, channels: 2, bitrate: '96k' },
    { name: 'effect.wav', codec: 'pcm_s16le', format: 'wav', rate: 48000, channels: 1 },
    { name: 'special.mp3', codec: 'libmp3lame', format: 'mp3', rate: 44100, channels: 2, bitrate: '128k' },
  ]) {
    const output = path.join(work, rule.name);
    const args = ['-y', '-i', source, '-map_metadata', '-1', '-vn', '-c:a', rule.codec, '-ar', String(rule.rate), '-ac', String(rule.channels)];
    if (rule.bitrate) args.push('-b:a', rule.bitrate);
    run(commands.ffmpeg, [...args, output]);
    const probe = JSON.parse(run(commands.ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]));
    const audio = probe.streams.find(stream => stream.codec_type === 'audio');
    assert.equal(Number(audio.sample_rate), rule.rate);
    assert.equal(audio.channels, rule.channels);
    assert(probe.format.format_name.split(',').includes(rule.format));
    assert(Math.abs(Number(probe.format.duration) - 1) < 0.1);
    console.log(`${platform}: ${rule.name} audio smoke passed`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
