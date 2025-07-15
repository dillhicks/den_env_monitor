// src/index.js -----------------------------------------------------------
import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'
import { jwt, sign } from 'hono/jwt'


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
  c.json({ error: 'Internal Server Error' }, 500)
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
/*  Initialisers                                                      */
/* ------------------------------------------------------------------ */
app.use('*', async (c, next) => {
  if (!ADMIN_PASSWORD_HASH) {
    await initAdminHash(c.env.ADMIN_PASSWORD)
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
app.get(
  '/api/data',
  cache({
    cacheName: 'api-cache',
    cacheControl: 'max-age=300', // 5 minutes
  }),
  async (c) => {
    const hours = parseInt(c.req.query('hours') || '24')
    const startTime = new Date()
    startTime.setHours(startTime.getHours() - hours)

    const stmt = c.env.DB.prepare(
      'SELECT * FROM sensor_data WHERE timestamp >= ? ORDER BY timestamp ASC'
    )
    const { results } = await stmt.bind(startTime.toISOString()).all()
    return c.json(results)
  },
)

/* ------------------------------------------------------------------ */
/*  /api/daily-averages                               */
/* ------------------------------------------------------------------ */
app.get(
  '/api/daily-averages',
  cache({
    cacheName: 'api-cache',
    cacheControl: 'max-age=3600', // 1 hour
  }),
  async (c) => {
    const toDate = new Date()
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 14)

    const stmt = c.env.DB.prepare(`
      SELECT SUBSTR(timestamp, 1, 10) AS date,
             AVG(temperature) AS avg_temperature,
             AVG(humidity)    AS avg_humidity,
             AVG(voc_index)   AS avg_voc_index,
             AVG(pm1_0)       AS avg_pm1_0,
             AVG(pm2_5)       AS avg_pm2_5,
             AVG(pm10_0)      AS avg_pm10
      FROM sensor_data
      WHERE timestamp >= ?1 AND timestamp <= ?2
      GROUP BY date
      ORDER BY date ASC
    `)
    const { results } = await stmt.bind(fromDate.toISOString(), toDate.toISOString()).all()
    return c.json(results)
  },
)

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
