# StepMentor

StepMentor 是一个基于 MiniCPM-o 4.5 的多模态苏格拉底学习教练，面向高中数学
自主学习场景。它通过题目、学生当前步骤、语音和学习场景信息理解解题过程，判断
学生的思维卡点，并用逐步追问代替直接公布答案，引导学生完成推导。

## 核心功能

- **多模态题目输入**：支持示例题、图片上传和摄像头拍摄。
- **苏格拉底式追问**：结合题目与学生当前回答，每次聚焦一个关键步骤。
- **分级提示**：从方向提示、条件提示到关键一步，逐步释放信息。
- **学习过程诊断**：展示当前卡点、过程证据、理解进度和阶段性学习卡。
- **语音交互**：支持语音输入、回复朗读和连续语音陪练。
- **实时全双工课堂**：持续接收学生语音，并返回流式文字与语音反馈。
- **学习场景输入**：实时课堂可将摄像头画面与语音共同发送给 MiniCPM-o。
- **数字教师**：林老师形象随模型语音节奏产生面部与嘴部动态，并同步显示字幕。
- **运行状态可视化**：展示 Gateway、上下文、推理延迟、LLM/TTS 和视觉 token 等指标。

## MiniCPM-o 4.5 能力

StepMentor 围绕 MiniCPM-o 4.5 的全模态能力构建两种交互方式：

### 学习工作台

学生上传题目或输入当前步骤后，后端通过 OpenAI-compatible 接口调用 MiniCPM-o，
由模型分析当前思路并生成简短的苏格拉底式问题。

### 实时课堂

浏览器通过 Comni Gateway 与 MiniCPM-o 建立流式会话，持续传输麦克风音频和学习
场景画面，并接收模型生成的文本、TTS 音频和推理指标。

项目使用的模型能力包括：

- 文本理解与数学步骤分析
- 图片和学习场景理解
- 音频流输入与连续会话
- 视觉、语言和语音联合推理
- 流式文本与 TTS 语音输出

## 体验流程

1. 在学习工作台选择示例题，或上传、拍摄一道数学题。
2. 使用文字或语音说出当前解题思路。
3. StepMentor 判断当前步骤，并提出一个推动思考的问题。
4. 学生需要帮助时，可按层级获取提示。
5. 完成关键步骤后生成方法总结、易错点和相似练习。
6. 进入实时课堂，与林老师进行持续语音陪练。

## 技术架构

```text
┌──────────────────────────────────────────────────────┐
│                    StepMentor Web                    │
│  学习工作台 · 图片/摄像头 · 语音输入 · 数字教师      │
└───────────────┬───────────────────┬──────────────────┘
                │                   │
        POST /api/coach       WebSocket /ws/duplex
                │                   │
                ▼                   ▼
     OpenAI-compatible API     Comni Gateway
                │                   │
                └──────────┬────────┘
                           ▼
                    MiniCPM-o 4.5
                           │
                文本 · 视觉 · 音频 · TTS
```

主要技术组件：

- Next.js、React、TypeScript 和 vinext
- Web Audio API、AudioWorklet、WebSocket
- MiniCPM-o 4.5、Comni Gateway、llama.cpp-omni
- Apple Metal 与昇腾 CANN 推理后端
- 浏览器 AEC、降噪和自动增益

## 快速运行

环境要求：Node.js `>=22.13.0`。

```bash
git clone https://github.com/ninghan11111-ai/StepMentor.git
cd StepMentor
npm install
npm run dev
```

访问终端显示的本地地址即可进入学习工作台。

## 接入 MiniCPM-o

复制环境变量模板：

```bash
cp .env.example .env.local
```

配置单轮模型服务和实时 Gateway：

```env
MINICPM_BASE_URL=http://127.0.0.1:8000
MINICPM_API_KEY=
MINICPM_MODEL=MiniCPM-o-4_5

MINICPM_REALTIME_URL=http://127.0.0.1:8040
MINICPM_REALTIME_LABEL=MiniCPM-o 4.5 Gateway
```

模型服务准备完成后重新启动 StepMentor，即可在工作台调用模型，并从页面进入
`/live` 实时课堂。

完整运行环境配置见：

- [MiniCPM-o 4.5 本地部署](docs/local-minicpm-o.md)
- [昇腾 910C 竞赛部署](docs/ascend-910c-minicpm-o.md)

## 工程结构

```text
app/page.tsx                       学习工作台
app/live/page.tsx                  MiniCPM-o 实时双工课堂
app/api/coach/route.ts             教练模型适配与演示回退
app/api/runtime/route.ts           Comni Gateway 状态检测
components/talking-mentor.tsx      林老师形象与流式语音动画
public/capture-processor.js        浏览器音频采集 AudioWorklet
scripts/setup-local-omni.sh        本地运行时安装
scripts/start-local-omni.sh        本地 Gateway/Worker 启动
scripts/setup-ascend-910c-omni.sh  昇腾模型下载与 CANN 编译
scripts/start-ascend-910c-omni.sh  昇腾全双工服务启动
docs/                              部署与运行说明
tests/                             构建产物渲染测试
```

## 验证

```bash
npm run build
npm test
npm run lint
```
