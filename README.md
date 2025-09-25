# Cement Plant AI Optimization Application

This is a web application for cement plant AI optimization with chatbot functionality and production monitoring.

## Setup Instructions

### 1. Environment Variables

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

### 2. Service Account Key

Add your Google Cloud service account key file as `service-account-key.json` in the root directory.

### 3. Installation

```bash
npm install
```

### 4. Running the Application

```bash
npm start
```

The application will be available at `http://localhost:3000`

## Features

- **Dashboard**: Production monitoring and analytics
- **Chatbot**: AI-powered assistance for cement plant operations
- **Production Tracking**: Real-time production data visualization
- **Strength Analysis**: Cement strength prediction and analysis
- **Assistant powered by MCP**: AI assistant built using MCP Toolbox and Agent ADK, connected to BigQuery to answer queries related to the cement plabt data instead of having to manually search

## Features of MCP Assistant (yet to be enhanced):
- Average raw material consumption and composition over a couple of days
- Feed rate/temperature sensor readings
- LSF (Lime Saturation Factor) values
- Clinker production and power consumption logs
- Upcoming feature: Forecasting clinker production and power consumption for the next couple of days

Here are some of the questions you can experiment with for now:
- How was the temperature range in Raw Mill 1 on 17 September 2025?
- Show LSF values from 17th September 2025
- How has the clinker production been from 17 September 2025 - 20 September 2025?

## File Structure

- `server.js` - Main server file
- `public/` - Static web files
  - `index.html` - Main dashboard
  - `chatbot.html` - Chatbot interface
  - `production.html` - Production monitoring
  - `strength.html` - Strength analysis
- `chatbot-api.js` - Chatbot API endpoints
- `pinecone-client.js` - Pinecone vector database client

## Deployment

The application can be deployed to Google Cloud Platform using the provided configuration files:

- `app.yaml` - App Engine configuration
- `Dockerfile` - Docker container configuration
- `deploy.sh` - Deployment script

## Security Notes

- Never commit `.env` files or service account keys to version control
- Keep your API keys secure and rotate them regularly
- Use environment-specific configurations for different deployment stages
