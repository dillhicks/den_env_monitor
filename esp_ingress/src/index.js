export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Expected POST method', { status: 405 });
    }

    try {
      const data = await request.json();
      
      const { temperature, humidity, voc_index, raw_voc, pm1_0, pm2_5, pm10, sample_count } = data;

      // Basic validation
      if (
        temperature === undefined ||
        humidity === undefined ||
        voc_index === undefined ||
        raw_voc === undefined ||
        pm1_0 === undefined ||
        pm2_5 === undefined ||
        pm10 === undefined ||
        sample_count === undefined
      ) {
        return new Response('Missing one or more required fields.', { status: 400 });
      }

      const timestamp = new Date().toISOString();

      const stmt = env.DB.prepare(
        'INSERT INTO sensor_data (timestamp, temperature, humidity, voc_index, raw_voc, pm1_0, pm2_5, pm10_0, sample_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      await stmt.bind(timestamp, temperature, humidity, voc_index, raw_voc, pm1_0, pm2_5, pm10, sample_count).run();

      return new Response('Data ingested successfully.', { status: 201 });
    } catch (e) {
      if (e instanceof SyntaxError) {
        return new Response('Invalid JSON payload.', { status: 400 });
      }
      console.error(e);
      return new Response(`An error occurred: ${e.message}`, { status: 500 });
    }
  },

  async scheduled(controller, env, ctx) {
    try {
      console.log("Running scheduled task to delete old data.");

      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const isoTimestamp = twoMonthsAgo.toISOString();

      const stmt = env.DB.prepare(
        'DELETE FROM sensor_data WHERE timestamp < ?'
      );
      const { meta, success } = await stmt.bind(isoTimestamp).run();

      if (success) {
        console.log(`Successfully deleted ${meta.rows_written} rows older than ${isoTimestamp}.`);
      } else {
        console.error("Failed to delete old data.");
      }
    } catch (e) {
      console.error("Error in scheduled task:", e);
    }
  },
};
