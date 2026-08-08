"use client";

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
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { TalkingMentor, type TalkingMentorHandle } from "@/components/talking-mentor";

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
说话时优先输出完整短句，不要把一句话拆成零碎词组。学生没有说清思路时，用一个方向提示；学生答对时，指出具体正确证据并继续追问。每次只说一到两个短句。
语言要跟随学生和教学内容自然切换。中文讲解时，数字、序号和算式按中文自然口语读出；英语学习、英文术语或学生要求英文时，使用自然英语，不要为了避免英文而生硬翻译。`;

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

function segmentCaption(text: string) {
  const segmenter = new Intl.Segmenter(["zh-CN", "en"], { granularity: "word" });
  const units: string[] = [];

  for (const item of segmenter.segment(text)) {
    const segment = item.segment;
    if (/^[\s\p{P}]+$/u.test(segment) && units.length > 0) {
      units[units.length - 1] += segment;
    } else {
      units.push(segment);
    }
  }

  return units;
}

export default function LiveClassroom() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("offline");
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [forceListen, setForceListen] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [cameraAvailable, setCameraAvailable] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [aecActive, setAecActive] = useState<boolean | null>(null);
  const [queueText, setQueueText] = useState("");
  const [lastReply, setLastReply] = useState("先说说你准备从哪一步开始，我会根据你的思路继续追问。");
  const [errorText, setErrorText] = useState("");
  const [kvTokens, setKvTokens] = useState(0);
  const [avatarLevel, setAvatarLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const talkingMentorRef = useRef<TalkingMentorHandle | null>(null);
  const sessionReadyRef = useRef(false);
  const mutedRef = useRef(false);
  const pausedRef = useRef(false);
  const forceListenRef = useRef(false);
  const cameraEnabledRef = useRef(true);
  const nextPlaybackTimeRef = useRef(0);
  const playbackSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const turnPlaybackStartedRef = useRef(false);
  const speakBufferRef = useRef("");
  const wasListeningRef = useRef(true);
  const captionPendingRef = useRef<string[]>([]);
  const captionDisplayedRef = useRef("");
  const captionTimersRef = useRef<number[]>([]);
  const avatarLevelTimerRef = useRef<number | null>(null);

  const handleAvatarReadyChange = useCallback((ready: boolean) => {
    setAvatarReady(ready);
  }, []);

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

  function clearCaptionTimers() {
    captionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    captionTimersRef.current = [];
  }

  function enqueueCaption(text: string) {
    captionPendingRef.current.push(...segmentCaption(text));
  }

  function takeCaptionGroup() {
    let group = "";
    let visibleLength = 0;

    while (captionPendingRef.current.length > 0) {
      const unit = captionPendingRef.current.shift() ?? "";
      group += unit;
      visibleLength += unit.replace(/\s/gu, "").length;
      if (visibleLength >= 3 || /[.!?。！？，,;]　*$/u.test(unit)) break;
    }

    return group;
  }

  function scheduleCaption(durationMs: number, startDelayMs: number) {
    const slots = Math.max(1, Math.floor(durationMs / 320));
    const interval = durationMs / slots;

    for (let index = 0; index < slots; index += 1) {
      const group = takeCaptionGroup();
      if (!group) break;
      const timer = window.setTimeout(() => {
        captionDisplayedRef.current += group;
        setLastReply(captionDisplayedRef.current.trim());
      }, startDelayMs + index * interval);
      captionTimersRef.current.push(timer);
    }
  }

  function stopAudioPlayback() {
    playbackSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Source may have already ended.
      }
      source.disconnect();
    });
    playbackSourcesRef.current = [];
    if (outputContextRef.current) {
      void outputContextRef.current.close();
      outputContextRef.current = null;
    }
    nextPlaybackTimeRef.current = 0;
    turnPlaybackStartedRef.current = false;
    if (avatarLevelTimerRef.current !== null) window.clearTimeout(avatarLevelTimerRef.current);
    avatarLevelTimerRef.current = null;
    talkingMentorRef.current?.beginUtterance();
    setAvatarLevel(0);
  }

  function playAudioChunk(audioBase64: string) {
    const samples = base64ToFloat32(audioBase64);
    if (samples.length === 0) return;

    let sumSquares = 0;
    for (let index = 0; index < samples.length; index += 1) {
      sumSquares += samples[index] * samples[index];
    }
    const level = Math.min(1, Math.max(0.16, Math.sqrt(sumSquares / samples.length) * 9));
    const durationMs = (samples.length / 24000) * 1000;

    if (talkingMentorRef.current?.streamAudio(samples)) {
      setAvatarLevel(level);
      scheduleCaption(durationMs, 0);
      if (avatarLevelTimerRef.current !== null) window.clearTimeout(avatarLevelTimerRef.current);
      avatarLevelTimerRef.current = window.setTimeout(() => setAvatarLevel(0), durationMs + 80);
      return;
    }

    let outputContext = outputContextRef.current;
    if (!outputContext || outputContext.state === "closed") {
      outputContext = new AudioContext();
      outputContextRef.current = outputContext;
    }

    const audioBuffer = outputContext.createBuffer(1, samples.length, 24000);
    audioBuffer.copyToChannel(samples, 0);

    const source = outputContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outputContext.destination);
    // Buffer once at the start of an utterance. Adding the delay again after
    // every underrun creates a repeating pause on slower local inference.
    const initialDelay = turnPlaybackStartedRef.current ? 0 : 0.1;
    const startAt = Math.max(outputContext.currentTime + initialDelay, nextPlaybackTimeRef.current);
    source.start(startAt);
    turnPlaybackStartedRef.current = true;
    nextPlaybackTimeRef.current = startAt + audioBuffer.duration;
    playbackSourcesRef.current.push(source);
    scheduleCaption(durationMs, Math.max(0, (startAt - outputContext.currentTime) * 1000));

    source.onended = () => {
      playbackSourcesRef.current = playbackSourcesRef.current.filter((item) => item !== source);
      if (playbackSourcesRef.current.length === 0) setAvatarLevel(0);
    };

    window.setTimeout(() => {
      setAvatarLevel(level);
    }, Math.max(0, (startAt - outputContext.currentTime) * 1000));
  }

  async function prepareMicrophone() {
    const audio = {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 360 },
        },
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    }

    mediaStreamRef.current = stream;
    setAecActive(stream.getAudioTracks()[0]?.getSettings().echoCancellation ?? null);
    const hasCamera = stream.getVideoTracks().length > 0;
    setCameraAvailable(hasCamera);
    cameraEnabledRef.current = hasCamera && cameraEnabled;

    if (videoPreviewRef.current && hasCamera) {
      videoPreviewRef.current.srcObject = stream;
      await videoPreviewRef.current.play();
    }

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
      const message: Record<string, unknown> = {
        type: "audio_chunk",
        audio_base64: arrayBufferToBase64(audio.buffer),
        ...(forceListenRef.current ? { force_listen: true } : {}),
      };
      const frame = captureLearningFrame();
      if (frame) message.frame_base64_list = [frame];
      ws.send(JSON.stringify(message));
    };
  }

  function captureLearningFrame() {
    const video = videoPreviewRef.current;
    const canvas = frameCanvasRef.current;
    if (!cameraEnabledRef.current || !video || !canvas || !video.videoWidth || !video.videoHeight) return null;

    const width = Math.min(512, video.videoWidth);
    const height = Math.round(width * (video.videoHeight / video.videoWidth));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.64).split(",")[1] ?? null;
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
      captionPendingRef.current = [];
      captionDisplayedRef.current = "";
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
      if (!isListening && wasListeningRef.current) {
        speakBufferRef.current = "";
        clearCaptionTimers();
        captionPendingRef.current = [];
        captionDisplayedRef.current = "";
        turnPlaybackStartedRef.current = false;
        nextPlaybackTimeRef.current = 0;
        talkingMentorRef.current?.beginUtterance();
      }
      if (message.text) {
        speakBufferRef.current += message.text;
        enqueueCaption(message.text);
      }
      wasListeningRef.current = isListening;
      if (message.audio_data) playAudioChunk(message.audio_data);
      if (isListening) {
        setAvatarLevel(0);
      }
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
      const avatarStreaming = await talkingMentorRef.current?.startStream();
      if (!avatarStreaming) {
        const outputContext = new AudioContext();
        await outputContext.resume();
        outputContextRef.current = outputContext;
      }

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
          max_slice_nums: 1,
          deferred_finalize: true,
          config: {
            generate_audio: true,
            chunk_ms: 1000,
            sample_rate: 16000,
            force_listen_count: 0,
            max_new_speak_tokens_per_chunk: 24,
            length_penalty: 1,
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
    if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
    setCameraAvailable(false);
    setAecActive(null);
    void inputContextRef.current?.close();
    inputContextRef.current = null;
    talkingMentorRef.current?.stopStream();
    clearCaptionTimers();
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

  function toggleCamera() {
    const next = !cameraEnabled;
    setCameraEnabled(next);
    cameraEnabledRef.current = next;
    mediaStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
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
        <div
          className={`mentor-stage ${sessionState === "speaking" ? "is-speaking" : ""}`}
          style={{ "--avatar-level": avatarLevel.toFixed(2) } as CSSProperties & Record<"--avatar-level", string>}
        >
          <TalkingMentor ref={talkingMentorRef} onReadyChange={handleAvatarReadyChange} />
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
          <div className={`learning-camera ${cameraEnabled && cameraAvailable ? "is-live" : ""}`}>
            <video ref={videoPreviewRef} muted playsInline aria-label="学习场景实时画面" />
            <canvas ref={frameCanvasRef} aria-hidden="true" />
            <span>{cameraEnabled && cameraAvailable ? "场景理解 · 1 FPS" : "摄像头未开启"}</span>
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
            <div>
              <span>数字人</span>
              <strong>{avatarReady ? "林老师素材" : "载入中"}</strong>
            </div>
            <div>
              <span>AEC</span>
              <strong>{aecActive === null ? "待检测" : aecActive ? "已启用" : "未启用"}</strong>
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
            <button type="button" className={cameraEnabled ? "is-active" : ""} onClick={toggleCamera} disabled={!cameraAvailable} title={cameraEnabled ? "关闭学习场景摄像头" : "开启学习场景摄像头"}>
              {cameraEnabled ? <Video size={19} /> : <VideoOff size={19} />}
              <span>{cameraEnabled ? "场景开启" : "场景关闭"}</span>
            </button>
          </div>

          {sessionActive ? (
            <button className="call-button stop" type="button" onClick={() => stopSession()}>
              <PhoneOff size={20} />
              结束对话
            </button>
          ) : (
            <button className="call-button" type="button" onClick={startSession} disabled={!runtime?.online || !avatarReady}>
              <Phone size={20} />
              {avatarReady ? "开始实时对话" : "正在载入数字人"}
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
