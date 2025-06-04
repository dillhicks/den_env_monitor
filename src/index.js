import { CosmosClient } from '@azure/cosmos';
import { jwtVerify, SignJWT } from 'jose';

export default {
  async fetch(request, env, ctx) {
    // Initialize Cosmos DB client
    const cosmosClient = new CosmosClient({
      endpoint: env.COSMOS_ENDPOINT,
      key: env.COSMOS_KEY
    });

    const database = cosmosClient.database('dendashboard');
    const container = database.container('dendbcontainer');

    // JWT configuration
    const JWT_ALGORITHM = 'HS256';
    const JWT_EXPIRATION = 365 * 24 * 60 * 60; // 1 year in seconds

    // Helper function to hash password using Web Crypto API
    async function hashPassword(password) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Helper function to verify JWT token
    async function verifyToken(token) {
      try {
        const { payload } = await jwtVerify(
          token,
          new TextEncoder().encode(env.JWT_SECRET),
          { algorithms: [JWT_ALGORITHM] }
        );
        return payload;
      } catch (error) {
        return null;
      }
    }

    // Helper function to generate JWT token
    async function generateToken() {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({})
        .setProtectedHeader({ alg: JWT_ALGORITHM })
        .setIssuedAt(now)
        .setExpirationTime(now + JWT_EXPIRATION)
        .sign(new TextEncoder().encode(env.JWT_SECRET));
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // API routes
    if (path.startsWith('/api/')) {
      // Login endpoint
      if (path === '/api/login' && request.method === 'POST') {
        const data = await request.json();
        const password = data.password;

        if (!password) {
          return new Response(JSON.stringify({ message: 'Password is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const passwordHash = await hashPassword(password);
        if (passwordHash === await hashPassword(env.ADMIN_PASSWORD)) {
          const token = await generateToken();
          return new Response(JSON.stringify({
            token,
            expires_in: JWT_EXPIRATION,
          }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ message: 'Invalid password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Data endpoint
      if (path === '/api/data' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
          return new Response(JSON.stringify({ message: 'Token is missing' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const token = authHeader.split(' ')[1];
        const payload = await verifyToken(token);
        if (!payload) {
          return new Response(JSON.stringify({ message: 'Invalid token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const hours = parseInt(url.searchParams.get('hours') || '24');
        const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        const query = `SELECT * FROM c WHERE c.timestamp >= '${startTime}' ORDER BY c.timestamp ASC`;
        const { resources: items } = await container.items.query(query).fetchAll();

        return new Response(JSON.stringify(items), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Serve frontend static files
    try {
      // First try to serve the requested file
      const response = await env.ASSETS.fetch(request);
      if (response.status === 404) {
        // If file not found, serve index.html for client-side routing
        return await env.ASSETS.fetch(new Request(new URL('/', request.url)));
      }
      return response;
    } catch (e) {
      console.error('Error serving static files:', e);
      return new Response(`Error serving static files: ${e.message}`, { 
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  },
}; 