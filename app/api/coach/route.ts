type CoachRequest = {
  answer?: string;
  stage?: number;
  problem?: string;
  image?: string | null;
};

const demoTurns = [
  {
    diagnosis: "方法选择",
    message:
      "方向正确。先把 x²-4x 配成完全平方。你可以试着写成 (x-□)²，再检查展开后的中间项是否为 -4x。",
  },
  {
    diagnosis: "关键步骤正确",
    message:
      "很好，x²-4x=(x-2)²-4，所以原式是 y=(x-2)²-1。现在不计算，先告诉我从这个形式能直接读出哪个几何信息？",
  },
  {
    diagnosis: "概念连接",
    message:
      "顶点 (2,-1) 判断正确。与 x 轴相交时 y=0，所以要解 (x-2)²-1=0。两个 x 值分别是多少？",
  },
  {
    diagnosis: "本题已掌握",
    message:
      "完整思路已经形成：配方得到顶点，再令 y=0 求交点。请用同样方法独立完成 y=x²-6x+5，我会继续观察你的步骤。",
  },
];

const systemPrompt = `你是 StepMentor，一名高中数学苏格拉底学习教练。
你的任务不是直接给答案，而是判断学生当前步骤，指出一个具体证据，并只追问一个能推动思考的问题。
回复控制在 80 个汉字以内。使用自然中文，不使用 Markdown 标题。`;

async function callMiniCPM(payload: CoachRequest, stage: number) {
  const baseUrl = process.env.MINICPM_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) return null;

  const content: Array<Record<string, unknown>> = [];
  if (payload.image) {
    content.push({ type: "image_url", image_url: { url: payload.image } });
  }
  content.push({
    type: "text",
    text: `题目：${payload.problem ?? "未提供"}\n当前阶段：${stage}\n学生回答：${payload.answer ?? "未作答"}`,
  });

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.MINICPM_API_KEY) {
    headers.authorization = `Bearer ${process.env.MINICPM_API_KEY}`;
  }

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: process.env.MINICPM_MODEL ?? "MiniCPM-o-4_5",
      temperature: 0.35,
      max_tokens: 180,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
    }),
  });

  if (!response.ok) return null;
  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return result.choices?.[0]?.message?.content?.trim() || null;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as CoachRequest;
  const stage = Math.max(0, Math.min(Number(payload.stage) || 0, demoTurns.length - 1));
  const fallback = demoTurns[stage];

  try {
    const message = await callMiniCPM(payload, stage);
    if (message) {
      return Response.json({
        message,
        diagnosis: fallback.diagnosis,
        nextStage: Math.min(stage + 1, 3),
        mode: "minicpm",
      });
    }
  } catch {
    // A failed model call falls back to the deterministic judging demo.
  }

  return Response.json({
    ...fallback,
    nextStage: Math.min(stage + 1, 3),
    mode: "demo",
  });
}
