"use client";

import { useCallback, useRef, useState } from "react";

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c));
}

/** Records the microphone track of a stream, one answer at a time. */
export function useRecorder(stream: MediaStream | null) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);

  const start = useCallback(() => {
    if (!stream || stream.getAudioTracks().length === 0) throw new Error("Microphone is not available.");
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()), mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
  }, [stream]);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") {
          setRecording(false);
          resolve(null);
          return;
        }
        recorder.onstop = () => {
          setRecording(false);
          resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        };
        recorder.stop();
      }),
    [],
  );

  return { recording, start, stop };
}
