"use client";

import {
  BookOpenCheck,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  FileImage,
  Lightbulb,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  SquarePen,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

type Message = {
  id: number;
  role: "coach" | "student";
  text: string;
  label?: string;
};

type CoachResponse = {
  message: string;
  diagnosis: string;
  nextStage: number;
  mode: "demo" | "minicpm";
};

type SpeechRecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const initialMessages: Message[] = [
  {
    id: 1,
    role: "coach",
    label: "目标确认",
    text: "先不公布答案。要同时找到顶点和与 x 轴的交点，你觉得应该先把函数改写成哪种形式？",
  },
];

const quickAnswers = [
  ["先配方", "我不知道第一步"],
  ["顶点是 (2, -1)", "为什么要加 4 再减 4？"],
  ["令 y = 0，再因式分解", "交点怎么判断？"],
  ["给我一道相似题", "生成本题学习卡"],
];

const hintCopy = [
  "方向提示：顶点信息通常藏在 y = a(x-h)²+k 中。先看 x²-4x 可以怎样凑成完全平方。",
  "条件提示：x²-4x = (x-2)²-4。别忘了再加上原式中的常数 3。",
  "关键一步：原式可写成 y = (x-2)²-1。现在从 h、k 读出顶点，再令 y=0 求交点。",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [answer, setAnswer] = useState("");
  const [stage, setStage] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [problemImage, setProblemImage] = useState<string | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<"demo" | "minicpm">("demo");
  const [notice, setNotice] = useState("");
  const [reportGenerated, setReportGenerated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const progress = Math.min(32 + stage * 21, 95);
  const currentQuickAnswers = quickAnswers[Math.min(stage, quickAnswers.length - 1)];

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isThinking]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProblemImage(reader.result);
        showNotice("题目图片已载入");
      }
    };
    reader.readAsDataURL(file);
  }

  async function toggleCamera() {
    if (cameraOpen) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraOpen(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      window.requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch {
      showNotice("无法打开摄像头，请检查浏览器权限");
    }
  }

  function captureProblem() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setProblemImage(canvas.toDataURL("image/jpeg", 0.86));
    toggleCamera();
    showNotice("题目已拍摄");
  }

  function toggleVoiceInput() {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition =
      browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;

    if (!Recognition) {
      showNotice("当前浏览器不支持语音识别，请使用文字输入");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      setAnswer(event.results[0][0].transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      showNotice("没有听清，请再说一次");
    };
    recognition.start();
    setIsListening(true);
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.96;
    window.speechSynthesis.speak(utterance);
  }

  async function submitAnswer(text?: string) {
    const studentAnswer = (text ?? answer).trim();
    if (!studentAnswer || isThinking) return;

    setAnswer("");
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "student", text: studentAnswer },
    ]);
    setIsThinking(true);

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answer: studentAnswer,
          stage,
          problem:
            "已知二次函数 y=x²-4x+3，求抛物线顶点及其与 x 轴的交点。",
          image: problemImage,
        }),
      });
      if (!response.ok) throw new Error("coach request failed");

      const result = (await response.json()) as CoachResponse;
      setRuntimeMode(result.mode);
      setStage(result.nextStage);
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "coach",
          label: result.diagnosis,
          text: result.message,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "coach",
          label: "连接提示",
          text: "模型服务暂时没有响应。你可以继续写出 x²-4x 的配方结果，我会从这一步接着判断。",
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submitAnswer();
  }

  function requestHint(level: number) {
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: "coach",
        label: `第 ${level} 级提示`,
        text: hintCopy[level - 1],
      },
    ]);
  }

  function resetSession() {
    setMessages(initialMessages);
    setStage(0);
    setAnswer("");
    setReportGenerated(false);
    showNotice("本轮学习已重置");
  }

  function generateReport() {
    setReportGenerated(true);
    showNotice("学习卡已生成");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={18} strokeWidth={2.4} />
          </div>
          <div>
            <strong>StepMentor</strong>
            <span>多模态苏格拉底学习教练</span>
          </div>
        </div>

        <div className="topbar-actions">
          <span className={`mode-badge ${runtimeMode === "minicpm" ? "is-live" : ""}`}>
            <span className="status-dot" />
            {runtimeMode === "minicpm" ? "MiniCPM-o 在线" : "演示模式"}
          </span>
          <button className="icon-button" type="button" onClick={resetSession} title="重新开始" aria-label="重新开始">
            <RotateCcw size={17} />
          </button>
        </div>
      </header>

      <section className="workspace" aria-label="学习陪练工作台">
        <aside className="panel problem-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">01 · 题目</span>
              <h1>当前练习</h1>
            </div>
            <span className="subject-tag">高中数学</span>
          </div>

          <div className="problem-stage">
            {cameraOpen ? (
              <div className="camera-frame">
                <video ref={videoRef} autoPlay muted playsInline />
                <div className="camera-controls">
                  <button className="capture-button" type="button" onClick={captureProblem} aria-label="拍摄题目">
                    <span />
                  </button>
                  <button className="camera-close" type="button" onClick={toggleCamera} aria-label="关闭摄像头">
                    <X size={17} />
                  </button>
                </div>
              </div>
            ) : problemImage ? (
              <div className="image-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={problemImage} alt="用户上传的题目" />
                <button className="image-remove" type="button" onClick={() => setProblemImage(null)} aria-label="移除图片">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="sample-problem">
                <div className="paper-meta">
                  <span>示例题</span>
                  <span>二次函数</span>
                </div>
                <p>已知二次函数</p>
                <div className="formula">y = x² − 4x + 3</div>
                <p>求抛物线的顶点，以及它与 x 轴的交点。</p>
                <div className="paper-rule" />
                <div className="draft-line">解：</div>
              </div>
            )}
          </div>

          <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" onChange={handleFile} />
          <div className="source-actions">
            <button type="button" className="tool-button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              上传题目
            </button>
            <button type="button" className="tool-button" onClick={toggleCamera}>
              <Camera size={16} />
              拍摄题目
            </button>
          </div>

          <div className="recognition-block">
            <div className="recognition-title">
              <FileImage size={16} />
              <span>题目识别</span>
              <span className="recognition-state"><Check size={13} /> 已完成</span>
            </div>
            <dl>
              <div><dt>知识点</dt><dd>二次函数 · 配方法</dd></div>
              <div><dt>任务</dt><dd>顶点与零点</dd></div>
              <div><dt>难度</dt><dd>基础</dd></div>
            </dl>
          </div>
        </aside>

        <section className="panel coach-panel">
          <div className="coach-heading">
            <div>
              <span className="eyebrow">02 · 陪练</span>
              <h2>一步一步推出来</h2>
            </div>
            <div className="progress-compact" aria-label={`当前理解度 ${progress}%`}>
              <span>理解度</span>
              <strong>{progress}%</strong>
            </div>
          </div>

          <div className="dialogue" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <div className="message-avatar" aria-hidden="true">
                  {message.role === "coach" ? <Sparkles size={16} /> : "你"}
                </div>
                <div className="message-content">
                  {message.label && <span className="message-label">{message.label}</span>}
                  <p>{message.text}</p>
                  {message.role === "coach" && (
                    <button className="speak-button" type="button" onClick={() => speak(message.text)} aria-label="朗读这条回复" title="朗读">
                      <Volume2 size={15} />
                    </button>
                  )}
                </div>
              </article>
            ))}
            {isThinking && (
              <div className="thinking" role="status">
                <span /><span /><span />
                正在判断你的思路
              </div>
            )}
            <div ref={messageEndRef} />
          </div>

          <div className="quick-row">
            {currentQuickAnswers.map((item) => (
              <button key={item} type="button" onClick={() => submitAnswer(item)}>{item}</button>
            ))}
          </div>

          <div className="hint-ladder" aria-label="分级提示">
            <span><Lightbulb size={15} />需要提示</span>
            {[1, 2, 3].map((level) => (
              <button key={level} type="button" onClick={() => requestHint(level)} title={`第 ${level} 级提示`}>
                {level}
              </button>
            ))}
          </div>

          <form className="answer-box" onSubmit={handleSubmit}>
            <button className={`voice-button ${isListening ? "is-listening" : ""}`} type="button" onClick={toggleVoiceInput} aria-label={isListening ? "停止语音输入" : "开始语音输入"} title="语音输入">
              {isListening ? <MicOff size={19} /> : <Mic size={19} />}
            </button>
            <input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={isListening ? "正在听你说…" : "说出你的下一步思路"} aria-label="输入解题思路" />
            <button className="send-button" type="submit" disabled={!answer.trim() || isThinking} aria-label="发送">
              <Send size={18} />
            </button>
          </form>
        </section>

        <aside className="panel insight-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">03 · 诊断</span>
              <h2>学习状态</h2>
            </div>
          </div>

          <div className="mastery-meter">
            <div className="mastery-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
              <strong>{progress}</strong><span>%</span>
            </div>
            <div>
              <span>本题掌握度</span>
              <strong>{stage >= 3 ? "已形成完整思路" : stage >= 1 ? "正在建立方法" : "等待关键步骤"}</strong>
            </div>
          </div>

          <div className="diagnosis-list">
            <div className="diagnosis-item">
              <span className="diagnosis-icon green"><BookOpenCheck size={16} /></span>
              <div><span>已识别</span><strong>二次函数配方法</strong></div>
            </div>
            <div className="diagnosis-item">
              <span className="diagnosis-icon amber"><CircleHelp size={16} /></span>
              <div><span>当前卡点</span><strong>{stage >= 2 ? "零点与交点关系" : "完全平方的常数补偿"}</strong></div>
            </div>
            <div className="diagnosis-item">
              <span className="diagnosis-icon blue"><SquarePen size={16} /></span>
              <div><span>过程证据</span><strong>{Math.max(1, messages.filter((item) => item.role === "student").length)} 个有效步骤</strong></div>
            </div>
          </div>

          <div className={`learning-card ${reportGenerated || stage >= 3 ? "is-ready" : ""}`}>
            <div className="learning-card-heading">
              <span><Sparkles size={15} />本轮学习卡</span>
              {(reportGenerated || stage >= 3) && <Check size={16} />}
            </div>
            <div className="learning-summary">
              <span>方法</span>
              <p>配方读顶点，令 y=0 求交点。</p>
            </div>
            <div className="learning-summary">
              <span>易错点</span>
              <p>凑完全平方后，需要补偿常数项。</p>
            </div>
            <div className="similar-question">
              <span>相似练习</span>
              <p>y = x² − 6x + 5</p>
              <ChevronRight size={16} />
            </div>
          </div>

          <button className="report-button" type="button" onClick={generateReport}>
            <BookOpenCheck size={17} />
            生成学习卡
          </button>
        </aside>
      </section>

      <div className={`toast ${notice ? "is-visible" : ""}`} role="status">
        <Check size={15} />{notice}
      </div>
    </main>
  );
}
