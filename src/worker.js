import { createClient } from '@azure/cosmos';
import { jwtVerify, SignJWT } from 'jose';
import { createHash } from 'crypto';

// Environment variables
const COSMOS_ENDPOINT = COSMOS_ENDPOINT;
const COSMOS_KEY = COSMOS_KEY;
const ADMIN_PASSWORD = ADMIN_PASSWORD;
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET);
const DATABASE_NAME = DATABASE_NAME;
const CONTAINER_NAME = CONTAINER_NAME;
const JWT_EXPIRATION = 365 * 24 * 60 * 60; // 1 year in seconds

// Initialize Cosmos DB client
const client = new createClient({
  endpoint: COSMOS_ENDPOINT,
  key: COSMOS_KEY
});

const database = client.database(DATABASE_NAME);
const container = database.container(CONTAINER_NAME);

// Helper function to hash password
function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex');
}

// Helper function to verify JWT token
async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (Date.now() / 1000 > payload.exp) {
      throw new Error('Token has expired');
    }
    return true;
  } catch (error) {
    return false;
  }
}

// Helper function to generate JWT token
async function generateToken() {
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1y')
    .sign(JWT_SECRET);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    // Login endpoint
    if (path === '/api/login' && request.method === 'POST') {
      const data = await request.json();
      const password = data.password;

      if (!password) {
        return new Response(JSON.stringify({ message: 'Password is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const passwordHash = hashPassword(password);
      const adminPasswordHash = hashPassword(ADMIN_PASSWORD);

      if (passwordHash === adminPasswordHash) {
        const token = await generateToken();
        return new Response(JSON.stringify({
          token,
          expires_in: JWT_EXPIRATION
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ message: 'Invalid password' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Data endpoint
    if (path === '/api/data' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ message: 'Token is missing' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const token = authHeader.split(' ')[1];
      const isValid = await verifyToken(token);
      
      if (!isValid) {
        return new Response(JSON.stringify({ message: 'Invalid or expired token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const hours = parseInt(url.searchParams.get('hours') || '24');
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      try {
        const query = `SELECT * FROM c WHERE c.timestamp >= '${startTime}' ORDER BY c.timestamp ASC`;
        const { resources: items } = await container.items.query(query).fetchAll();
        
        return new Response(JSON.stringify(items), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ message: 'Error fetching data' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle unknown routes
    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}; 