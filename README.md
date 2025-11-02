# 🏭 Cement Plant AI Optimization Application

> A full-stack AI-powered web application designed to optimize cement plant operations — integrating real-time monitoring, predictive analytics, video-based inspection, and conversational AI.

## ⚙️ Setup Instructions

### 1️⃣ Create Environment Variables
Create a `.env` file in the root directory with the following variables:

```env
# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

# Google Cloud Configuration
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json

# Pinecone Configuration
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_environment
PINECONE_INDEX_NAME=your_index_name

# Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key

# Server Configuration
PORT=3000
```

### 2️⃣ Add Your Google Cloud Service Account
Place your Google Cloud service account key file in the root directory and name it:
```
service-account-key.json
```

### 3️⃣ Install Dependencies
```bash
npm install
```

### 4️⃣ Run the Application
```bash
npm start
```

The app will start on http://localhost:3000

## 🧩 Key Functional Modules

### 🤖 MCP Assistant (Gemini)
- Conversational AI that answers operator queries using BigQuery data
- Provides insights on Lime Saturation Factor (LSF), power usage, fuel consumption, and production trends
- Supports forecasting clinker production and power consumption

### 📊 Anomaly Dashboard
- Displays real-time sensor data (temperature, feed rate, vibration)
- Detects and flags anomalies using dynamic thresholding
- Allows filtering by machine, date, and anomaly type

### 🧱 Strength & Demand Predictors (Vertex AI AutoML)
- Predicts compressive strength from mix composition
- Forecasts cement demand using economic and environmental indicators

### 🔥 Clinker Quality Detector (AutoML Vision)
- Analyzes video frames to classify clinker as underburnt, overburnt, or optimal
- Powered by Vertex AI AutoML Vision for accurate classification with probability scores

### 📦 Packaging QC Detector (AutoML Vision)
- Detects tears, damage, and misprinted labels in final packaging
- Uses video frame analysis for automated quality control before dispatch

### 💬 CementGPT Chatbot (Gemini + Pinecone)
- Document-based AI assistant for plant manuals, quality reports, and production documents
- Provides contextual insights and data summaries from internal knowledge bases

### 📈 Plant Dashboard (Looker Studio)
- Real-time visualization of production KPIs, CO₂ emissions, and machine performance
- Integrated with BigQuery for live reporting and analytics

## 🧠 Features of MCP Assistant

Query capabilities:
- Historical data like average feed rate, temperature readings, or LSF stats
- Production and power consumption trends from BigQuery
- Future clinker output or fuel demand predictions

### 🛠️ Available Tools

| Tool Name | Description |
|-----------|-------------|
| `forecast_clinker_production` | Forecast future clinker production rates |
| `forecast_power_consumption` | Predict plant's total power consumption |
| `get_al2o3_stats` | Get min/max/avg Aluminium Oxide % from raw mix samples |
| `get_free_lime_stats` | Get total/avg clinker free lime % by equipment |
| `get_kiln_feed_stats` | Get min/max/avg kiln feed rate (tph) by equipment |
| `get_kiln_temp_stats` | Get min/max/avg kiln burning zone temperature |
| `get_lsf_stats` | Get min/max/avg Lime Saturation Factor from samples |
| `get_plant_power_stats` | Get total/avg plant power consumption (MW) |
| `get_production_stats` | Get total/avg clinker production (tph) by equipment |
| `get_raw_mill_feed_stats` | Get min/max/avg raw mill feed rate (tph) |
| `get_raw_mill_power_stats` | Get min/max/avg raw mill power draw (kW) |
| `get_sio2_stats` | Get min/max/avg Silicon Dioxide % from raw mix samples |

Example Queries:
- "Show LSF values for 17 September 2025"
- "How was the temperature in Raw Mill 1 last week?"
- "Forecast clinker production for the next 3 days"
- "Get Al2O3 stats between March 1-15"
- "Show kiln feed rate stats for Kiln 2 this month"
- "What was the average power consumption last week?"

## 📁 Project Structure

```
Cement-Plant-AI-Optimization/
│
├── server.js                # Main Node.js backend
├── .env                     # Environment variables
├── service-account-key.json # Google Cloud credentials
│
├── public/                  # Frontend (HTML, CSS, JS)
│   ├── index.html          # Main dashboard
│   ├── dashboard.html      # Anomaly monitoring
│   ├── strength.html       # Strength prediction form
│   ├── demand.html         # Demand forecasting
│   ├── clinker.html        # Clinker quality detection
│   ├── packaging.html      # Packaging QC inspection
│   ├── chatbot.html        # CementGPT AI assistant
│   └── mcp.html            # Conversational MCP assistant
│
├── chatbot-api.js          # API for Gemini and Pinecone
├── pinecone-client.js      # Pinecone vector database client
├── utils/                  # Helper functions and middleware
│
├── app.yaml                # GCP App Engine configuration
├── Dockerfile              # Docker container setup
└── deploy.sh              # Deployment script
```

## ☁️ Deployment

Deploy to Google Cloud Platform using:
```bash
gcloud app deploy
```

Required configurations:
- app.yaml for App Engine setup
- Dockerfile for container build
- service-account-key.json for credentials

## 🔒 Security Guidelines

- Do not commit `.env` or `service-account-key.json` to version control
- Rotate API keys regularly
- Use separate GCP projects or Firebase environments for dev/staging/prod
- Enable IAM-based access control for secure data operations

## 🚀 Future Enhancements

- Using streaming inputs for detection through Vision AI (clinker quality prediction and package quality detection). We don't have access to live streaming input data for     now. 
- Integrate streaming data pipeline for continuous sensor ingestion using Pub/Sub
- Add multi-language support for MCP and CementGPT assistants
- Expand Packaging QC to detect barcode and logo anomalies
- Build mobile app version for real-time on-site plant insights

## 🧱 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express |
| Database | BigQuery |
| AI Models | Vertex AI AutoML (Clinker, Strength, Demand, Packaging QC) |
| Conversational AI | Gemini API + MCP Toolbox + Pinecone |
| Visualization | Looker Studio |
| Messaging/Alerts | Firebase Cloud Messaging, Twilio |
| Deployment | Google Cloud App Engine, Docker |

> ✅ Cement Plant AI Optimization enables data-driven, intelligent, and sustainable cement production — from raw material handling to packaging QC.
