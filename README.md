# Den Air Quality Dashboard

A real-time air quality monitoring dashboard that displays temperature, humidity, VOC (Volatile Organic Compounds) levels, and particulate matter (PM1.0, PM2.5, PM10) readings.

![Dashboard Screenshot](docs/screenshot.jpg)

## Features

- Real-time sensor data visualization from ESP32 including SHT31 (Humidity + Temp), SGP40 (VOC), and PMS7003M (Particulate Sensor) and a custom enclosure
- Historical data viewing with adjustable time ranges (1h to 72h)
- Daily averages for the last two weeks
- Automatic data refresh every 5 minutes

## Tech Stack

### Frontend
- React (Vite)
- Chart.js for data visualization
- Modern CSS with responsive grid layouts

### Backend
- Cloudflare Workers w/ Hono.js
- Cloudflare D1 for data storage
- JWT for authentication

### Hardware
- ESP32 with Arduino 🤒

