"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { TalkingHead } from "@/vendor/talkinghead/talkinghead.mjs";

export type TalkingMentorHandle = {
  beginUtterance: () => void;
  startStream: () => Promise<boolean>;
  stopStream: () => void;
  streamAudio: (samples: Float32Array) => boolean;
};

type TalkingMentorProps = {
  onReadyChange?: (ready: boolean) => void;
};

type VisemeName = "sil" | "aa" | "E" | "O" | "U" | "PP" | "SS";

function analyzeVisemes(samples: Float32Array, sampleRate: number, offsetMs: number) {
  const windowSamples = Math.max(1, Math.round(sampleRate * 0.08));
  const visemes: VisemeName[] = [];
  const vtimes: number[] = [];
  const vdurations: number[] = [];

  for (let start = 0; start < samples.length; start += windowSamples) {
    const end = Math.min(samples.length, start + windowSamples);
    let energy = 0;
    let crossings = 0;
    let previous = samples[start] ?? 0;

    for (let index = start; index < end; index += 1) {
      const value = samples[index];
      energy += value * value;
      if ((value >= 0 && previous < 0) || (value < 0 && previous >= 0)) crossings += 1;
      previous = value;
    }

    const length = Math.max(1, end - start);
    const rms = Math.sqrt(energy / length);
    const crossingRate = crossings / length;
    let viseme: VisemeName;

    if (rms < 0.012) viseme = "sil";
    else if (crossingRate > 0.18) viseme = "SS";
    else if (crossingRate > 0.11) viseme = "E";
    else if (rms > 0.12) viseme = "aa";
    else if (rms > 0.065) viseme = "O";
    else if (crossingRate < 0.045) viseme = "U";
    else viseme = "PP";

    if (visemes.at(-1) === viseme && viseme !== "sil") continue;
    visemes.push(viseme);
    vtimes.push(offsetMs + (start / sampleRate) * 1000);
    vdurations.push(((end - start) / sampleRate) * 1000);
  }

  return { visemes, vtimes, vdurations };
}

export const TalkingMentor = forwardRef<TalkingMentorHandle, TalkingMentorProps>(
  function TalkingMentor({ onReadyChange }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const headRef = useRef<TalkingHead | null>(null);
    const streamStartedRef = useRef(false);
    const audioOffsetMsRef = useRef(0);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let disposed = false;
      const head = new TalkingHead(container, {
        cameraView: "upper",
        cameraDistance: -0.25,
        cameraRotateEnable: false,
        cameraPanEnable: false,
        cameraZoomEnable: false,
        lipsyncModules: ["en"],
        modelFPS: 30,
        modelPixelRatio: Math.min(window.devicePixelRatio, 1.5),
        lightAmbientIntensity: 2.4,
        lightDirectIntensity: 24,
      });
      headRef.current = head;

      void head.showAvatar({
        url: "/avatars/brunette.glb",
        body: "F",
        avatarMood: "neutral",
        lipsyncLang: "en",
        avatarIdleEyeContact: 0.72,
        avatarSpeakingEyeContact: 0.86,
        avatarSpeakingHeadMove: 0.38,
      }).then(() => {
        if (disposed) return;
        setStatus("ready");
        onReadyChange?.(true);
      }).catch((error: unknown) => {
        console.error("TalkingHead avatar failed to load", error);
        if (disposed) return;
        setStatus("error");
        onReadyChange?.(false);
      });

      const handleVisibility = () => {
        if (document.visibilityState === "visible") head.start();
        else head.stop();
      };
      document.addEventListener("visibilitychange", handleVisibility);

      return () => {
        disposed = true;
        document.removeEventListener("visibilitychange", handleVisibility);
        onReadyChange?.(false);
        head.dispose();
        headRef.current = null;
      };
    }, [onReadyChange]);

    useImperativeHandle(ref, () => ({
      async startStream() {
        const head = headRef.current;
        if (!head || status !== "ready") return false;
        await head.streamStart(
          {
            sampleRate: 24000,
            gain: 1,
            lipsyncType: "visemes",
            waitForAudioChunks: true,
            metrics: { enabled: false },
          },
          null,
          () => {
            audioOffsetMsRef.current = 0;
          },
        );
        streamStartedRef.current = true;
        audioOffsetMsRef.current = 0;
        return true;
      },
      beginUtterance() {
        if (!streamStartedRef.current) return;
        headRef.current?.streamInterrupt();
        audioOffsetMsRef.current = 0;
      },
      streamAudio(samples) {
        const head = headRef.current;
        if (!head || !streamStartedRef.current) return false;
        const durationMs = (samples.length / 24000) * 1000;
        const timing = analyzeVisemes(samples, 24000, audioOffsetMsRef.current);
        head.streamAudio({ audio: samples, ...timing });
        audioOffsetMsRef.current += durationMs;
        return true;
      },
      stopStream() {
        if (streamStartedRef.current) headRef.current?.streamStop();
        streamStartedRef.current = false;
        audioOffsetMsRef.current = 0;
      },
    }), [status]);

    return (
      <div className="talking-mentor" data-status={status}>
        <div ref={containerRef} className="talking-mentor-canvas" />
        {status !== "ready" && (
          <div className="talking-mentor-loading">
            {status === "loading" ? "正在载入林老师" : "数字人载入失败"}
          </div>
        )}
      </div>
    );
  },
);
