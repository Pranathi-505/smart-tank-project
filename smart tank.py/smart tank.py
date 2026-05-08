# smart-tank-project
from flask import Flask, jsonify
import random
from datetime import datetime

app = Flask(__name__)

# Threshold limits
MIN_LEVEL = 20        # %
MAX_LEVEL = 90        # % overflow alert
MIN_PH = 6.5
MAX_PH = 8.5
MAX_TURBIDITY = 5.0   # NTU
MAX_TEMP = 35.0       # °C

def generate_sensor_data():
    """Simulate sensor readings."""
    level = round(random.uniform(0, 100), 2)
    ph = round(random.uniform(5.5, 9.5), 2)
    turbidity = round(random.uniform(0, 10), 2)
    temperature = round(random.uniform(15, 45), 2)

    alerts = []

    if level < MIN_LEVEL:
        alerts.append("Low water level")
    if level > MAX_LEVEL:
        alerts.append("Overflow danger")
    if ph < MIN_PH or ph > MAX_PH:
        alerts.append("Unsafe pH level")
    if turbidity > MAX_TURBIDITY:
        alerts.append("High turbidity / dirty water")
    if temperature > MAX_TEMP:
        alerts.append("High water temperature")

    status = "SAFE" if not alerts else "ALERT"

    return {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "level_percent": level,
        "ph": ph,
        "turbidity_ntu": turbidity,
        "temperature_c": temperature,
        "status": status,
        "alerts": alerts
    }

@app.route("/")
def home():
    return jsonify({
        "message": "Smart Tank Water Quality & Level Monitoring System API",
        "endpoints": ["/api/readings"]
    })

@app.route("/api/readings")
def readings():
    data = generate_sensor_data()
    return jsonify(data)

if __name__ == "__main__":
    app.run(debug=True)
    {
  "timestamp": "2026-05-07 10:00:00",
  "level_percent": 78.5,
  "ph": 7.2,
  "turbidity_ntu": 3.1,
  "temperature_c": 28.4,
  "status": "SAFE",
  "alerts": []
}
#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "YOUR_WIFI_NAME";
const char* password = "YOUR_WIFI_PASSWORD";

// Flask server URL
const char* serverUrl = "http://YOUR_FLASK_IP:5000/api/readings";

// Pins
const int trigPin = 5;
const int echoPin = 18;
const int phPin = 34;
const int turbidityPin = 35;
const int tempPin = 32;

void setup() {
  Serial.begin(115200);

  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected");
}

float getWaterLevel() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH);
  float distance = duration * 0.034 / 2;   // cm

  float tankHeight = 100.0;                 // example tank height in cm
  float levelPercent = 100.0 - ((distance / tankHeight) * 100.0);

  if (levelPercent < 0) levelPercent = 0;
  if (levelPercent > 100) levelPercent = 100;

  return levelPercent;
}

float readPH() {
  int value = analogRead(phPin);
  float voltage = value * (3.3 / 4095.0);
  float ph = 7 + ((2.5 - voltage) * 3.0);   // simple conversion
  return ph;
}

float readTurbidity() {
  int value = analogRead(turbidityPin);
  float voltage = value * (3.3 / 4095.0);
  float turbidity = (3.3 - voltage) * 3.0;   // simple conversion
  if (turbidity < 0) turbidity = 0;
  return turbidity;
}

float readTemperature() {
  int value = analogRead(tempPin);
  float voltage = value * (3.3 / 4095.0);
  float temperature = voltage * 30.0;        // example conversion
  return temperature;
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    float level = getWaterLevel();
    float ph = readPH();
    float turbidity = readTurbidity();
    float temperature = readTemperature();

    String jsonData = "{";
    jsonData += "\"level_percent\":" + String(level, 2) + ",";
    jsonData += "\"ph\":" + String(ph, 2) + ",";
    jsonData += "\"turbidity_ntu\":" + String(turbidity, 2) + ",";
    jsonData += "\"temperature_c\":" + String(temperature, 2);
    jsonData += "}";

    int httpResponseCode = http.POST(jsonData);

    Serial.println("Sent data:");
    Serial.println(jsonData);
    Serial.print("HTTP Response: ");
    Serial.println(httpResponseCode);

    http.end();
  }

  delay(5000);
}
from flask import Flask, request, jsonify
from firebase_admin import credentials, initialize_app, db
from datetime import datetime

