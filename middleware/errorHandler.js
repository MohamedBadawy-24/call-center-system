/**
 * Global error handler — avoids leaking stack traces in production.
 */
function errorHandler(err, req, res, _next) {
  console.error(err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id or reference' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate record' });
  }

  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Server error' : (err.message || 'Server error'),
    ...(!isProd && err.stack ? { stack: err.stack } : {}),
  });
}

module.exports = errorHandler;
