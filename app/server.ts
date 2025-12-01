import { createRequestHandler } from '@remix-run/express';
import { broadcastDevReady, installGlobals } from '@remix-run/node';
import express from 'express';
import { addCorsHeaders } from './middleware/cors';

// Install Remix globals
installGlobals();

// Create Express app
const app = express();

// Apply CORS middleware for Termly
app.use(addCorsHeaders);

// Add logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // Log headers for Termly-related requests
  if (req.url.includes('termly') || (req.headers.referer && req.headers.referer.includes('termly'))) {
    console.log('Request headers:', req.headers);
  }
  
  // Log response for Termly-related requests
  const originalSend = res.send;
  res.send = function(body) {
    if (req.url.includes('termly') || (req.headers.referer && req.headers.referer.includes('termly'))) {
      console.log('Response status:', res.statusCode);
      console.log('Response headers:', res.getHeaders());
    }
    return originalSend.call(this, body);
  };
  
  next();
});

// Handle asset requests
app.use(
  '/build',
  express.static('public/build', { immutable: true, maxAge: '1y' })
);
app.use(express.static('public', { maxAge: '1h' }));

// Handle Remix requests
app.all(
  '*',
  createRequestHandler({
    build: require('./build'),
  })
);

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
  
  if (process.env.NODE_ENV === 'development') {
    broadcastDevReady(require('./build'));
  }
});

export default app;