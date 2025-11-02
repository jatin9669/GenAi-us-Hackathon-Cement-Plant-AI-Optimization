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
//app.use(bodyParser.json());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// === Google Auth (for Vertex AI) ===
const auth = new GoogleAuth({
  keyFilename: './service-account-key.json',
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

const adkAuth = new GoogleAuth({
  keyFilename: './service-account-key.json'
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

const clinkerQuality = {
  location: 'us-central1',
  endpointId: '1039811444922646528'
}

const packagingQualityDetector = {
  location: 'europe-west4',
  endpointId: '5846545328559357952'
}

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
// 🏭 Clinker Quality Detection
// =============================
app.post('/detect-clinker', async (req, res) => {
  try {
    // The frontend will send a JSON object: { "image": "..." }
    // where "image" is the Base64 encoded string of a video frame.
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image data provided.' });
    }

    console.log('Clinker Detector Input: Image data received (Base64 string)');

    // Format the instances for an AutoML Image Object Detection model.
    // It expects an object with a "content" key.
    const instances = [
      {
        "content": image 
      }
    ];

    // Call your existing helper function with the new model config
    const result = await callVertexAI(instances, clinkerQuality);

    // Send back the full list of predictions (all detected objects)
    // This will be an array of objects with bounding boxes, labels, and scores.
    res.json({ predictions: result.predictions });

  } catch (err) {
    console.error('Clinker detector model error:', err);
    res.status(500).json({ error: 'Clinker detection failed', details: err.message });
  }
});

// =============================
// 📦 Packaging Quality Detection
// =============================
app.post('/detect-packaging', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image data provided.' });
    }

    console.log('Packaging Detector Input: Image data received (Base64 string)');

    const instances = [
      {
        "content": image 
      }
    ];

    // Call your helper function with the NEW model config
    const result = await callVertexAI(instances, packagingQualityDetector);

    res.json({ predictions: result.predictions });

  } catch (err) {
    console.error('Packaging detector model error:', err);
    res.status(500).json({ error: 'Packaging detection failed', details: err.message });
  }
});

// =============================
// 🤖 MCP Agent (ADK)
// =============================

// --- Agent Configuration ---
const adkAgentUrl = 'https://cement-service-875435952297.us-central1.run.app';
// !! IMPORTANT !! Change 'capital_agent' to your agent's real name.
// This is the name of the folder your agent's code is in (e.g., 'mcp_agent').
const ADK_AGENT_NAME = 'cement-app'; 

/**
 * Calls the deployed Google ADK agent on Cloud Run.
 * This function now:
 * 1. Creates/updates the session, passing the CURRENT_TIME to fix date issues.
 * 2. Handles the "Session already exists" error.
 * 3. Correctly parses the array response from the /run endpoint.
 */
async function callAdkAgent(prompt) {
  // 1. Get an Identity Token for the Cloud Run service
  const authClient = await adkAuth.getIdTokenClient(adkAgentUrl);
  const headers = await authClient.getRequestHeaders();
  const authHeader = headers['Authorization']; // Get the "Bearer ..." token

  // --- STEP 1: Create or Update the Session (with current_time) ---
  const sessionUrl = `${adkAgentUrl}/apps/${ADK_AGENT_NAME}/users/hackathon_user/sessions/hackathon_session`;
  
  try {
    console.log('ADK Step 1: Attempting to create/update session...');
    
    // We send the current time so the agent knows what "today" is.
    // This fixes the "future date" error.
    const now = new Date();
    const sessionPayload = {
      "preferred_language": "English",
      "context": {
        "current_time": now.toISOString()
      }
    };

    const sessionResponse = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sessionPayload)
    });
    
    if (sessionResponse.ok) {
      console.log('ADK Step 1: Session created/updated successfully.');
    } else {
      const errorJson = await sessionResponse.json();
      if (sessionResponse.status === 400 && errorJson.detail?.includes("Session already exists")) {
        console.log('ADK Step 1: Session already exists. This is expected. Continuing...');
      } else {
        throw new Error(`Session creation failed: ${sessionResponse.status} ${JSON.stringify(errorJson)}`);
      }
    }

  } catch (err) {
    console.error("Error in ADK session creation/check:", err);
    throw err; 
  }

  // --- STEP 2: Run the Agent (with the prompt) ---
  const runUrl = `${adkAgentUrl}/run`;
  
  const runPayload = {
    "app_name": ADK_AGENT_NAME,
    "user_id": "hackathon_user",
    "session_id": "hackathon_session",
    "new_message": {
      "role": "user",
      "parts": [{ "text": prompt }]
    }
  };
  
  console.log('ADK Step 2: Calling /run with payload:', JSON.stringify(runPayload));
  
  const runResponse = await fetch(runUrl, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(runPayload)
  });

  const result = await runResponse.json();
  console.log('ADK Step 2 Response:', JSON.stringify(result));

  if (result.error || !runResponse.ok || result.detail) {
    throw new Error(result.error?.message || result.detail || JSON.stringify(result));
  }

  // The ADK agent returns an array of response messages.
  // We need to parse the first message in that array.
  if (Array.isArray(result) && result.length > 0) {
    // Get the last message from the agent
    const finalMessage = result[result.length - 1];
    
    if (finalMessage.content && finalMessage.content.parts && finalMessage.content.parts.length > 0 && finalMessage.content.parts[0].text) {
      // Return the text from the "model" role
      return finalMessage.content.parts[0].text;
    }
  }
  
  return "Agent returned an unexpected response format.";
}

app.post('/ask-mcp', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided.' });
    }
    
    const agentResponse = await callAdkAgent(prompt);
    res.json({ text: agentResponse });

  } catch (err) {
    console.error('MCP Agent error:', err);
    res.status(500).json({ error: 'Failed to query MCP agent', details: err.message });
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
      LIMIT 5
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

