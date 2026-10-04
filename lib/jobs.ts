import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import archiver from "archiver";
import { commandExists, runCommand, runCommandCapture } from "./process";
import { assertYouTubeUrl, slugify } from "./youtube";

export type JobKind = "video" | "audio" | "frames";

export type Job = {
  id: string;
  kind: JobKind;
  url: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  stage: string;
  filename?: string;
  filePath?: string;
  mime?: string;
  error?: string;
  title?: string;
  frameCount?: number;
};

export type VideoInfo = {
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  fps: number | null;
  width: number | null;
  height: number | null;
  estimatedFrames: number | null;
};

const MAX_FRAME_SECONDS = 10 * 60;
const jobs = new Map<string, Job>();
const workRoot = path.join(os.tmpdir(), "youtube-media-extractor");

type YtDlpInfo = {
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  fps?: number;
  width?: number;
  height?: number;
};

function parsePercent(text: string): number | null {
  const match = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  if (!match) return null;
  return Number(match[1]);
}

export async function getTools() {
  const [ytDlp, ffmpeg] = await Promise.all([
    commandExists("yt-dlp"),
    commandExists("ffmpeg"),
  ]);
  return { ytDlp, ffmpeg };
}

export async function getVideoInfo(rawUrl: string): Promise<VideoInfo> {
  const url = assertYouTubeUrl(rawUrl);
  const json = await runCommandCapture("yt-dlp", [
    "--dump-single-json",
    "--no-download",
    "--no-warnings",
    "--no-playlist",
    url,
  ]);
  const data = JSON.parse(json) as YtDlpInfo;
  const duration = Math.round(Number(data.duration) || 0);
  const fps = data.fps ? Number(data.fps) : null;
  const estimatedFrames =
    duration && fps ? Math.round(duration * fps) : duration ? duration * 30 : null;

  return {
    title: data.title || "YouTube video",
    uploader: data.uploader || data.channel || "Unknown channel",
    duration,
    thumbnail: data.thumbnail || "",
    fps,
    width: data.width ?? null,
    height: data.height ?? null,
    estimatedFrames,
  };
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function createJob(url: string, kind: JobKind): Job {
  const job: Job = {
    id: randomUUID(),
    kind,
    url: assertYouTubeUrl(url),
    status: "queued",
    progress: 0,
    stage: "Waiting",
  };
  jobs.set(job.id, job);
  void runJob(job);
  return job;
}

function update(job: Job, patch: Partial<Job>) {
  Object.assign(job, patch);
}

async function runJob(job: Job) {
  const dir = path.join(workRoot, job.id);
  try {
    update(job, { status: "running", stage: "Checking tools", progress: 2 });
    const tools = await getTools();
    if (!tools.ytDlp) {
      throw new Error("yt-dlp is not installed or not on PATH.");
    }
    if (!tools.ffmpeg) {
      throw new Error("ffmpeg is not installed or not on PATH.");
    }

    await mkdir(dir, { recursive: true });
    update(job, { stage: "Reading video info", progress: 6 });
    const info = await getVideoInfo(job.url);
    update(job, { title: info.title });

    if (job.kind === "frames") {
      if (!info.duration) {
        throw new Error("Could not read video duration, so frames were not extracted.");
      }
      if (info.duration > MAX_FRAME_SECONDS) {
        throw new Error(
          "Frame export is limited to 10 minutes. Choose a shorter clip.",
        );
      }
    }

    const base = slugify(info.title);

    if (job.kind === "video") {
      const filename = `${base}.mp4`;
      const filePath = path.join(dir, filename);
      update(job, { stage: "Downloading video", progress: 10 });
      await runCommand(
        "yt-dlp",
        [
          "--no-playlist",
          "--no-warnings",
          "-f",
          "bv*+ba/b",
          "--merge-output-format",
          "mp4",
          "-o",
          filePath,
          job.url,
        ],
        (text) => {
          const percent = parsePercent(text);
          if (percent !== null) {
            update(job, { progress: 10 + Math.round(percent * 0.85) });
          }
        },
      );
      update(job, {
        status: "done",
        progress: 100,
        stage: "Ready",
        filename,
        filePath,
        mime: "video/mp4",
      });
      return;
    }

    if (job.kind === "audio") {
      const filename = `${base}.mp3`;
      const outputTemplate = path.join(dir, `${base}.%(ext)s`);
      update(job, { stage: "Extracting audio", progress: 10 });
      await runCommand(
        "yt-dlp",
        [
          "--no-playlist",
          "--no-warnings",
          "-x",
          "--audio-format",
          "mp3",
          "--audio-quality",
          "0",
          "-o",
          outputTemplate,
          job.url,
        ],
        (text) => {
          const percent = parsePercent(text);
          if (percent !== null) {
            update(job, { progress: 10 + Math.round(percent * 0.85) });
          }
        },
      );
      update(job, {
        status: "done",
        progress: 100,
        stage: "Ready",
        filename,
        filePath: path.join(dir, filename),
        mime: "audio/mpeg",
      });
      return;
    }

    update(job, { stage: "Downloading video for frames", progress: 8 });
    const sourcePath = path.join(dir, "source.%(ext)s");
    await runCommand(
      "yt-dlp",
      [
        "--no-playlist",
        "--no-warnings",
        "-f",
        "bv*[ext=mp4]/bv*/b",
        "-o",
        sourcePath,
        job.url,
      ],
      (text) => {
        const percent = parsePercent(text);
        if (percent !== null) {
          update(job, { progress: 8 + Math.round(percent * 0.42) });
        }
      },
    );

    const files = await readdir(dir);
    const source = files.find((name) => name.startsWith("source."));
    if (!source) {
      throw new Error("Video file was not saved, so frames could not be extracted.");
    }

    const framesDir = path.join(dir, "frames");
    await mkdir(framesDir, { recursive: true });
    update(job, { stage: "Extracting every frame", progress: 52 });

    const estimated = info.estimatedFrames || Math.max(info.duration * 30, 1);
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-i",
        path.join(dir, source),
        "-q:v",
        "3",
        path.join(framesDir, "frame_%06d.jpg"),
      ],
      (text) => {
        const match = text.match(/frame=\s*(\d+)/);
        if (!match) return;
        const current = Number(match[1]);
        const ratio = Math.min(current / estimated, 1);
        update(job, { progress: 52 + Math.round(ratio * 33) });
      },
    );

    const frameFiles = (await readdir(framesDir)).filter((name) =>
      name.endsWith(".jpg"),
    );
    if (frameFiles.length === 0) {
      throw new Error("ffmpeg did not produce any frames.");
    }

    const filename = `${base}-frames.zip`;
    const filePath = path.join(dir, filename);
    update(job, {
      stage: "Zipping frames",
      progress: 88,
      frameCount: frameFiles.length,
    });
    await zipDirectory(framesDir, filePath);
    update(job, {
      status: "done",
      progress: 100,
      stage: "Ready",
      filename,
      filePath,
      mime: "application/zip",
      frameCount: frameFiles.length,
    });
  } catch (error) {
    update(job, {
      status: "error",
      stage: "Failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function zipDirectory(sourceDir: string, zipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 6 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, "frames");
    void archive.finalize();
  });
}

export async function cleanupJob(id: string) {
  const job = jobs.get(id);
  jobs.delete(id);
  if (!job) return;
  await rm(path.join(workRoot, id), { recursive: true, force: true }).catch(
    () => undefined,
  );
}
