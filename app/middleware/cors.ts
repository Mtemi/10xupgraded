// app/middleware/cors.ts
import { NextFunction, Request, Response } from 'express';

/**
 * Middleware to add CORS headers for Termly integration
 */
export function addCorsHeaders(req: Request, res: Response, next: NextFunction) {
  // Allow Termly domains
  const allowedOrigins = [
    'https://app.termly.io',
    'https://d1q9cs864ztmyy.cloudfront.net',
    'https://d3h1hfkxkq1cju.cloudfront.net'
  ];
  
  const origin = req.headers.origin;
  console.log(`CORS: Request from origin: ${origin}`);
  
  if (origin && allowedOrigins.includes(origin)) {
    console.log(`CORS: Setting headers for allowed origin: ${origin}`);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('CORS: Handling OPTIONS preflight request');
    res.status(200).end();
    return;
  }
  
  next();
}