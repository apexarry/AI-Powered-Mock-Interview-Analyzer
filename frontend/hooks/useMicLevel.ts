"use client";

import { useEffect, useState } from "react";

/** Live microphone level (0-1) and a latch that turns true once speech-level sound is heard. */
export function useMicLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const resume = () => void ctx.resume();
    resume();
    document.addEventListener("pointerdown", resume, { once: true });

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      const scaled = Math.min(1, rms * 6);
      setLevel(scaled);
      if (scaled > 0.15) setHeard(true);
    }, 100);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("pointerdown", resume);
      source.disconnect();
      void ctx.close();
    };
  }, [stream]);

  return { level, heard };
}
