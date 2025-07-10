/*
  ESP32-WROOM-32  ▸  SHT31  (no Adafruit lib)
  -------------------------------------------------
  I²C pins (change if you need different GPIOs):
      SDA  -> GPIO 21
      SCL  -> GPIO 22

  Power: 3V3 ONLY.  The SHT31 is not 5-V tolerant.

  Datasheet command used:
      0x24 0x00  Single-shot, high repeatability, no clock-stretch
      Max conversion time ≈ 15 ms
*/

#include <Arduino.h>
#include <Wire.h>
#include <VOCGasIndexAlgorithm.h>
#include <WiFi.h>
#include <HTTPClient.h>

/* ---------- WiFi and Azure Function settings ---------- */
const char* ssid = "";     
const char* password = "";  
const char* azureFunctionUrl = "";  

/* ---------- user-configurable section ---------- */
constexpr uint8_t  SDA_PIN     = 21;
constexpr uint8_t  SCL_PIN     = 22;
constexpr uint8_t  SHT31_ADDR  = 0x44;   // 0x45 if ADR pin is tied high
constexpr uint8_t SGP40_ADDR = 0x59;   // fixed by hardware

float sampling_interval = 5.f;  // Changed from 1.f to 5.f for 5-second intervals
VOCGasIndexAlgorithm voc_algorithm(sampling_interval);

HardwareSerial pmsSerial(2);               // use UART2

const uint8_t  HEADER_H = 0x42;
const uint8_t  HEADER_L = 0x4D;
const uint16_t FRAME_LEN_BYTES = 32;       // total bytes including header & checksum

// Constants for averaging
const unsigned long AVERAGE_INTERVAL = 60000;  // 3 minutes in milliseconds
const unsigned long SAMPLE_INTERVAL = 5000;     // 5 seconds between samples
unsigned long lastSampleTime = 0;
unsigned long lastAverageTime = 0;

// Variables for averaging
float tempSum = 0;
float humiditySum = 0;
int32_t vocIndexSum = 0;
uint16_t rawVocSum = 0;
uint32_t pm1_0Sum = 0;
uint32_t pm2_5Sum = 0;
uint32_t pm10Sum = 0;
int sampleCount = 0;

// Holds the 6 "Atmospheric" mass-concentration readings we care about
struct PMSData {
  uint16_t pm1_0;
  uint16_t pm2_5;
  uint16_t pm10;
};


struct SHT31Reading {
  float temperatureF;
  float humidityRH;
};

// CRC-8 routine (polynomial 0x31, init 0xFF) — per Sensirion app note
static uint8_t crc8(const uint8_t *data, int len) {
  uint8_t crc = 0xFF;
  for (int i = 0; i < len; ++i) {
    crc ^= data[i];
    for (uint8_t b = 0; b < 8; ++b) {
      crc = (crc & 0x80) ? (crc << 1) ^ 0x31 : (crc << 1);
    }
  }
  return crc;
}

/*  Trigger one single-shot measurement and read back 6 bytes.
    Returns true on success; fills result with °C and %RH.            */
bool readSHT31(SHT31Reading &out) {
  // 1. send measurement command 0x24 0x00
  Wire.beginTransmission(SHT31_ADDR);
  Wire.write(0x24);
  Wire.write(0x00);
  if (Wire.endTransmission() != 0) return false;   // command failed

  delay(15);                                       // max conversion 15 ms

  // 2. request 6 bytes: T[MSB] T[LSB] T[CRC] RH[MSB] RH[LSB] RH[CRC]
  if (Wire.requestFrom(SHT31_ADDR, uint8_t(6)) != 6) return false;

  uint8_t raw[6];
  for (uint8_t &b : raw) b = Wire.read();

  // 3. CRC check for both words
  if (crc8(raw, 2) != raw[2]) return false;   // temp CRC mismatch
  if (crc8(raw + 3, 2) != raw[5]) return false; // RH CRC mismatch

  uint16_t rawT  = (raw[0] << 8) | raw[1];
  uint16_t rawRH = (raw[3] << 8) | raw[4];

  // 4. convert to physical values (datasheet equations)
  float tempC = -45.0f + 175.0f * (float(rawT) / 65535.0f);
  out.temperatureF   = tempC * 9.0f / 5.0f + 32.0f;
  out.humidityRH   = 100.0f * (float(rawRH) / 65535.0f);
  return true;
}

