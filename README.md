# StepMentor

基于 MiniCPM-o 4.5 的多模态苏格拉底学习教练。它不是直接给答案的拍题工具，而是观察题目、学生语音和解题步骤，判断卡点并用分级提示推动学生自己完成推导。

## 已完成的 MVP

- 拍摄或上传题目图片
- 语音或文字表达解题思路
- 连续对话式苏格拉底追问
- 三级提示，按卡点逐步释放信息
- 理解度、当前卡点和过程证据诊断
- 自动生成方法总结、易错点和相似练习
- 无模型服务时可运行的确定性演示模式
- OpenAI-compatible MiniCPM-o 服务接入位
- 本地 MiniCPM-o 4.5 C++/Metal 部署脚本
- 实时双工 Gateway 健康检查接口
- 林老师固定形象数字教师与音频驱动的面部/嘴部微动
- 学习场景摄像头预览与 1 FPS MiniCPM-o Omni 视频帧输入
- 按音频进度、中英文词边界同步的字幕
- 浏览器 AEC、降噪与自动增益请求及实际状态展示
- 云端 MiniCPM-o Gateway 接入标签、实时 LLM/TTS/视觉指标展示
- 3 分钟无明显学生语音输入时触发高优先级视觉卡点检查

## 本地运行

环境要求：Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

访问终端显示的本地地址。无需模型服务即可走通完整演示流程。

### 启动本地 MiniCPM-o 4.5

本项目支持通过官方 Comni Gateway 连接本地 `llama.cpp-omni` Metal 后端：

```bash
npm run local:omni:setup
npm run local:omni:start
npm run local:omni:check
```

启动后从工作台进入 `/live` 使用数字教师实时课堂，或访问 `http://127.0.0.1:8040/audio_duplex` 打开官方诊断页。完整安装、目录约定和硬件边界见 [本地部署文档](docs/local-minicpm-o.md)。

## 接入 MiniCPM-o 4.5

复制环境变量模板并填写服务地址：

```bash
cp .env.example .env.local
```

后端通过 `POST {MINICPM_BASE_URL}/v1/chat/completions` 调用 OpenAI-compatible 服务，支持文本和 data URL 图片输入。配置完成后，页面右上角会从“演示模式”切换为“MiniCPM-o 在线”。

建议在昇腾正式环境中把推理服务独立部署，再将以下配置写入运行环境：

- `MINICPM_BASE_URL`：模型服务根地址
- `MINICPM_API_KEY`：可选鉴权令牌
- `MINICPM_MODEL`：服务注册的模型名
- `MINICPM_REALTIME_URL`：官方 Comni 实时语音 Gateway 地址
- `MINICPM_REALTIME_LABEL`：页面展示的运行环境名称，例如 `Cloud Ascend MiniCPM-o 4.5`

开发时接云端推荐先用 SSH 隧道：

```bash
ssh -N -L 8040:127.0.0.1:<gateway-port> <user>@<server-ip>
```

此时 `.env.local` 仍可使用 `MINICPM_REALTIME_URL=http://127.0.0.1:8040`，避免公网 HTTP/WSS 影响浏览器麦克风和摄像头权限。

## 演示流程

1. 使用默认二次函数题，或拍摄一张新题目。
2. 回答“先配方”，观察教练是否只给下一步追问。
3. 使用语音说出“顶点是二，负一”。
4. 故意点击“交点怎么判断”，展示卡点诊断和三级提示。
5. 完成零点推导，生成学习卡与相似题。

## 工程结构

```text
app/page.tsx             交互式学习工作台
app/api/coach/route.ts   MiniCPM-o 适配与演示回退
app/api/runtime/route.ts 本地实时 Gateway 健康检查
app/live/page.tsx        数字教师双工语音课堂、云端 Gateway 客户端与实时指标
components/talking-mentor.tsx 林老师固定素材、流式 PCM 播放与音频驱动微动
app/globals.css          响应式界面样式
vendor/talkinghead/      TalkingHead MIT 渲染与播放模块
public/digital-mentor-lin.jpg 林老师固定形象素材
public/avatars/          备用数字人 GLB 素材
public/og.png            项目分享预览图
scripts/                 本地 MiniCPM-o 启停与检查脚本
tests/                   构建产物渲染检查
```

## 验证

```bash
npm run build
npm test
```

下一阶段将增加手写草稿步骤识别、流式性能指标和持久化错题本。
