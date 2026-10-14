// ============================================================
// GET /api/models — List available providers & models (no secrets)
// ============================================================
import { getClientProviderInfo } from "@/lib/providers";

export async function GET() {
  const providers = getClientProviderInfo();
  return Response.json({ providers });
}