// —--- helper: read one complete frame and verify checksum ---—
bool readPMSFrame(PMSData &out) {
  // 1. Find the start of frame (0x42 0x4D)
  while (pmsSerial.available() >= 2) {
    if (pmsSerial.peek() == HEADER_H) {
      uint8_t h = pmsSerial.read();
      if (pmsSerial.peek() == HEADER_L) {
        pmsSerial.read();                    // consume HEADER_L
        break;                               // found header
      }
    } else {
      pmsSerial.read();                      // discard byte and keep looking
    }
  }
  // Not enough data yet
  if (pmsSerial.available() < FRAME_LEN_BYTES - 2) return false;

  uint8_t buffer[FRAME_LEN_BYTES - 2];       // we already ate 2 header bytes
  pmsSerial.readBytes(buffer, sizeof(buffer));

  // 2. Verify frame length (bytes 0-1 of buffer)
  uint16_t frameLen = (buffer[0] << 8) | buffer[1];
  if (frameLen != 28) return false;          // PMS7003M always reports 28 here

  // 3. Calculate checksum: sum of HEADER + all bytes up to (but not incl.) checksum
  uint16_t sum = HEADER_H + HEADER_L;
  for (int i = 0; i < 28; ++i) sum += buffer[i];

  uint16_t reported = (buffer[28] << 8) | buffer[29];
  if (sum != reported) return false;         // checksum failed

  // 4. Extract atmospheric (standard) values: buffer offsets 4-9
out.pm1_0 = (buffer[8]  << 8) | buffer[9];   // PM1.0  (ATM)
out.pm2_5 = (buffer[10] << 8) | buffer[11];  // PM2.5  (ATM)
out.pm10  = (buffer[12] << 8) | buffer[13];  // PM10   (ATM)
  return true;
}


/* ---------- helpers ---------- */
static uint8_t crc8_pair(uint8_t msb, uint8_t lsb) {
  uint8_t d[2] = { msb, lsb };
  return crc8(d, 2);
}

static uint16_t humToTicks(float rh)  {   // 0…100 %  →  0…65535
  if (rh < 0)   rh = 0;
  if (rh > 100) rh = 100;
  return uint16_t(rh * 65535.0f / 100.0f + 0.5f);
}
static uint16_t tempToTicks(float tc) {   // –45…130 °C → 0…65535
  if (tc < -45) tc = -45;
  if (tc > 130) tc = 130;
  return uint16_t((tc + 45.0f) * 65535.0f / 175.0f + 0.5f);
}

/* ---------- compensated read ---------- */
bool readSGP40(const SHT31Reading &env, uint16_t &vocTicks)
{
  uint16_t h = humToTicks(env.humidityRH);
  uint16_t t = tempToTicks((env.temperatureF - 32.0f) * 5.0f / 9.0f);

  uint8_t frame[8] = {
    0x26, 0x0F,                        // command
    uint8_t(h >> 8), uint8_t(h),       // RH MSB, LSB
    crc8_pair(uint8_t(h >> 8), uint8_t(h)),
    uint8_t(t >> 8), uint8_t(t),       // T  MSB, LSB
    crc8_pair(uint8_t(t >> 8), uint8_t(t))
  };

  Wire.beginTransmission(SGP40_ADDR);
  Wire.write(frame, 8);
  if (Wire.endTransmission() != 0) return false;   // address / bus error

  delay(30);                                       // max conversion time

  if (Wire.requestFrom(SGP40_ADDR, uint8_t(3)) != 3) return false;
  uint8_t res[3] = { Wire.read(), Wire.read(), Wire.read() };
  if (crc8(res, 2) != res[2]) return false;        // response CRC

  vocTicks = (res[0] << 8) | res[1];
  return true;
}

void setup() {
  Serial.begin(115200);
  pmsSerial.begin(9600, SERIAL_8N1, 16, 17); // RX on GPIO16, TX on GPIO17
  Serial.println(F("\nPMS7003M reader ready"));

  Wire.begin(SDA_PIN, SCL_PIN);          // init I²C bus
  Wire.setClock(400000);         // 400 kHz for snappier transfers

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi");
}

