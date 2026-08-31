# MiniCPM-o 4.5 本地部署

这套本地运行方式面向 Apple Silicon Mac，使用 `llama.cpp-omni` 的 Metal 后端和官方 Comni 网关。模型、编译产物和 Python 环境都放在 StepMentor 仓库外，避免把数 GB 权重提交到 Git。

## 当前目录约定

```text
升腾竞赛/
├── stepmentor/
├── runtime/
│   ├── llama.cpp-omni/
│   └── MiniCPM-o-Demo/
└── models/
    └── MiniCPM-o-4_5-gguf/
```

默认使用 `MiniCPM-o-4_5-Q4_K_M.gguf`，端口如下：

| 服务 | 端口 | 用途 |
| --- | ---: | --- |
| Gateway | 8040 | 浏览器页面和 WebSocket 接口 |
| Worker | 22440 | Python 推理适配层 |
| llama-server | 19080 | Metal C++ 推理进程 |

## 启停

首次在 Apple Silicon Mac 上安装时执行：

```bash
npm run local:omni:setup
```

脚本固定下载 `feat/web-demo` 和 `Comni` 两个官方分支，编译 Metal 后端，并选择性下载约 9GB 的 Q4_K_M 全模态权重。它使用 C++ Gateway 所需的最小 Python 依赖集合，绕开官方安装脚本在 macOS Python 3.12 上无法解析 `eva-decord` 的问题。

首次启动会加载全部视觉、语音和 TTS 模块，耗时取决于机器内存和磁盘速度。

```bash
npm run local:omni:start
npm run local:omni:check
npm run local:omni:stop
```

服务正常后访问：

- `http://127.0.0.1:8040/audio_duplex`：纯语音全双工页面
- `http://127.0.0.1:8040/omni`：摄像头、语音全双工页面
- `http://127.0.0.1:8040/docs`：Gateway API 文档

本地脚本绕开了官方 `start_all.sh` 对 `nvidia-smi` 的依赖，固定启动一个 Metal Worker。模型接口仍然经过 Gateway，后续迁移到昇腾环境时，StepMentor 前端只需替换 `MINICPM_REALTIME_URL`，不用重做浏览器音频协议和数字人界面。

## 环境变量

默认路径适用于当前工作区。需要移动目录时可覆盖：

```bash
MINICPM_DEMO_DIR=/path/to/MiniCPM-o-Demo \
MINICPM_LLAMACPP_DIR=/path/to/llama.cpp-omni \
MINICPM_MODEL_DIR=/path/to/MiniCPM-o-4_5-gguf \
npm run local:omni:start
```

StepMentor 开发服务通过以下配置探测本地 Gateway：

```env
MINICPM_REALTIME_URL=http://127.0.0.1:8040
```

## 硬件边界

16GB Apple Silicon 可以尝试 Q4_K_M 全模态推理，但全双工实时性没有保证。若持续出现内存压力或音频生成明显落后，优先使用半双工页面完成产品开发，并把竞赛最终的全双工性能验证放到官方昇腾环境。

## 云端接入

StepMentor 的 `/live` 页面连接的是 MiniCPM-o Comni Gateway 的双工 WebSocket：

```text
GET  {MINICPM_REALTIME_URL}/health
WS   {MINICPM_REALTIME_URL}/ws/duplex/{session_id}
```

云端必须跑完整的 Gateway + Worker + MiniCPM-o 后端，而不是只跑静态推理脚本。先在云端验证：

```bash
curl http://127.0.0.1:<gateway-port>/health
curl http://127.0.0.1:<gateway-port>/workers
```

开发阶段建议先用 SSH 隧道，不暴露公网端口：

```bash
ssh -N -L 8040:127.0.0.1:<gateway-port> <user>@<server-ip>
```

然后本地 `.env.local` 保持：

```env
MINICPM_REALTIME_URL=http://127.0.0.1:8040
MINICPM_REALTIME_LABEL=Cloud Ascend MiniCPM-o 4.5
```

若直接给浏览器访问云端 Gateway，需要有效 HTTPS/WSS。公网 HTTP 或自签名 WSS 可能导致浏览器拒绝麦克风、摄像头或 WebSocket。

## 实时双工参数

当前前端按 16kHz、float32、单声道发送音频，模型 chunk 对齐为 500ms：

```text
sample_rate=16000
chunk_ms=500
capture_chunk_samples=8000
```

官方双工 schema 的默认 chunk 是 1000ms，最小值是 100ms。40ms 到 100ms 的小包更适合做网关层 Gate VAD 和抢断检测，不建议直接逐包喂给 MiniCPM-o 生成，否则每秒推理次数过高，反而增加卡顿。

## 卡点监测边界

页面已持续上传学习场景视频帧，并在学生连续 3 分钟无明显语音输入时触发一次高优先级视觉检查。官方 `audio_chunk` 协议目前只稳定支持音频、视频帧和 `force_listen`，不支持把“学生卡住 3 分钟”这类文本事件直接注入双工上下文。

最终版本建议在云端 Gateway 增加一个 StepMentor adapter：

```text
Browser -> StepMentor Gateway Adapter -> Official MiniCPM-o Gateway/Worker
```

Adapter 负责三件事：

- Gate VAD：20ms 到 40ms 小窗检测打断，只用于 clear buffer 和 force listen。
- Progress Event：把 3 分钟无进展、画面相似、草稿未变化等事件转成 MiniCPM-o 可理解的上下文。
- Metrics：记录首字延迟、首音频延迟、wall clock、LLM/TTS 耗时、丢 chunk 数和视觉 token 数。
