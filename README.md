# YouTube media extractor

Local Next.js app: paste a YouTube link and download **video**, **audio**, or **every frame** as a ZIP of JPEGs.

Use it only for videos you own or have permission to download. YouTube’s terms generally forbid downloading other people’s content.

## Requirements

- Node.js 20+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [ffmpeg](https://ffmpeg.org/)

Windows (winget):

```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```

Then restart the terminal so both tools are on `PATH`.

## Run

```powershell
cd C:\Users\bhard\Projects\youtube-media-extractor
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Modes

| Mode | Output |
| --- | --- |
| Video | Merged MP4 (best video + audio) |
| Audio | MP3 |
| Frames | ZIP of one JPEG per video frame (clips up to 10 minutes) |
