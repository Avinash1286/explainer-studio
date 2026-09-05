import { bundle } from "@remotion/bundler";
import { ensureBrowser, makeCancelSignal, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fixture } from "../../packages/contracts/fixture";
import { FPS, projectSchema, type RenderProject } from "../../packages/contracts/scene";

function command(executable: string, args: string[], signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "inherit", "inherit"], signal, windowsHide: true });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Media subprocess exited ${code}`)));
  });
}
function stamp(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms/3600000)).padStart(2,"0")}:${String(Math.floor(ms/60000)%60).padStart(2,"0")}:${String(Math.floor(ms/1000)%60).padStart(2,"0")}.${String(ms%1000).padStart(3,"0")}`;
}

export async function renderFixture(directory: string, stage: (message: string) => Promise<void> = async () => {}, signal?: AbortSignal) {
  return renderProject(fixture, directory, stage, signal);
}

export async function renderProject(value: unknown, directory: string, stage: (message: string) => Promise<void> = async () => {}, signal?: AbortSignal, provenance: unknown = null) {
  const inputProject = projectSchema.parse(value);
  const catalog = JSON.parse(await readFile("public/openmoji/manifest.json", "utf8")) as { entries: { id: string }[] };
  for (const scene of inputProject.scenes) {
    if (scene.nodes.length !== (scene.layout === "comparison" ? 2 : 3)) throw new Error("Invalid layout node count");
    if (scene.nodes.some(n => !catalog.entries.some(e => e.id === n.icon))) throw new Error("Unknown icon");
  }
  const started = performance.now();
  const root = process.cwd();
  const destination = path.resolve(directory);
  const publicDir = path.join(destination, "public");
  await mkdir(publicDir, { recursive: true });
  const input = path.join(destination, "input.json");
  await writeFile(input, JSON.stringify(inputProject));
  await stage("Synthesizing your narration with Kokoro");
  const python = process.env.PYTHON_BIN || (process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  await command(python, ["workers/tts/synthesize.py", input, publicDir], signal);
  signal?.throwIfAborted();
  const speech = JSON.parse(await readFile(path.join(publicDir, "speech.json"), "utf8")) as { scenes: { file: string; seconds: number; words: { text: string; start: number; end: number }[] }[]; synthesisSeconds: number; peakRssMb: number | null; timingMethod: string };
  if (inputProject.targetDuration) {
    const desiredSpeech = inputProject.targetDuration - inputProject.scenes.length * 0.7;
    const totalSpeech = speech.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
    const tempo = totalSpeech / desiredSpeech;
    if (tempo < 0.8 || tempo > 1.25) throw new Error("Narration duration is outside the safe timing adjustment range");
    for (const audio of speech.scenes) {
      const output = audio.file.replace(".wav", "-timed.wav");
      await command(process.env.FFMPEG_BIN || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(publicDir, audio.file), "-af", `atempo=${tempo}`, path.join(publicDir, output)], signal);
      audio.file = output;
      audio.seconds /= tempo;
      audio.words = audio.words.map(word => ({ ...word, start: word.start / tempo, end: word.end / tempo }));
    }
    speech.timingMethod += `; audio and predicted times adjusted by tempo ${tempo.toFixed(5)}`;
  }
  let cursor = 0;
  const scenes = inputProject.scenes.map((scene, index) => {
    const audio = speech.scenes[index];
    const durationInFrames = inputProject.targetDuration && index === inputProject.scenes.length - 1 ? inputProject.targetDuration * FPS - cursor : Math.ceil((audio.seconds + 0.7) * FPS);
    if (durationInFrames < Math.ceil(audio.seconds * FPS) + 8) throw new Error("Audio exceeds scene duration");
    const cueFrames = scene.nodes.map((node, i) => {
      const word = audio.words.find(w => w.text.toLowerCase().replace(/[^a-z]/g, "") === (node.cue || node.label).toLowerCase());
      return word ? Math.max(0, Math.round(word.start * FPS) + 8 - 36) : 12 + i * Math.max(32, Math.floor((durationInFrames - 100) / scene.nodes.length));
    });
    const timed = { ...scene, startFrame: cursor, durationInFrames, audioFile: audio.file, audioSeconds: audio.seconds, cueFrames, words: audio.words };
    cursor += durationInFrames;
    return timed;
  });
  const project: RenderProject = { ...inputProject, scenes, fps: FPS, width: 1280, height: 720, durationInFrames: cursor, attribution: "OpenMoji contributors, CC BY-SA 4.0; animated stroke/fill adaptations. See icon-manifest.json.", timingMethod: speech.timingMethod };
  const icons: Record<string, string> = {};
  for (const id of new Set(scenes.flatMap(scene => scene.nodes.map(node => node.icon)))) icons[id] = await readFile(path.join(root, "public/openmoji", `${id}.svg`), "utf8");
  const manifest = await readFile("public/openmoji/manifest.json", "utf8");
  await copyFile("public/openmoji/manifest.json", path.join(destination, "icon-manifest.json"));
  const captions = scenes.flatMap(scene => {
    const lines: string[] = [];
    for (let i = 0; i < scene.words.length; i += 7) {
      const group = scene.words.slice(i, i + 7);
      const start = (scene.startFrame + 8) / FPS + group[0].start;
      const end = (scene.startFrame + 8) / FPS + group.at(-1)!.end;
      lines.push(`${stamp(start)} --> ${stamp(end)}\n${group.map(w => w.text).join(" ").replace(/\s+([.,!?;:])/g, "$1")}`);
    }
    return lines;
  });
  await writeFile(path.join(destination, "captions.vtt"), `WEBVTT\n\n${captions.join("\n\n")}\n`);
  await stage(`Drawing and rendering ${scenes.length} animated scenes`);
  const renderStarted = performance.now();
  await ensureBrowser();
  const serveUrl = await bundle({ entryPoint: path.join(root, "video/composition.tsx"), publicDir, outDir: path.join(destination, "bundle") });
  signal?.throwIfAborted();
  const inputProps = { project, icons };
  const composition = await selectComposition({ serveUrl, id: "Explainer", inputProps });
  const { cancelSignal, cancel } = makeCancelSignal();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await renderMedia({ serveUrl, composition, inputProps, codec: "h264", audioCodec: "aac", outputLocation: path.join(destination, "video.mp4"), concurrency: Number(process.env.RENDER_CONCURRENCY || 2), crf: 22, muted: false, enforceAudioTrack: true, cancelSignal });
  } finally { signal?.removeEventListener("abort", cancel); }
  signal?.throwIfAborted();
  await renderStill({ serveUrl, composition, inputProps, frame: Math.min(scenes[0].durationInFrames - 10, 180), output: path.join(destination, "poster.png") });
  const video = await readFile(path.join(destination, "video.mp4"));
  const benchmark = { totalSeconds: (performance.now()-started)/1000, synthesisSeconds: speech.synthesisSeconds, renderSeconds: (performance.now()-renderStarted)/1000, ttsPeakRssMb: speech.peakRssMb, durationSeconds: cursor/FPS, frames: cursor, videoBytes: video.length, videoSha256: createHash("sha256").update(video).digest("hex"), platform: process.platform, node: process.version, remotion: "4.0.520", concurrency: Number(process.env.RENDER_CONCURRENCY || 2) };
  await writeFile(path.join(destination, "project.json"), JSON.stringify({ ...project, provenance, iconManifest: JSON.parse(manifest), benchmark, transcript: inputProject.scenes.map(s => s.narration).join(" ") }, null, 2));
  await writeFile(path.join(destination, "benchmark.json"), JSON.stringify(benchmark, null, 2));
  return { destination, benchmark };
}
