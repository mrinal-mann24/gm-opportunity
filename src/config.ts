import dotenv from "dotenv";

dotenv.config();

export interface Config {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  PERISKOPE_API_KEY: string | undefined;
  PERISKOPE_PHONE: string | undefined;
  PERISKOPE_BASE_URL: string;

  N8N_TEAMS_WEBHOOK_URL: string | undefined;
  DEFAULT_TEAMS_CHAT_ID: string | undefined;

  OPENROUTER_API_KEY: string | undefined;
  OPENROUTER_MODEL: string;

  PORT: number;
}

const config: Config = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  PERISKOPE_API_KEY: process.env.PERISKOPE_API_KEY,
  PERISKOPE_PHONE: process.env.PERISKOPE_PHONE,
  PERISKOPE_BASE_URL: process.env.PERISKOPE_BASE_URL ?? "https://api.periskope.app/v1",

  N8N_TEAMS_WEBHOOK_URL: process.env.N8N_TEAMS_WEBHOOK_URL,
  DEFAULT_TEAMS_CHAT_ID: process.env.DEFAULT_TEAMS_CHAT_ID,

  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",

  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 8000,
};

export default config;
