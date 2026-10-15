#!/usr/bin/env bash
# Encode the overview video for the project page.
# Usage: tools/encode_video.sh path/to/dash_overview.mp4
# Writes docs/assets/video/dash_overview.{mp4,webm} and dash_overview_poster.jpg (<=1080p).
# Target: each file under ~15 MB. If one is larger, raise CRF by 2 and re-run.
set -euo pipefail
src="${1:?usage: encode_video.sh input.mp4}"
out="$(cd "$(dirname "$0")/.." && pwd)/docs/assets/video"
mkdir -p "$out"
scale="scale='min(1920,iw)':-2"

# H.264 MP4 (universal fallback). faststart lets playback begin before the download finishes.
ffmpeg -y -i "$src" -vf "$scale" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart "$out/dash_overview.mp4"

# WebM: VP9 when ffmpeg has libvpx, otherwise AV1 (SVT-AV1). Both play in current browsers.
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libvpx-vp9; then
  ffmpeg -y -i "$src" -vf "$scale" -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -c:a libopus -b:a 96k "$out/dash_overview.webm"
else
  echo "libvpx-vp9 not available; encoding WebM as AV1"
  ffmpeg -y -i "$src" -vf "$scale" -c:v libsvtav1 -crf 38 -preset 6 -pix_fmt yuv420p -c:a libopus -b:a 96k "$out/dash_overview.webm"
fi

# Poster from the 2-second mark.
ffmpeg -y -ss 2 -i "$src" -frames:v 1 -vf "$scale" -q:v 3 "$out/dash_overview_poster.jpg"

ls -lh "$out"
echo "Now remove the 'hidden' attribute from <section id=\"video\"> and the hero pill marked data-video-only in docs/index.html."
