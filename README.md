# StepMentor

StepMentor 是一个面向高中数学学习场景的苏格拉底式 AI 教练 Demo。项目基于
MiniCPM-o 4.5，目标不是直接公布答案，而是结合题目、学生当前步骤和实时语音，
每次只指出一个可观察到的卡点，再提出一个推动学生继续思考的问题。

> 当前仓库是竞赛演示版本，不是已经完成的教学产品。无需模型即可体验固定题目的
> 确定性流程；真实图像理解和实时全双工对话需要另行启动 MiniCPM-o 服务。

## 当前功能状态

| 功能 | 当前状态 | 说明 |
| --- | --- | --- |
| 分阶段苏格拉底追问 | 可用 | `/` 页面支持文字回答、快捷回答和三级提示；无模型时使用固定演示流程 |
| MiniCPM-o 单轮教练 | 可接入 | `/api/coach` 调用 OpenAI-compatible `/v1/chat/completions`，失败时自动回退演示模式 |
| 上传或拍摄题目 | 前端可用 | 图片以 data URL 传给已配置的多模态模型；演示模式不会真正识别图片 |
| 普通语音输入与朗读 | 浏览器能力 | 首页使用 Web Speech API 单次听写和 Speech Synthesis，不属于全双工 |
| 实时全双工课堂 | 需要 Gateway | `/live` 持续发送麦克风音频，接收 MiniCPM-o 流式文字与语音，并支持暂停、静音和只听模式 |
| 学习场景视频 | 实验性 | 双工会话可附带低分辨率摄像头帧；是否被模型正确理解取决于 Comni/模型运行时 |
| 数字教师 | 可用 | 使用林老师固定形象，根据返回音频能量驱动轻量面部和嘴部动画，不是 3D 数字人 |
| 学习状态与学习卡 | 演示数据 | 当前由对话阶段驱动，用于展示交互结构，不代表经过模型验证的理解度评估 |
| 3 分钟卡点检查 | 实验性 | 根据麦克风音量判断长时间无明显语音，并发送静音音频和当前画面；尚不是可靠的步骤变化识别 |
| OCR、手写识别、错题本 | 未实现 | 当前仓库不包含 PaddleOCR，也没有持久化学习记录 |

当前没有可公开免登录、同时连接 MiniCPM-o 推理服务的在线 Demo。托管页面只能展示
前端和固定演示流程；`/live` 必须能够访问单独部署的 Comni Gateway。

## 页面与运行模式

### 1. 学习工作台 `/`

- 默认题目是 `y=x²-4x+3` 的固定演示题。
- 学生可输入文字、使用浏览器单次语音听写，或选择快捷回答。
- 教练按阶段追问，并可朗读回复。
- 上传和拍摄的图片只在配置了兼容多模态接口时参与模型请求。
- 右侧理解度、卡点和学习卡是演示状态，不应作为真实测评结果使用。

### 2. 实时课堂 `/live`

- 浏览器以 16 kHz、float32、单声道、500 ms chunk 发送麦克风音频。
- 页面连接 `{MINICPM_REALTIME_URL}/ws/duplex/{session_id}`。
- Gateway 返回流式文字、24 kHz 音频及推理指标，页面负责连续播放和字幕展示。
- 摄像头开启时，音频 chunk 可附带压缩后的学习场景画面。
- 页面请求浏览器启用 AEC、降噪和自动增益；实际是否生效取决于设备和浏览器。

## MiniCPM-o 4.5 的使用位置

```text
学习工作台
Browser -> /api/coach -> OpenAI-compatible MiniCPM-o
                         -> 失败时使用固定演示回复

实时课堂
Browser -> Comni Gateway -> Worker -> llama.cpp-omni -> MiniCPM-o 4.5
        <- 流式文本与 TTS 音频 <-
```

项目使用或预留了 MiniCPM-o 4.5 的以下能力：

- 文本理解：判断学生当前步骤并生成简短追问。
- 图像输入：把上传图片或摄像头帧传给兼容的多模态接口。
- 流式语音：在 Comni Gateway 上持续输入音频并接收模型语音。
- 视觉与语音联合输入：实时课堂可以在音频消息中附带学习场景帧。
- TTS：播放模型返回的流式语音，并驱动数字教师动画。

## 快速运行

环境要求：Node.js `>=22.13.0`。

