/**
 * Loads environment variables for the backend.
 *
 * Must be imported BEFORE any other server module so that process.env is
 * populated before db/prokerala/gemini read it. `dotenv/config` only loads
 * `.env`, so we explicitly load `.env.local` (preferred) and fall back to
 * `.env`. dotenv does not override variables that are already set, so a real
 * environment (e.g. production) still wins.
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config(); // .env fallback
