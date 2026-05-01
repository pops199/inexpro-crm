/**
 * Central error-handling middleware.
 */
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const isDev = process.env.NODE_ENV === 'development';

  console.error(`[${new Date().toISOString()}] ${status} ${req.method} ${req.path}:`, err.message);
  if (isDev) console.error(err.stack);

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(status).json({
      error: err.message || 'Internal server error',
      ...(isDev && { stack: err.stack })
    });
  }

  res.status(status).send(`
    <!DOCTYPE html>
    <html>
    <head><title>Error ${status}</title>
    <style>body{font-family:sans-serif;padding:2rem;background:#f8f9fa}
    .box{background:#fff;border-left:4px solid #dc3545;padding:1.5rem;border-radius:4px;max-width:600px}
    h1{color:#dc3545;margin:0 0 1rem}pre{background:#f1f1f1;padding:1rem;overflow:auto}</style>
    </head>
    <body>
      <div class="box">
        <h1>Error ${status}</h1>
        <p>${err.message || 'Something went wrong.'}</p>
        ${isDev ? `<pre>${err.stack}</pre>` : ''}
        <a href="javascript:history.back()">← Go back</a>
      </div>
    </body></html>
  `);
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

module.exports = { errorHandler, notFound };
