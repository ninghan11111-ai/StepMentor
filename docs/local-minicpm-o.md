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
