# 昇腾 910C：MiniCPM-o 4.5 竞赛部署

这套流程对应竞赛要求：在配有昇腾 910C 和已安装 CANN 的 Linux 主机上，使用
`llama.cpp-omni`，并从官方指定的 ModelScope 仓库下载
`MiniCPM-o-4_5-F16.gguf`。它和本仓库 `local:omni:*` 的 Apple Silicon / Q4 开发环境
是两条不同路径，不能混用。

## 前置检查

先登录昇腾服务器，在工作区根目录执行：

```bash
npu-smi info
source /usr/local/Ascend/ascend-toolkit/set_env.sh
echo "$ASCEND_TOOLKIT_HOME"
```

应能看到 910C 设备且 `ASCEND_TOOLKIT_HOME` 非空。若 CANN 安装在其他目录，改为：

```bash
export ASCEND_TOOLKIT_HOME=/实际/CANN/目录
source "$ASCEND_TOOLKIT_HOME/set_env.sh"
```

不要在本机 macOS 上执行下列命令；本机没有 NPU/CANN，无法验证竞赛环境。

## 一次性安装、下载和编译

```bash
cd stepmentor
npm run ascend:omni:setup
```

该脚本会完成以下动作：

1. 从 `OpenBMB/MiniCPM-o-4_5-gguf` 下载主模型 `MiniCPM-o-4_5-F16.gguf`，以及全模态推理必需的 audio / vision / TTS / token2wav 文件；下载命令只使用 ModelScope。
2. 以 `-DGGML_CANN=ON -DSOC_TYPE=Ascend910C` 编译 `llama.cpp-omni` 到 `runtime/llama.cpp-omni/build-ascend/`。
3. 运行 `llama-server --list-devices`；结果必须包含 `CANN0`，否则不要继续启动 Demo。

若服务器没有 Node/npm，也可以直接执行：

```bash
bash stepmentor/scripts/setup-ascend-910c-omni.sh
```

## 启动与验收

```bash
cd stepmentor
npm run ascend:omni:start
npm run local:omni:check
```

启动脚本默认设置：

```text
MINICPM_MODEL_FILE=MiniCPM-o-4_5-F16.gguf
MINICPM_CPP_DEVICE=CANN0
ASCEND_RT_VISIBLE_DEVICES=0
```

因此 Python Worker 启动的 `llama-server` 会明确使用 CANN 后端，而不是错误沿用
CUDA 或本机 Metal。健康检查三项都应为 `OK`：Gateway `:8040`、Worker `:22440`、
llama-server `:19080`。然后打开：

```text
http://<服务器地址>:8040/omni
```

浏览器如果不在同一台机器，摄像头和麦克风需要 HTTPS/WSS；开发期优先使用 SSH
隧道访问 Gateway，避免把服务直接暴露到公网。

## 当前工作区核对结果

现有 `models/MiniCPM-o-4_5-gguf/` 包含完整的附属 F16 模块，但主模型是
`MiniCPM-o-4_5-Q4_K_M.gguf`。它只可作为 Mac 本地研发用的量化模型，不能作为本次
910C / F16 验收模型。竞赛环境必须以脚本下载的
`MiniCPM-o-4_5-F16.gguf` 为准。
