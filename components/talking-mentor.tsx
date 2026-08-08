"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";

export type TalkingMentorHandle = {
  beginUtterance: () => void;
  startStream: () => Promise<boolean>;
  stopStream: () => void;
  streamAudio: (samples: Float32Array) => boolean;
};

type TalkingMentorProps = {
  onReadyChange?: (ready: boolean) => void;
};

type PlaybackSource = {
  source: AudioBufferSourceNode;
  startAt: number;
  durationMs: number;
};

function getAudioLevel(samples: Float32Array) {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    sumSquares += samples[index] * samples[index];
  }
  return Math.min(1, Math.max(0.08, Math.sqrt(sumSquares / samples.length) * 8));
}

export const TalkingMentor = forwardRef<TalkingMentorHandle, TalkingMentorProps>(
  function TalkingMentor({ onReadyChange }, ref) {
    const outputContextRef = useRef<AudioContext | null>(null);
    const nextPlaybackTimeRef = useRef(0);
    const sourcesRef = useRef<PlaybackSource[]>([]);
    const timersRef = useRef<number[]>([]);
    const streamStartedRef = useRef(false);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [level, setLevel] = useState(0);

    useEffect(() => {
      return () => {
        onReadyChange?.(false);
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
        timersRef.current = [];
        sourcesRef.current.forEach(({ source }) => {
          try {
            source.stop();
          } catch {
            // Source may have already ended.
          }
          source.disconnect();
        });
        sourcesRef.current = [];
        if (outputContextRef.current) void outputContextRef.current.close();
      };
    }, [onReadyChange]);

    function resetPlayback() {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
      sourcesRef.current.forEach(({ source }) => {
        try {
          source.stop();
        } catch {
          // Source may have already ended.
        }
        source.disconnect();
      });
      sourcesRef.current = [];
      nextPlaybackTimeRef.current = 0;
      setLevel(0);
    }

    useImperativeHandle(ref, () => ({
      async startStream() {
        if (status !== "ready") return false;
        let outputContext = outputContextRef.current;
        if (!outputContext || outputContext.state === "closed") {
          outputContext = new AudioContext({ sampleRate: 24000 });
          outputContextRef.current = outputContext;
        }
        await outputContext.resume();
        streamStartedRef.current = true;
        nextPlaybackTimeRef.current = outputContext.currentTime + 0.04;
        return true;
      },
      beginUtterance() {
        if (!streamStartedRef.current) return;
        resetPlayback();
      },
      streamAudio(samples) {
        if (!streamStartedRef.current || status !== "ready" || samples.length === 0) return false;

        let outputContext = outputContextRef.current;
        if (!outputContext || outputContext.state === "closed") {
          outputContext = new AudioContext({ sampleRate: 24000 });
          outputContextRef.current = outputContext;
        }

        const audioBuffer = outputContext.createBuffer(1, samples.length, 24000);
        audioBuffer.copyToChannel(samples, 0);

        const source = outputContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(outputContext.destination);

        const startAt = Math.max(outputContext.currentTime + 0.02, nextPlaybackTimeRef.current);
        source.start(startAt);
        nextPlaybackTimeRef.current = startAt + audioBuffer.duration;

        const durationMs = audioBuffer.duration * 1000;
        const startDelayMs = Math.max(0, (startAt - outputContext.currentTime) * 1000);
        const levelValue = getAudioLevel(samples);
        const sourceRecord = { source, startAt, durationMs };
        sourcesRef.current.push(sourceRecord);

        const startTimer = window.setTimeout(() => setLevel(levelValue), startDelayMs);
        const endTimer = window.setTimeout(() => setLevel(0), startDelayMs + durationMs + 60);
        timersRef.current.push(startTimer, endTimer);

        source.onended = () => {
          source.disconnect();
          sourcesRef.current = sourcesRef.current.filter((item) => item !== sourceRecord);
          if (sourcesRef.current.length === 0) setLevel(0);
        };

        return true;
      },
      stopStream() {
        resetPlayback();
        streamStartedRef.current = false;
        if (outputContextRef.current) {
          void outputContextRef.current.close();
          outputContextRef.current = null;
        }
      },
    }), [status]);

    return (
      <div
        className="talking-mentor"
        data-status={status}
        style={{ "--mentor-level": level.toFixed(2) } as CSSProperties & Record<"--mentor-level", string>}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- vinext dev image optimizer cannot serve local public assets here. */}
        <img
          className="talking-mentor-portrait"
          src="/digital-mentor-lin.jpg"
          alt="林老师"
          onLoad={() => {
            setStatus("ready");
            onReadyChange?.(true);
          }}
          onError={() => {
            setStatus("error");
            onReadyChange?.(false);
          }}
        />
        <div className="talking-mentor-face" aria-hidden="true" />
        <div className="talking-mentor-mouth" aria-hidden="true" />
        {status !== "ready" && (
          <div className="talking-mentor-loading">
            {status === "loading" ? "正在载入林老师" : "林老师形象载入失败"}
          </div>
        )}
      </div>
    );
  },
);
