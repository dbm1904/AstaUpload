import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_UPLOAD_BUCKET: z.string().default("asta-powerproject-uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(52_428_800)
});

export function getServerEnv() {
  return serverEnvSchema.parse(process.env);
}
