"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  Ear,
  ExternalLink,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Radio,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type SessionState =
  | "offline"
  | "connecting"
  | "preparing"
  | "listening"
  | "speaking"
  | "paused"
  | "error";

type RuntimeStatus = {
  configured: boolean;
  online: boolean;
  gatewayUrl?: string;
  demoUrl?: string;
};

type ServerMessage = {
  type: string;
  position?: number;
  estimated_wait_s?: number;
  error?: string;
  text?: string;
  is_listen?: boolean;
  audio_data?: string;
  kv_cache_length?: number;
};

const stateCopy: Record<SessionState, string> = {
  offline: "等待连接",
  connecting: "正在连接本地引擎",
  preparing: "正在准备会话",
  listening: "林老师正在听",
  speaking: "林老师正在讲解",
  paused: "会话已暂停",
  error: "连接异常",
};

const teacherPrompt = `你是 StepMentor 的林老师，一名高中数学苏格拉底学习教练。
你需要用自然、简短的中文与学生实时交流。不要直接公布完整答案，先判断学生卡点，再提出一个具体问题，引导学生说出下一步。
当学生没有说清思路时，用一个方向提示；当学生答对时，指出具体正确证据并继续追问。每次回复控制在两句话以内。`;

function arrayBufferToBase64(buffer: ArrayBufferLike) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

function base64ToFloat32(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Float32Array(bytes.buffer);
}

