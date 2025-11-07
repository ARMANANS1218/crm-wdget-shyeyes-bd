// src/middlewares/errorHandler.js
export default function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || "Server Error",
    ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : undefined),
  });
}
