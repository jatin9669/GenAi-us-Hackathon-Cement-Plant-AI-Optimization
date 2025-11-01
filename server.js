// server.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

// Load environment variables
dotenv.config();

// === Chatbot setup selection ===
const usePinecone = process.env.USE_PINECONE === 'true';
const isProduction = process.env.NODE_ENV === 'production';

let chatbotModule;
if (usePinecone) {
  chatbotModule = './chatbot-api-pinecone.js';
  console.log('🧠 Using Pinecone chatbot API');
} else if (isProduction) {
  chatbotModule = './chatbot-api-production.js';
  console.log('🧠 Using Production chatbot API (Firestore)');
} else {
  chatbotModule = './chatbot-api.js';
  console.log('🧠 Using Development chatbot API (in-memory)');
}

const { setupChatbotRoutes } = await import(chatbotModule);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// === Google Auth (for Vertex AI) ===
const auth = new GoogleAuth({
  keyFilename: './service-account-key.json',
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

// === Vertex AI Config ===
const project = 'genai-exchange-472212';

// Strength Model (Asia region)
const strengthModel = {
  location: 'asia-south1',
  endpointId: '4339178658552872960'
};

// Demand Model (US region)
const demandModel = {
  location: 'us-south1',
  endpointId: '5189365029614387200'
};

// === Helper: Call Vertex AI ===
async function callVertexAI(instances, { location, endpointId }) {
  const authClient = await auth.getClient();
  const accessToken = await authClient.getAccessToken();

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/${endpointId}:predict`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ instances })
  });

  const result = await response.json();
  console.log(`Vertex AI (${location}) Response:`, JSON.stringify(result));

  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
  return result;
}

// =============================
// 🧱 Cement Strength Prediction
// =============================
app.post('/predict', async (req, res) => {
  try {
    const {
      cement, slag, flyash, water,
      superplasticizer, coarseaggregate, fineaggregate, age
    } = req.body;

    console.log('Strength Model Input:', req.body);

    const instances = [{
      cement: cement.toString(),
      slag: slag.toString(),
      ash: flyash.toString(),
      water: water.toString(),
      superplastic: superplasticizer.toString(),
      coarseagg: coarseaggregate.toString(),
      fineagg: fineaggregate.toString(),
      age: age.toString()
    }];

    const result = await callVertexAI(instances, strengthModel);
    res.json({ prediction: result.predictions[0].value });
  } catch (err) {
    console.error('Strength model error:', err);
    res.status(500).json({ error: 'Strength prediction failed', details: err.message });
  }
});

// =============================
// 📈 Cement Demand Prediction
// =============================
app.post('/predict-demand', async (req, res) => {
  try {
    const {
      date, region, gdp_growth_rate, construction_index,
      rainfall_mm, cement_price_per_ton, infrastructure_spending_million
    } = req.body;

    console.log('Demand Model Input:', req.body);

    const instances = [{
      date: date.toString(),
      region: region.toString(),
      gdp_growth_rate: gdp_growth_rate.toString(),
      construction_index: construction_index.toString(),
      rainfall_mm: rainfall_mm.toString(),
      cement_price_per_ton: cement_price_per_ton.toString(),
      infrastructure_spending_million: infrastructure_spending_million.toString()
    }];

    const result = await callVertexAI(instances, demandModel);
    res.json({ prediction: result.predictions[0].value });
  } catch (err) {
    console.error('Demand model error:', err);
    res.status(500).json({ error: 'Demand prediction failed', details: err.message });
  }
});

// =============================
// 💬 Chatbot (Gemini / Pinecone / Firestore)
// =============================
setupChatbotRoutes(app);

// =============================
// 🔔 Notifications from BigQuery
// =============================
const bigquery = new BigQuery({
  projectId: project,
  keyFilename: './service-account-key.json'
});

// Example: dataset "cement_data", table "anomaly_logs"
app.get('/api/notifications', async (req, res) => {
  try {
    const query = `
      SELECT machine_id, anomaly_ts, details
      FROM \`${project}.cement_ds.notification_log\`
      ORDER BY anomaly_ts DESC
      LIMIT 1
    `;

    const [rows] = await bigquery.query({ query });
    res.json(rows);
  } catch (err) {
    console.error('BigQuery fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// =============================
// 🌐 Static Frontend
// =============================
app.use(express.static('public'));

// =============================
// 🚀 Start Server
// =============================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});

