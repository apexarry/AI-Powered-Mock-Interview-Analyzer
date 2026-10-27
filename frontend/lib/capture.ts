/** Grab the current webcam frame as a JPEG blob (used for the face check and proctoring frames). */
export function captureFrame(video: HTMLVideoElement, width = 480): Promise<Blob | null> {
  if (!video.videoWidth) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(width * (video.videoHeight / video.videoWidth));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8));
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
