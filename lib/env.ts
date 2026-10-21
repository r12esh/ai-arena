import fs from "fs";
import path from "path";

/**
 * Strictly loads environment variables from the project root `.env` file only.
 * Ignores any other environment files to ensure configuration integrity.
 */
export function loadRootEnv(): Record<string, string> {
  const envVars: Record<string, string> = {};
  const envPath = path.join(process.cwd(), ".env");

  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, "utf-8");
      const lines = content.split(/\r?\n/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;

        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();

        // Strip matching quotes if wrapped
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }

        envVars[key] = val;
        process.env[key] = val;
      }
    } catch (err) {
      console.error("Failed to read .env file:", err);
    }
  }

  return envVars;
}

// Auto-run when module is loaded on server
loadRootEnv();
