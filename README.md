# yt-downloader
 using this we have to download any youtube  video with high quality and we have also download audio of video as a mp3

A full-stack web app to download YouTube videos at any quality — built with Node.js, Express, and yt-dlp.

---

## Prerequisites

- **Node.js** v16+ → https://nodejs.org
- **Python 3** (for yt-dlp) → usually pre-installed on Mac/Linux
- **yt-dlp** — the engine that powers downloads
- **ffmpeg** (for merging video+audio) → https://ffmpeg.org

---

## Quick Setup (3 steps)

### 1. Install ffmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt install ffmpeg
```

**Windows:** Download from https://ffmpeg.org/download.html and add to PATH.

---

### 2. Install yt-dlp

```bash
pip3 install yt-dlp
```

Or on Windows:
```bash
pip install yt-dlp
```

---

### 3. Run the app

```bash
cd ytdl-app
npm install
npm start
```

Then open your browser: **http://localhost:3000**

---

## How to use

1. Paste any YouTube video URL into the input field
2. Click **ANALYZE VIDEO**
3. The app fetches all available resolutions (4K, 1080p, 720p, 480p, 360p, MP3, etc.)
4. Click your desired format/quality
5. The video streams directly to your browser and saves to your **Downloads** folder

---

## Project structure

```
ytdl-app/
├── server.js          # Express backend (API + static files)
├── public/
│   └── index.html     # Frontend UI
├── package.json
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/info?url=<yt-url>` | GET | Returns video metadata + available formats |
| `/api/download?url=<yt-url>&format_id=<id>&title=<name>` | GET | Streams the video file |

---

## Notes

- Downloads go to your browser's default **Downloads** folder
- High-quality formats (1080p+) are merged from separate video and audio streams using ffmpeg
- Audio-only option downloads as MP3
- For very large files (4K), downloads may take a few minutes
- This tool is intended for **personal, non-commercial use** only. Always respect YouTube's Terms of Service and copyright law.

---

## Troubleshooting

**"yt-dlp not found"** → Make sure yt-dlp is installed and in your PATH. Run `yt-dlp --version` to check.

**"ffmpeg not found"** → High-quality merging requires ffmpeg. Install it per the instructions above.

**Video not downloading** → YouTube sometimes blocks automated requests. Run `pip3 install -U yt-dlp` to get the latest version.
