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

## 本地运行

环境要求：Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

访问终端显示的本地地址。无需模型服务即可走通完整演示流程。

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
app/globals.css          响应式界面样式
public/og.png            项目分享预览图
tests/                   构建产物渲染检查
```

## 验证

```bash
npm run build
npm test
```

下一阶段将接入连续视频帧理解、可打断语音对话、手写草稿步骤识别和持久化错题本。