```bash
git clone https://github.com/ninghan11111-ai/StepMentor.git
cd StepMentor
npm install
npm run dev
```

打开终端显示的本地地址即可体验固定演示流程。此模式不需要模型权重，也不会执行
真实题目图片识别。

## 接入单轮 MiniCPM-o 服务

```bash
cp .env.example .env.local
```

根据实际服务修改：

```env
MINICPM_BASE_URL=http://127.0.0.1:8000
MINICPM_API_KEY=
MINICPM_MODEL=MiniCPM-o-4_5
```

接口必须兼容：

```text
POST {MINICPM_BASE_URL}/v1/chat/completions
```

如果需要使用图片，该接口还必须接受 OpenAI-compatible `image_url` data URL。官方
Comni 流式接口与该接口不是同一套协议，不能仅通过修改 URL 互相替代。

## 启动实时全双工服务

### Apple Silicon 本地开发

默认使用 Q4_K_M 模型和 Metal 后端：

```bash
npm run local:omni:setup
npm run local:omni:start
npm run local:omni:check
```

### 昇腾 910C 竞赛环境

需要 Linux、CANN、可用的 910C 设备和 F16 模型：

```bash
npm run ascend:omni:setup
npm run ascend:omni:start
npm run local:omni:check
```

然后配置 StepMentor：

```env
MINICPM_REALTIME_URL=http://127.0.0.1:8040
MINICPM_REALTIME_LABEL=Ascend 910C MiniCPM-o 4.5
```

默认服务端口：

| 服务 | 端口 |
| --- | ---: |
| Comni Gateway | `8040` |
| Worker | `22440` |
| llama-server | `19080` |

详细步骤见 [Apple Silicon 本地部署](docs/local-minicpm-o.md) 和
[昇腾 910C 部署](docs/ascend-910c-minicpm-o.md)。

远程浏览器访问麦克风、摄像头和 WebSocket 时需要安全上下文。开发阶段建议使用 SSH
隧道；正式部署应提供 HTTPS/WSS，而不是直接暴露推理端口。

## 环境变量

| 变量 | 用途 | 必需 |
| --- | --- | --- |
| `MINICPM_BASE_URL` | 首页单轮教练的 OpenAI-compatible 服务地址 | 否 |
| `MINICPM_API_KEY` | 单轮服务鉴权 | 否 |
| `MINICPM_MODEL` | 单轮服务中的模型名 | 否 |
| `MINICPM_REALTIME_URL` | `/live` 使用的 Comni Gateway 地址 | 使用双工时必需 |
| `MINICPM_REALTIME_LABEL` | 页面显示的运行环境名称 | 否 |

## 工程结构

```text
app/page.tsx                       学习工作台与固定演示流程
app/live/page.tsx                  MiniCPM-o 实时双工课堂
app/api/coach/route.ts             单轮模型适配和确定性回退
app/api/runtime/route.ts           Comni Gateway 健康检查
components/talking-mentor.tsx      林老师形象、流式音频播放与动画
public/capture-processor.js        浏览器音频采集 AudioWorklet
scripts/setup-local-omni.sh        Apple Silicon 运行时安装
scripts/start-local-omni.sh        本地 Gateway/Worker 启动
scripts/setup-ascend-910c-omni.sh  昇腾 910C 模型下载与 CANN 编译
scripts/start-ascend-910c-omni.sh  昇腾 910C 全双工服务启动
docs/                              运行时部署说明
tests/                             构建产物渲染测试
```

## 验证

```bash
npm run build
npm test
npm run lint
```

验收时应分别验证：固定演示、单轮模型调用、Gateway 健康状态、WebSocket 双工音频、
摄像头权限和远程 HTTPS/WSS。页面显示“图片已载入”或“摄像头已开启”，只证明浏览器
取得了输入，不等于模型已经正确理解题目。

## 已知边界

- 当前公开托管页需要平台访问权限，不能作为免登录竞赛体验地址。
- 首页语音输入是浏览器单次听写；真正的持续双工只在 `/live` 中实现。
- 首页固定题目的识别标签、掌握度和学习卡是 UI 演示数据。
- MiniCPM-o 的视觉效果取决于服务协议、模型构建和运行环境，仓库没有 OCR 兜底。
- 没有账户系统、数据库、课程管理、错题本或教学效果评估。
- Apple Silicon Q4 环境只用于开发；昇腾验收应使用 910C、CANN 和 F16 模型。
