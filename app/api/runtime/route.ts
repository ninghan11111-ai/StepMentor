export const dynamic = "force-dynamic";

const DEFAULT_TIMEOUT_MS = 2000;

export async function GET() {
  const baseUrl = process.env.MINICPM_REALTIME_URL?.replace(/\/$/, "");

  if (!baseUrl) {
    return Response.json({
      configured: false,
      online: false,
      runtime: "demo",
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
      runtime: response.ok ? "minicpm-o-4.5-cpp" : "unavailable",
      gatewayUrl: baseUrl,
      demoUrl: `${baseUrl}/audio_duplex`,
      omniUrl: `${baseUrl}/omni`,
    });
  } catch {
    return Response.json({
      configured: true,
      online: false,
      runtime: "unavailable",
      gatewayUrl: baseUrl,
      demoUrl: `${baseUrl}/audio_duplex`,
      omniUrl: `${baseUrl}/omni`,
    });
  }
}
