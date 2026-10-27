"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function friendlyError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "Camera and microphone access was blocked. Allow access in your browser's site settings, then try again.";
  if (name === "NotFoundError") return "No camera or microphone was found. Connect one and try again.";
  if (name === "NotReadableError") return "Your camera or microphone is being used by another app. Close it and try again.";
  return "Could not start the camera and microphone.";
}

export function useMediaStream() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const request = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support camera access. Use a recent version of Chrome, Edge or Firefox over HTTPS or localhost.");
      return;
    }
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = next;
      setStream(next);
      setError(null);
      setLost(false);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);

  // Detect a camera or microphone being unplugged or revoked mid-session.
  useEffect(() => {
    if (!stream) return;
    const onEnded = () => setLost(true);
    const tracks = stream.getTracks();
    tracks.forEach((t) => t.addEventListener("ended", onEnded));
    return () => tracks.forEach((t) => t.removeEventListener("ended", onEnded));
  }, [stream]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { stream, error, lost, request, stop };
}
