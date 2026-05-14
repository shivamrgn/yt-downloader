const express = require("express");
const { execFile, spawn } = require("child_process");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Find yt-dlp binary
const YTDLP_PATH = process.env.YTDLP_PATH || "yt-dlp";

function isValidYouTubeUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.hostname.includes("youtube.com") ||
      u.hostname.includes("youtu.be") ||
      u.hostname.includes("youtube-nocookie.com")
    );
  } catch {
    return false;
  }
}

// GET /api/info — fetch video metadata + available formats
app.get("/api/info", (req, res) => {
  const { url } = req.query;

  if (!url || !isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: "Invalid or missing YouTube URL" });
  }

  const args = [
    "--dump-json",
    "--no-playlist",
    "--skip-download",
    "--no-warnings",
    "--no-check-certificates",
    "--extractor-retries", "3",
    "--socket-timeout", "20",
    "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "--add-header", "Accept-Language:en-US,en;q=0.9",
    "--compat-options", "no-youtube-unavailable-videos",
    url,
  ];

  execFile(YTDLP_PATH, args, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error("yt-dlp info error:", stderr || err.message);
      return res
        .status(500)
        .json({ error: "Failed to fetch video info. Please check the URL." });
    }

    try {
      const info = JSON.parse(stdout);

      // Build a clean list of downloadable formats
      const formats = [];

      // Video+Audio combined formats
      const combined = (info.formats || []).filter(
        (f) =>
          f.vcodec !== "none" &&
          f.acodec !== "none" &&
          f.ext === "mp4" &&
          f.height
      );

      // Video-only formats (we'll mux with best audio)
      const videoOnly = (info.formats || []).filter(
        (f) => f.vcodec !== "none" && f.acodec === "none" && f.height
      );

      // Deduplicate by height — prefer higher filesize
      const seen = new Set();

      [...combined, ...videoOnly]
        .sort((a, b) => (b.height || 0) - (a.height || 0))
        .forEach((f) => {
          const label = `${f.height}p`;
          if (!seen.has(label)) {
            seen.add(label);
            formats.push({
              format_id: f.format_id,
              label,
              height: f.height,
              ext: f.ext || "mp4",
              filesize: f.filesize || f.filesize_approx || null,
              fps: f.fps || null,
              vcodec: f.vcodec,
              acodec: f.acodec,
            });
          }
        });

      // Always add audio-only
      formats.push({
        format_id: "bestaudio",
        label: "Audio only (MP3)",
        height: 0,
        ext: "mp3",
        filesize: null,
        fps: null,
      });

      res.json({
        id: info.id,
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration,
        channel: info.uploader || info.channel,
        view_count: info.view_count,
        formats: formats.slice(0, 8), // max 8 options
      });
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr);
      res.status(500).json({ error: "Failed to parse video metadata." });
    }
  });
});

// GET /api/download — stream the video file to the client
app.get("/api/download", (req, res) => {
  const { url, format_id, title } = req.query;

  if (!url || !isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  const isAudio = format_id === "bestaudio";
  const safeTitle = (title || "video")
    .replace(/[^\w\s\-]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 80);

  const ext = isAudio ? "mp3" : "mp4";
  const filename = `${safeTitle}.${ext}`;

  // We will download to a temporary file first to allow yt-dlp to use fast concurrent chunk downloads.
  // Streaming directly to stdout (-o -) disables chunked downloading, resulting in severe throttling.
  const tempId = Math.random().toString(36).substring(2, 15);
  const tempDir = require('os').tmpdir();
  const tempFilePath = path.join(tempDir, `ytdl_${tempId}.${ext}`);

  let args;

  if (isAudio) {
    args = [
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--no-playlist",
      "--no-warnings",
      "-o",
      tempFilePath,
      url,
    ];
  } else {
    // If it's a specific format, try to merge it with best audio if it's video-only
    const fmtSpec =
      format_id && format_id !== "best"
        ? `${format_id}+bestaudio/best`
        : "bestvideo+bestaudio/best";

    args = [
      "-f",
      fmtSpec,
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "--no-warnings",
      "-o",
      tempFilePath,
      url,
    ];
  }

  console.log(`Starting fast download to temp file: ${tempFilePath}`);
  const dl = spawn(YTDLP_PATH, args);

  dl.stderr.on("data", (data) => {
    // yt-dlp progress usually goes to stderr
    console.log("yt-dlp:", data.toString().trim());
  });

  dl.on("error", (err) => {
    console.error("Spawn error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Download process failed." });
    }
  });

  dl.on("close", (code) => {
    if (code !== 0) {
      console.warn(`yt-dlp exited with code ${code}`);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Video download failed." });
      }
      return;
    }

    console.log(`Finished downloading, sending to client: ${filename}`);
    res.download(tempFilePath, filename, (err) => {
      if (err) {
        console.error("Error sending file to client:", err);
      }
      // Cleanup temp file
      const fs = require('fs');
      fs.unlink(tempFilePath, (unlinkErr) => {
        if (unlinkErr) console.error("Error deleting temp file:", unlinkErr);
      });
    });
  });

  req.on("close", () => {
    if (!res.writableEnded) {
      console.log("Client disconnected, aborting yt-dlp...");
      dl.kill("SIGTERM");
      const fs = require('fs');
      setTimeout(() => {
        fs.unlink(tempFilePath, () => {});
      }, 2000);
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n🎬 YouTube Downloader running at http://localhost:${PORT}\n`);
});
