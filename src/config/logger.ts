import pino from "pino";
export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
  redact: {
    paths: [
      "password",
      "token",
      "authorization",
      "cookie",
      "email",
      "whatsapp",
    ],
    remove: true,
  },
});
