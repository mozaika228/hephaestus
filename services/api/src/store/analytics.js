import { getDb } from "./db.js";

const db = getDb();

export function createAnalyticsEvent(event) {
  db.prepare(
    `INSERT INTO analytics_events
      (id, requestId, method, path, statusCode, durationMs, provider, createdAt)
     VALUES
      (@id, @requestId, @method, @path, @statusCode, @durationMs, @provider, @createdAt)`
  ).run(event);
  return event;
}

export function summarizeAnalytics({ since, until }) {
  const where = [];
  const params = {};

  if (since) {
    where.push("createdAt >= @since");
    params.since = since;
  }
  if (until) {
    where.push("createdAt <= @until");
    params.until = until;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) as totalRequests,
         SUM(CASE WHEN statusCode >= 400 THEN 1 ELSE 0 END) as totalErrors,
         AVG(durationMs) as avgDurationMs
       FROM analytics_events
       ${whereSql}`
    )
    .get(params);

  const topPaths = db
    .prepare(
      `SELECT path, COUNT(*) as count
       FROM analytics_events
       ${whereSql}
       GROUP BY path
       ORDER BY count DESC
       LIMIT 10`
    )
    .all(params);

  const providerBreakdown = db
    .prepare(
      `SELECT provider, COUNT(*) as count
       FROM analytics_events
       ${whereSql}
       GROUP BY provider
       ORDER BY count DESC`
    )
    .all(params);

  return {
    totalRequests: totals?.totalRequests || 0,
    totalErrors: totals?.totalErrors || 0,
    avgDurationMs: Number(totals?.avgDurationMs || 0),
    topPaths,
    providerBreakdown
  };
}
