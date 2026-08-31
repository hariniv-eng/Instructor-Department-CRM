import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use("/api", router);

// Global error handler — without this, Express 5 forwards any error thrown
// (or rejected) inside an async route handler to its default handler, which
// sends a bare 500 with no useful log. That's why recent 500s on
// /api/reports/instructors and /api/dashboard showed only a truncated
// "Failed query" line with no root cause: nothing was logging err.cause
// (where drizzle-orm/node-postgres puts the actual Postgres error — code,
// message, detail). This logs the full chain so the next failure is
// diagnosable from the deployment logs instead of guesswork.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const error = err as { message?: string; code?: string; cause?: { message?: string; code?: string; detail?: string }; stack?: string };
  logger.error(
    {
      err,
      message: error?.message,
      code: error?.code,
      cause_message: error?.cause?.message,
      cause_code: error?.cause?.code,
      cause_detail: error?.cause?.detail,
      url: req.url,
    },
    "Unhandled error in request",
  );
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
