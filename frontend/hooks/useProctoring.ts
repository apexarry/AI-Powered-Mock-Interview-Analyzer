"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { captureFrame } from "@/lib/capture";
import type { BrowserEvent, FrameResult } from "@/lib/types";

export const EVENT_LABELS: Record<string, string> = {
  tab_switch: "Switched tab or window",
  fullscreen_exit: "Left fullscreen",
  camera_interrupted: "Camera interrupted",
  mic_interrupted: "Microphone interrupted",
  face_absent: "Face not visible",
  multiple_faces: "More than one face in view",
};

const FRAME_INTERVAL_MS = 2000;

interface Options {
  enabled: boolean;
  interviewId: number;
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onNotice: (message: string) => void;
}

/** Browser-side proctoring: Page Visibility, Fullscreen and MediaDevices events plus periodic frames. */
export function useProctoring({ enabled, interviewId, stream, videoRef, onNotice }: Options) {
  const [face, setFace] = useState<FrameResult | null>(null);
  const noticeRef = useRef(onNotice);
  useEffect(() => {
    noticeRef.current = onNotice;
  }, [onNotice]);

  const report = useCallback(
    async (type: BrowserEvent) => {
      try {
        await api(`/interviews/${interviewId}/events`, { json: { event_type: type } });
        noticeRef.current(`${EVENT_LABELS[type]}. This was added to your proctoring log.`);
      } catch {
        /* a failed log call must never interrupt the interview */
      }
    },
    [interviewId],
  );

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.hidden) void report("tab_switch");
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) void report("fullscreen_exit");
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [enabled, report]);

  useEffect(() => {
    if (!enabled || !stream) return;
    const cleanups: Array<() => void> = [];
    const watch = (track: MediaStreamTrack, type: BrowserEvent) => {
      const handler = () => void report(type);
      track.addEventListener("ended", handler);
      cleanups.push(() => track.removeEventListener("ended", handler));
    };
    stream.getVideoTracks().forEach((t) => watch(t, "camera_interrupted"));
    stream.getAudioTracks().forEach((t) => watch(t, "mic_interrupted"));
    return () => cleanups.forEach((fn) => fn());
  }, [enabled, stream, report]);

  useEffect(() => {
    if (!enabled || !stream) return;
    let busy = false;
    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      const track = stream.getVideoTracks()[0];
      if (busy || !video || video.readyState < 2 || !track || track.readyState !== "live") return;
      busy = true;
      try {
        const blob = await captureFrame(video);
        if (!blob) return;
        const form = new FormData();
        form.append("image", blob, "frame.jpg");
        const result = await api<FrameResult>(`/interviews/${interviewId}/frames`, { form });
        setFace(result);
        if (result.event_logged) {
          noticeRef.current(`${EVENT_LABELS[result.event_logged]}. This was added to your proctoring log.`);
        }
      } catch {
        /* skip this frame */
      } finally {
        busy = false;
      }
    }, FRAME_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, stream, interviewId, videoRef]);

  return { face };
}
