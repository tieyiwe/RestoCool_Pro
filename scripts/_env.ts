// Load .env locally if present. On Replit, Secrets are already in process.env.
try {
  process.loadEnvFile();
} catch {
  /* no .env file: fine */
}
