"use client";

import { useEffect, useMemo, useState } from "react";

type Tools = { ytDlp: boolean; ffmpeg: boolean };

type Info = {
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  fps: number | null;
  width: number | null;
  height: number | null;
  estimatedFrames: number | null;
};

type JobStatus = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  stage: string;
  filename?: string;
  error?: string;
  title?: string;
  frameCount?: number;
};

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ExtractorApp() {
  const [url, setUrl] = useState("");
  const [tools, setTools] = useState<Tools | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<JobStatus | null>(null);

  useEffect(() => {
    void fetch("/api/jobs")
      .then((res) => res.json())
      .then((data: Tools) => setTools(data))
      .catch(() => setTools({ ytDlp: false, ffmpeg: false }));
  }, []);

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    const timer = window.setInterval(() => {
      void fetch(`/api/jobs/${job.id}`)
        .then((res) => res.json())
        .then((data: JobStatus) => setJob(data));
    }, 700);
    return () => window.clearInterval(timer);
  }, [job]);

  const missing = useMemo(() => {
    if (!tools) return [];
    const names = [];
    if (!tools.ytDlp) names.push("yt-dlp");
    if (!tools.ffmpeg) names.push("ffmpeg");
    return names;
  }, [tools]);

  async function lookup() {
    setError("");
    setJob(null);
    setBusy(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "info", url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read that link.");
      setInfo(data);
    } catch (err) {
      setInfo(null);
      setError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function start(kind: "video" | "audio" | "frames") {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", url, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start download.");
      setJob({
        id: data.id,
        status: "queued",
        progress: 0,
        stage: "Queued",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <p className="kicker">Local extractor</p>
      <h1>Frame, sound, picture.</h1>
      <p className="lede">
        Paste a YouTube link. Pull the video file, the audio track, or a ZIP of
        every frame. This runs on your machine and is meant for videos you own
        or have permission to keep.
      </p>

      {missing.length > 0 && (
        <div className="banner">
          Install {missing.join(" and ")} and restart the terminal. On Windows:{" "}
          <code>winget install yt-dlp.yt-dlp</code> and{" "}
          <code>winget install Gyan.FFmpeg</code>.
        </div>
      )}

      <section className="panel">
        <div className="row">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            onKeyDown={(event) => {
              if (event.key === "Enter") void lookup();
            }}
          />
          <button type="button" onClick={() => void lookup()} disabled={busy || !url}>
            {busy && !job ? "Reading…" : "Read link"}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {info && (
          <div className="meta">
            {info.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={info.thumbnail} alt="" />
            ) : (
              <div />
            )}
            <div>
              <h2>{info.title}</h2>
              <p>
                {info.uploader}
                {info.duration ? ` · ${formatDuration(info.duration)}` : ""}
                {info.width && info.height ? ` · ${info.width}×${info.height}` : ""}
                {info.estimatedFrames
                  ? ` · ~${info.estimatedFrames.toLocaleString()} frames`
                  : ""}
              </p>
            </div>
          </div>
        )}

        <div className="modes">
          <button
            className="mode"
            type="button"
            disabled={busy || !url}
            onClick={() => void start("video")}
          >
            <strong>Video</strong>
            <span>Best merged MP4, with picture and sound.</span>
          </button>
          <button
            className="mode"
            type="button"
            disabled={busy || !url}
            onClick={() => void start("audio")}
          >
            <strong>Audio</strong>
            <span>MP3 from the original soundtrack.</span>
          </button>
          <button
            className="mode"
            type="button"
            disabled={busy || !url}
            onClick={() => void start("frames")}
          >
            <strong>Every frame</strong>
            <span>One JPEG per frame, zipped. Clips up to 10 minutes.</span>
          </button>
        </div>

        {job && (
          <div className="progress-wrap">
            <div className="progress-label">
              <span>{job.stage}</span>
              <span>{job.progress}%</span>
            </div>
            <div className="bar">
              <i style={{ width: `${job.progress}%` }} />
            </div>
            {job.status === "error" && job.error && (
              <div className="error">{job.error}</div>
            )}
            {job.status === "done" && (
              <a className="download" href={`/api/jobs/${job.id}/file`}>
                Download {job.filename}
                {job.frameCount ? ` (${job.frameCount.toLocaleString()} frames)` : ""}
              </a>
            )}
          </div>
        )}
      </section>

      <p className="legal">
        Do not use this to take videos you do not have rights to. YouTube’s
        terms generally prohibit downloading other people’s content. Frame
        export can produce thousands of images and a large ZIP.
      </p>
    </main>
  );
}
