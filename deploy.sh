#!/bin/bash

# Set your project ID
PROJECT_ID="genai-exchange-472212"
SERVICE_NAME="cement-strength-predictor"
REGION="us-central1"

# Build and deploy to Cloud Run
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080
