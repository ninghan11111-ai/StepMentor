export const dynamic = "force-dynamic";

const DEFAULT_TIMEOUT_MS = 2000;

export async function GET() {
  const baseUrl = process.env.MINICPM_REALTIME_URL?.replace(/\/$/, "");
  const runtimeLabel = process.env.MINICPM_REALTIME_LABEL || "MiniCPM-o 4.5 Gateway";

  if (!baseUrl) {
    return Response.json({
      configured: false,
      online: false,
      runtime: "demo",
      runtimeLabel,
    });
  }

  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    return Response.json({
      configured: true,
      online: response.ok,
      runtime: response.ok ? "minicpm-o-4.5" : "unavailable",
      runtimeLabel,
      gatewayUrl: baseUrl,
      demoUrl: `${baseUrl}/audio_duplex`,
      omniUrl: `${baseUrl}/omni`,
    });
  } catch {
    return Response.json({
      configured: true,
      online: false,
      runtime: "unavailable",
      runtimeLabel,
      gatewayUrl: baseUrl,
      demoUrl: `${baseUrl}/audio_duplex`,
      omniUrl: `${baseUrl}/omni`,
    });
  }
}
