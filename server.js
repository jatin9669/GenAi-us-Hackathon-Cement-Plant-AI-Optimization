// server.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
// Use Pinecone chatbot API if enabled, otherwise use production/development API
const usePinecone = process.env.USE_PINECONE === 'true';
const isProduction = process.env.NODE_ENV === 'production';

let chatbotModule;
if (usePinecone) {
    chatbotModule = './chatbot-api-pinecone.js';
    console.log('Using Pinecone chatbot API');
} else if (isProduction) {
    chatbotModule = './chatbot-api-production.js';
    console.log('Using Production chatbot API (Firestore)');
} else {
    chatbotModule = './chatbot-api.js';
    console.log('Using Development chatbot API (in-memory)');
}

const { setupChatbotRoutes } = await import(chatbotModule);

const app = express();
app.use(cors()); // allow frontend to call backend
app.use(bodyParser.json());

// Initialize Google Auth
const auth = new GoogleAuth({
  keyFilename: './service-account-key.json',
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

// Replace these with your project info
const project = 'genai-exchange-472212';
const location = 'us-central1';
const endpointId = '8693947292475981824';

app.post('/predict', async (req, res) => {
  try {
    const { cement, slag, flyash, water, superplasticizer, coarseaggregate, fineaggregate, age } = req.body;
    console.log('Input data:', { cement, slag, flyash, water, superplasticizer, coarseaggregate, fineaggregate, age });
    
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
    console.log('Formatted instances:', JSON.stringify(instances));

    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();
    
    const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/${endpointId}:predict`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ instances })
    });
    
    const result = await response.json();
    console.log('Full response:', JSON.stringify(result));
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    res.json({ prediction: result.predictions[0].value });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Prediction failed', details: err.message });
  }
});

// Setup chatbot routes
setupChatbotRoutes(app);

// Serve static files from public directory
app.use(express.static('public'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