void sendDataToCloudflare(float avgTemp, float avgHumidity, int32_t avgVocIndex, uint16_t avgRawVoc,
                        uint16_t avgPM1_0, uint16_t avgPM2_5, uint16_t avgPM10, int sampleCount) {
    Serial.println("Attempting to send data");
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(workerUrl);
    http.addHeader("Content-Type", "application/json");

    // Create JSON payload
    String jsonPayload = "{\"temperature\":" + String(avgTemp, 2) + 
                        ",\"humidity\":" + String(avgHumidity, 2) + 
                        ",\"voc_index\":" + String(avgVocIndex) + 
                        ",\"raw_voc\":" + String(avgRawVoc) +
                        ",\"pm1_0\":" + String(avgPM1_0) +
                        ",\"pm2_5\":" + String(avgPM2_5) +
                        ",\"pm10\":" + String(avgPM10) +
                        ",\"sample_count\":" + String(sampleCount) + "}";

    int httpResponseCode = http.POST(jsonPayload);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("HTTP Response code: " + String(httpResponseCode));
      Serial.println("Response: " + response);
    } else {
      Serial.println("Error sending data: " + String(httpResponseCode));
    }
    
    http.end();
  } else {
    Serial.println("WiFi not connected!");
  }
}

void loop() {
  unsigned long currentMillis = millis();

  // Take a sample every 5 seconds
  if (currentMillis - lastSampleTime >= SAMPLE_INTERVAL) {
    lastSampleTime = currentMillis;
    
    SHT31Reading r;
    if (readSHT31(r)) {
      tempSum += r.temperatureF;
      humiditySum += r.humidityRH;
    }
    uint16_t voc;
    if (readSGP40(r, voc)) {
    int32_t voc_index = voc_algorithm.process(voc);
    vocIndexSum += voc_index;
    rawVocSum += voc;
    }

      PMSData d;
    if (readPMSFrame(d)) {
    pm1_0Sum += d.pm1_0;
    pm2_5Sum += d.pm2_5;
    pm10Sum += d.pm10;
    
    // Print current readings
    Serial.printf("Current - T: %.2f°F, RH: %.2f%%, VOC Index: %ld\n", 
                    r.temperatureF, r.humidityRH, voc_algorithm.process(voc));
    Serial.printf("PM1.0: %5u µg/m³   PM2.5: %5u µg/m³   PM10: %5u µg/m³\n",
                    d.pm1_0, d.pm2_5, d.pm10);
    }
      
    sampleCount++;
    
  }

  // Calculate and send averages every 3 minutes
  if (currentMillis - lastAverageTime >= AVERAGE_INTERVAL) {
    if (sampleCount > 0) {
      float avgTemp = tempSum / sampleCount;
      float avgHumidity = humiditySum / sampleCount;
      int32_t avgVocIndex = vocIndexSum / sampleCount;
      uint16_t avgRawVoc = rawVocSum / sampleCount;
      uint16_t avgPM1_0 = pm1_0Sum / sampleCount;
      uint16_t avgPM2_5 = pm2_5Sum / sampleCount;
      uint16_t avgPM10 = pm10Sum / sampleCount;

      Serial.println("\nSending 3-minute averages to Cloudflare:");
      Serial.printf("Temperature: %.2f°F\n", avgTemp);
      Serial.printf("Humidity: %.2f%%\n", avgHumidity);
      Serial.printf("VOC Index: %ld\n", avgVocIndex);
      Serial.printf("Raw VOC: %u\n", avgRawVoc);
      Serial.printf("PM1.0: %u µg/m³\n", avgPM1_0);
      Serial.printf("PM2.5: %u µg/m³\n", avgPM2_5);
      Serial.printf("PM10: %u µg/m³\n", avgPM10);
      Serial.printf("Number of samples: %d\n", sampleCount);

      sendDataToCloudflare(avgTemp, avgHumidity, avgVocIndex, avgRawVoc,
                         avgPM1_0, avgPM2_5, avgPM10, sampleCount);

      // Reset sums and counter
      tempSum = 0;
      humiditySum = 0;
      vocIndexSum = 0;
      rawVocSum = 0;
      pm1_0Sum = 0;
      pm2_5Sum = 0;
      pm10Sum = 0;
      sampleCount = 0;
    }
    
    lastAverageTime = currentMillis;
  }
}




