declare global {
  namespace Express {
    interface Request {
      actor?: {
        id: string;
        role: "MERCHANT" | "DEVELOPER" | "ADMIN";
        sessionId: string;
      };
    }
  }
}
export {};
