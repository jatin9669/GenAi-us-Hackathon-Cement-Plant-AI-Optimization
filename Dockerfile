# Use Node.js official image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY backend/ ./
COPY public/ ./public/

# Expose port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
