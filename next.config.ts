import type { NextConfig } from "next";

const config: NextConfig = {
  // Admin actions accept passwords and Telegram bot tokens.
  logging: { serverFunctions: false },
};

export default config;