app = Flask(__name__)

# Firebase setup
cred = credentials.Certificate("firebase_key.json")
initialize_app(cred, {
    "databaseURL": "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com/"
})

# Thresholds
MIN_LEVEL = 20
MAX_LEVEL = 90
MIN_PH = 6.5
MAX_PH = 8.5
MAX_TURBIDITY = 5.0
MAX_TEMP = 35.0

latest_data = {}

def check_alerts(data):
    alerts = []

    if data["level_percent"] < MIN_LEVEL:
        alerts.append("Low water level")
    if data["level_percent"] > MAX_LEVEL:
        alerts.append("Overflow danger")
    if data["ph"] < MIN_PH or data["ph"] > MAX_PH:
        alerts.append("Unsafe pH level")
    if data["turbidity_ntu"] > MAX_TURBIDITY:
        alerts.append("High turbidity / dirty water")
    if data["temperature_c"] > MAX_TEMP:
        alerts.append("High water temperature")

    return alerts

@app.route("/")
def home():
    return jsonify({"message": "Smart Tank API running"})

@app.route("/api/readings", methods=["POST"])
def receive_readings():
    global latest_data

    data = request.get_json()

    if not data:
        return jsonify({"error": "No data received"}), 400

    data["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    data["alerts"] = check_alerts(data)
    data["status"] = "SAFE" if len(data["alerts"]) == 0 else "ALERT"

    latest_data = data

    # Save to Firebase
    ref = db.reference("smart_tank/readings")
    ref.push(data)

    # Save latest value too
    db.reference("smart_tank/latest").set(data)

    return jsonify({"message": "Data stored successfully", "data": data}), 200

@app.route("/api/latest", methods=["GET"])
def get_latest():
    return jsonify(latest_data)

@app.route("/api/history", methods=["GET"])
def get_history():
    ref = db.reference("smart_tank/readings")
    data = ref.get()
    return jsonify(data if data else {})

if __name__ == "__main__":
    app.run(debug=True)
    import React, { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

export default function Dashboard() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);

  const fetchData = async () => {
    try {
      const latestRes = await fetch("http://localhost:5000/api/latest");
      const latestData = await latestRes.json();
      setLatest(latestData);

      const historyRes = await fetch("http://localhost:5000/api/history");
      const historyData = await historyRes.json();

      const arr = Object.keys(historyData || {}).map((key) => ({
        time: historyData[key].timestamp,
        level_percent: historyData[key].level_percent,
        ph: historyData[key].ph,
        turbidity_ntu: historyData[key].turbidity_ntu,
        temperature_c: historyData[key].temperature_c
      }));

      setHistory(arr.slice(-10));
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>Smart Tank Water Monitoring Dashboard</h1>

      {latest ? (
        <div style={{ marginBottom: "20px" }}>
          <h2>Status: {latest.status}</h2>
          <p>Time: {latest.timestamp}</p>
          <p>Water Level: {latest.level_percent}%</p>
          <p>pH: {latest.ph}</p>
          <p>Turbidity: {latest.turbidity_ntu} NTU</p>
          <p>Temperature: {latest.temperature_c} °C</p>

          <h3>Alerts</h3>
          {latest.alerts && latest.alerts.length > 0 ? (
            <ul>
              {latest.alerts.map((alert, index) => (
                <li key={index} style={{ color: "red" }}>{alert}</li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "green" }}>No alerts</p>
          )}
        </div>
      ) : (
        <p>Loading latest data...</p>
      )}

      <h3>Trend Chart</h3>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={history}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="level_percent" stroke="#8884d8" name="Level %" />
          <Line type="monotone" dataKey="ph" stroke="#82ca9d" name="pH" />
          <Line type="monotone" dataKey="turbidity_ntu" stroke="#ff7300" name="Turbidity" />
          <Line type="monotone" dataKey="temperature_c" stroke="#ff0000" name="Temperature" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}