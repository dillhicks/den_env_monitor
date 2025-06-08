// src/index.js -----------------------------------------------------------
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt, sign } from 'hono/jwt'
import { CosmosClient } from '@azure/cosmos'


let ADMIN_PASSWORD_HASH = ''                             // 64-char hex

async function initAdminHash(raw) {
  const bytes = new TextEncoder().encode(raw.trim())     // trim stray \n/space
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  ADMIN_PASSWORD_HASH = [...new Uint8Array(buf)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/* constant-time hex compare (Workers lacks timingSafeEqual) */
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* ------------------------------------------------------------------ */
/*  App + shared middleware                                           */
/* ------------------------------------------------------------------ */
const app = new Hono()

app.onError((err, c) =>
  c.json({ error: 'Internal Server Error', message: err.message }, 500)
)

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
)

/* ------------------------------------------------------------------ */
/*  Cosmos initialiser (lazy)                                         */
/* ------------------------------------------------------------------ */
let client, database, container
app.use('*', async (c, next) => {
  if (!client) {
    client = new CosmosClient({
      endpoint: c.env.COSMOS_ENDPOINT,
      key: c.env.COSMOS_KEY,
    })
    database = client.database('dendashboard')
    container = database.container('dendbcontainer')

    await initAdminHash(c.env.ADMIN_PASSWORD)           // ❷
  }
  await next()
})

/* ------------------------------------------------------------------ */
/*  JWT guard (skip /api/login)                                       */
/* ------------------------------------------------------------------ */
app.use('/api/*', (c, next) =>
  c.req.path === '/api/login'
    ? next()
    : jwt({ secret: c.env.JWT_SECRET })(c, next),
)

/* ------------------------------------------------------------------ */
/*  /api/data                                      */
/* ------------------------------------------------------------------ */
app.get('/api/data', async (c) => {
  const hours = parseInt(c.req.query('hours') || '24')
  const startTime = new Date()
  startTime.setHours(startTime.getHours() - hours)

  const query = `
    SELECT * FROM c
    WHERE c.timestamp >= '${startTime.toISOString()}'
    ORDER BY c.timestamp ASC`
  const { resources } = await container.items.query(query).fetchAll()
  return c.json(resources)
})

/* ------------------------------------------------------------------ */
/*  /api/daily-averages                               */
/* ------------------------------------------------------------------ */
app.get('/api/daily-averages', async (c) => {
  const toDate = new Date()
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - 14)

  const query = `
    SELECT SUBSTRING(c.timestamp,0,10) AS date,
           AVG(c.temperature) AS avg_temperature,
           AVG(c.humidity)    AS avg_humidity,
           AVG(c.voc_index)   AS avg_voc_index,
           AVG(c.pm1_0)       AS avg_pm1_0,
           AVG(c.pm2_5)       AS avg_pm2_5,
           AVG(c.pm10)        AS avg_pm10
    FROM c
    WHERE c.timestamp >= '${fromDate.toISOString()}'
      AND c.timestamp <= '${toDate.toISOString()}'
    GROUP BY SUBSTRING(c.timestamp,0,10)`
  const { resources } = await container.items.query(query).fetchAll()
  resources.sort((a, b) => a.date.localeCompare(b.date))
  return c.json(resources)
})

/* ------------------------------------------------------------------ */
/*  /api/login – hash-once compare                                    */
/* ------------------------------------------------------------------ */
app.post('/api/login', async (c) => {
  const { password: clientHash = '' } = await c.req.json()

  const ok =
    clientHash.length === 64 &&
    timingSafeEqualHex(clientHash.toLowerCase(), ADMIN_PASSWORD_HASH)

  if (!ok) return c.json({ error: 'Invalid password' }, 401)

  const payload = {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  }
  const token = await sign(payload, c.env.JWT_SECRET)
  return c.json({ token, expires_in: payload.exp - payload.iat })
})

/* ------------------------------------------------------------------ */
/*  Static assets                                                     */
/* ------------------------------------------------------------------ */
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