export default function LiveClassroom() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("offline");
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [forceListen, setForceListen] = useState(false);
  const [queueText, setQueueText] = useState("");
  const [lastReply, setLastReply] = useState("先说说你准备从哪一步开始，我会根据你的思路继续追问。");
  const [errorText, setErrorText] = useState("");
  const [kvTokens, setKvTokens] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | null>(null);
  const sessionReadyRef = useRef(false);
  const mutedRef = useRef(false);
  const pausedRef = useRef(false);
  const forceListenRef = useRef(false);
  const nextPlaybackTimeRef = useRef(0);
  const speakBufferRef = useRef("");
  const wasListeningRef = useRef(true);

  useEffect(() => {
    fetch("/api/runtime", { cache: "no-store" })
      .then((response) => response.json() as Promise<RuntimeStatus>)
      .then(setRuntime)
      .catch(() => setRuntime({ configured: false, online: false }));

    return () => {
      sessionReadyRef.current = false;
      wsRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      captureNodeRef.current?.disconnect();
      void inputContextRef.current?.close();
      void outputContextRef.current?.close();
    };
  }, []);

  function stopAudioPlayback() {
    if (outputContextRef.current) {
      void outputContextRef.current.close();
      outputContextRef.current = null;
    }
    nextPlaybackTimeRef.current = 0;
  }

  function playAudioChunk(audioBase64: string) {
    let outputContext = outputContextRef.current;
    if (!outputContext || outputContext.state === "closed") {
      outputContext = new AudioContext();
      outputContextRef.current = outputContext;
    }

    const samples = base64ToFloat32(audioBase64);
    if (samples.length === 0) return;
    const audioBuffer = outputContext.createBuffer(1, samples.length, 24000);
    audioBuffer.copyToChannel(samples, 0);

    const source = outputContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outputContext.destination);
    const startAt = Math.max(outputContext.currentTime + 0.04, nextPlaybackTimeRef.current);
    source.start(startAt);
    nextPlaybackTimeRef.current = startAt + audioBuffer.duration;
  }

  async function prepareMicrophone() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    mediaStreamRef.current = stream;

    const context = new AudioContext({ sampleRate: 16000 });
    inputContextRef.current = context;
    await context.audioWorklet.addModule("/capture-processor.js");
    await context.resume();

    const source = context.createMediaStreamSource(stream);
    const captureNode = new AudioWorkletNode(context, "stepmentor-capture", {
      processorOptions: { chunkSize: 16000 },
    });
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    source.connect(captureNode);
    captureNode.connect(silentGain);
    silentGain.connect(context.destination);
    captureNodeRef.current = captureNode;

    captureNode.port.onmessage = (event: MessageEvent<{ type: string; audio: Float32Array }>) => {
      const ws = wsRef.current;
      if (event.data.type !== "chunk" || !sessionReadyRef.current || pausedRef.current || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const sourceAudio = event.data.audio;
      const audio = mutedRef.current ? new Float32Array(sourceAudio.length) : sourceAudio;
      ws.send(JSON.stringify({
        type: "audio_chunk",
        audio_base64: arrayBufferToBase64(audio.buffer),
        ...(forceListenRef.current ? { force_listen: true } : {}),
      }));
    };
  }

  function handleServerMessage(message: ServerMessage) {
    if (message.type === "queued" || message.type === "queue_update") {
      const seconds = Math.max(0, Math.round(message.estimated_wait_s ?? 0));
      setQueueText(`当前排队第 ${message.position ?? 1} 位，预计 ${seconds} 秒`);
      return;
    }

    if (message.type === "queue_done") {
      setQueueText("");
      setSessionState("preparing");
      return;
    }

    if (message.type === "prepared") {
      sessionReadyRef.current = true;
      speakBufferRef.current = "";
      wasListeningRef.current = true;
      setSessionState("listening");
      return;
    }

    if (message.type === "audio_only" && message.audio_data) {
      setSessionState("speaking");
      playAudioChunk(message.audio_data);
      return;
    }

    if (message.type === "result") {
      const isListening = message.is_listen ?? true;
      setSessionState(isListening ? "listening" : "speaking");
      if (!isListening && wasListeningRef.current) speakBufferRef.current = "";
      if (message.text) {
        speakBufferRef.current += message.text;
        setLastReply(speakBufferRef.current.trim());
      }
      wasListeningRef.current = isListening;
      if (message.audio_data) playAudioChunk(message.audio_data);
      if (message.kv_cache_length) setKvTokens(message.kv_cache_length);
      return;
    }

    if (message.type === "paused") {
      setSessionState("paused");
      return;
    }

    if (message.type === "resumed") {
      setSessionState("listening");
      return;
    }

    if (message.type === "error") {
      setErrorText(message.error ?? "实时服务返回错误");
      setSessionState("error");
    }
  }

  async function startSession() {
    if (!runtime?.online || !runtime.gatewayUrl) {
      setErrorText("本地 MiniCPM-o Gateway 未启动");
      setSessionState("error");
      return;
    }

    setErrorText("");
    setQueueText("");
    setSessionState("connecting");

    try {
      await prepareMicrophone();
      const outputContext = new AudioContext();
      await outputContext.resume();
      outputContextRef.current = outputContext;

      const gateway = new URL(runtime.gatewayUrl);
      const wsProtocol = gateway.protocol === "https:" ? "wss:" : "ws:";
      const sessionId = `adx_stepmentor_${Date.now().toString(36)}`;
      const ws = new WebSocket(`${wsProtocol}//${gateway.host}/ws/duplex/${sessionId}`);
      wsRef.current = ws;
      let connectionFailed = false;

      let prepareSent = false;
      const sendPrepare = () => {
        if (prepareSent || ws.readyState !== WebSocket.OPEN) return;
        prepareSent = true;
        ws.send(JSON.stringify({
          type: "prepare",
          system_prompt: teacherPrompt,
          config: {
            generate_audio: true,
            chunk_ms: 1000,
            sample_rate: 16000,
            force_listen_count: 3,
            max_new_speak_tokens_per_chunk: 20,
            length_penalty: 1.05,
          },
        }));
      };

      ws.onopen = () => {
        setSessionState("preparing");
        window.setTimeout(sendPrepare, 120);
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as ServerMessage;
        if (message.type === "queue_done") sendPrepare();
        handleServerMessage(message);
      };
      ws.onerror = () => {
        connectionFailed = true;
        setErrorText("WebSocket 连接失败，请检查本地服务");
        setSessionState("error");
      };
      ws.onclose = () => {
        sessionReadyRef.current = false;
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        if (!connectionFailed) setSessionState("offline");
      };
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "无法打开麦克风");
      setSessionState("error");
      stopSession(false);
    }
  }

  function stopSession(sendStop = true) {
    sessionReadyRef.current = false;
    const ws = wsRef.current;
    if (sendStop && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "stop" }));
    }
    ws?.close();
    wsRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    captureNodeRef.current?.disconnect();
    captureNodeRef.current = null;
    void inputContextRef.current?.close();
    inputContextRef.current = null;
    stopAudioPlayback();
    setPaused(false);
    pausedRef.current = false;
    setForceListen(false);
    forceListenRef.current = false;
    if (sendStop) setSessionState("offline");
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
  }

  function togglePause() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const next = !paused;
    setPaused(next);
    pausedRef.current = next;
    ws.send(JSON.stringify({ type: next ? "pause" : "resume" }));
  }

  function toggleForceListen() {
    const next = !forceListen;
    setForceListen(next);
    forceListenRef.current = next;
    if (next) stopAudioPlayback();
  }

  const sessionActive = ["connecting", "preparing", "listening", "speaking", "paused"].includes(sessionState);

  return (
    <main className="live-shell">
      <header className="live-topbar">
        <Link href="/" className="live-back-link">
          <ArrowLeft size={17} />
          返回学习台
        </Link>
        <div className="live-title">
          <strong>StepMentor 实时课堂</strong>
          <span>MiniCPM-o 4.5 · 本地双工引擎</span>
        </div>
        <span className={`live-runtime ${runtime?.online ? "is-online" : ""}`}>
          <span />
          {runtime?.online ? "引擎在线" : "引擎离线"}
        </span>
      </header>

      <section className="live-workspace">
        <div className={`mentor-stage ${sessionState === "speaking" ? "is-speaking" : ""}`}>
          <img
            src="/digital-mentor-lin.jpg"
            alt="StepMentor 数字教师林老师"
          />
          <div className="mentor-stage-shade" />
          <div className="mentor-status">
            <div className="mentor-identity">
              <span>AI 学习教练</span>
              <strong>林老师</strong>
            </div>
            <div className="voice-indicator" aria-label={stateCopy[sessionState]}>
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="mentor-caption" aria-live="polite">
            <span>{stateCopy[sessionState]}</span>
            <p>{queueText || errorText || lastReply}</p>
          </div>
        </div>

        <aside className="live-console" aria-label="实时会话控制">
          <div className="live-console-heading">
            <span className="eyebrow">实时会话</span>
            <h1>双工语音陪练</h1>
            <p>直接说出你的思路。模型会持续听取，并在判断到卡点时开口追问。</p>
          </div>

          <div className="live-state-row">
            <div className={`live-state-icon state-${sessionState}`}>
              {sessionState === "speaking" ? <Volume2 size={19} /> : <Radio size={19} />}
            </div>
            <div>
              <span>当前状态</span>
              <strong>{stateCopy[sessionState]}</strong>
            </div>
          </div>

          <div className="live-metrics">
            <div>
              <span>模型</span>
              <strong>Q4_K_M</strong>
            </div>
            <div>
              <span>上下文</span>
              <strong>{kvTokens > 0 ? kvTokens.toLocaleString() : "4,096"}</strong>
            </div>
          </div>

          <div className="live-controls">
            <button type="button" className={muted ? "is-active" : ""} onClick={toggleMute} disabled={!sessionActive} title={muted ? "打开麦克风" : "静音"}>
              {muted ? <MicOff size={19} /> : <Mic size={19} />}
              <span>{muted ? "已静音" : "麦克风"}</span>
            </button>
            <button type="button" className={paused ? "is-active" : ""} onClick={togglePause} disabled={!sessionReadyRef.current} title={paused ? "继续会话" : "暂停会话"}>
              {paused ? <Play size={19} /> : <Pause size={19} />}
              <span>{paused ? "继续" : "暂停"}</span>
            </button>
            <button type="button" className={forceListen ? "is-active" : ""} onClick={toggleForceListen} disabled={!sessionReadyRef.current} title="让模型只听不说">
              <Ear size={19} />
              <span>只听</span>
            </button>
          </div>

          {sessionActive ? (
            <button className="call-button stop" type="button" onClick={() => stopSession()}>
              <PhoneOff size={20} />
              结束对话
            </button>
          ) : (
            <button className="call-button" type="button" onClick={startSession} disabled={!runtime?.online}>
              <Phone size={20} />
              开始实时对话
            </button>
          )}

          {runtime?.demoUrl ? (
            <a className="official-demo-link" href={runtime.demoUrl} target="_blank" rel="noreferrer">
              打开官方诊断页
              <ExternalLink size={14} />
            </a>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
