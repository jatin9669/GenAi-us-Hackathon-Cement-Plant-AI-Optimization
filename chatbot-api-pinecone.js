import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PineconeClient from './pinecone-client.js';
// Removed pdf-parse due to deployment issues

const router = express.Router();

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Initialize Pinecone Client
const pinecone = new PineconeClient(process.env.PINECONE_API_KEY);

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, TXT, DOC, and DOCX files are allowed.'));
        }
    }
});

// In-memory fallback storage
const fallbackSessions = new Map();
const fallbackDocuments = new Map();

// Helper function to extract text from documents
async function extractTextFromDocument(fileBuffer, mimeType, filename) {
    try {
        // Handle text files directly
        if (mimeType === 'text/plain') {
            console.log(`Reading text file: ${filename}`);
            return fileBuffer.toString('utf-8');
        }
        
        // For all other file types (PDF, DOC, DOCX), use Gemini with quota handling
        console.log(`Using Gemini for text extraction: ${filename}`);
        return await extractTextWithGemini(fileBuffer, mimeType);
        
    } catch (error) {
        console.error('Error extracting text:', error);
        throw new Error(`Failed to extract text from ${filename}: ${error.message}`);
    }
}

// Helper function to extract text using Gemini (with quota handling)
async function extractTextWithGemini(fileBuffer, mimeType) {
    try {
        const base64Data = fileBuffer.toString('base64');
        
        const prompt = `Extract all text content from this document. 
        Provide a clean, readable version of the text without any formatting artifacts.
        Return only the extracted text content.`;

        const result = await model.generateContent([
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            },
            prompt
        ]);

        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error extracting text with Gemini:', error);
        
        // Check if it's a quota error
        if (error.status === 429 || error.message.includes('quota')) {
            throw new Error('API quota exceeded. Please try again later or upload PDF/TXT files for better processing.');
        }
        
        throw new Error('Failed to extract text from document');
    }
}

// Helper function to get or create session
async function getOrCreateSession(sessionId) {
    try {
        // Check Pinecone health first
        const healthCheck = await pinecone.healthCheck();
        if (!healthCheck.success) {
            console.log('Pinecone unavailable, using fallback storage');
            if (!fallbackSessions.has(sessionId)) {
                fallbackSessions.set(sessionId, {
                    id: sessionId,
                    createdAt: new Date(),
                    messages: []
                });
            }
            return fallbackSessions.get(sessionId);
        }

        // For Pinecone, we don't need to store session info
        // Just return a simple session object
        return {
            id: sessionId,
            createdAt: new Date(),
            messages: []
        };
    } catch (error) {
        console.error('Error in getOrCreateSession:', error);
        // Fallback to in-memory storage
        if (!fallbackSessions.has(sessionId)) {
            fallbackSessions.set(sessionId, {
                id: sessionId,
                createdAt: new Date(),
                messages: []
            });
        }
        return fallbackSessions.get(sessionId);
    }
}

// Helper function to process and store file
async function processAndStoreFile(sessionId, file) {
    try {
        console.log(`Processing file: ${file.originalname} for session: ${sessionId}`);
        
        // Extract text using the new method
        const extractedText = await extractTextFromDocument(file.buffer, file.mimetype, file.originalname);
        
        if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('No text could be extracted from the document');
        }

        const documentId = `${sessionId}_${Date.now()}_${file.originalname}`;
        
        // Try to store in Pinecone
        const pineconeResult = await pinecone.storeDocument(sessionId, documentId, extractedText, {
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        });

        if (pineconeResult.success) {
            console.log(`Document stored in Pinecone: ${documentId}`);
            return {
                success: true,
                documentId,
                filename: file.originalname,
                textLength: extractedText.length,
                storage: 'pinecone'
            };
        } else {
            // Fallback to in-memory storage
            console.log('Pinecone storage failed, using fallback');
            const docKey = `${sessionId}_${documentId}`;
            fallbackDocuments.set(docKey, {
                id: documentId,
                sessionId,
                content: extractedText,
                metadata: {
                    filename: file.originalname,
                    mimetype: file.mimetype,
                    size: file.size,
                    timestamp: new Date().toISOString()
                }
            });
            
            return {
                success: true,
                documentId,
                filename: file.originalname,
                textLength: extractedText.length,
                storage: 'fallback'
            };
        }
    } catch (error) {
        console.error('Error processing file:', error);
        throw error;
    }
}

// Upload documents endpoint
router.post('/upload', upload.array('documents', 10), async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        console.log(`Processing ${req.files.length} files for session: ${sessionId}`);

        const results = [];
        const errors = [];

        for (const file of req.files) {
            try {
                const result = await processAndStoreFile(sessionId, file);
                results.push(result);
            } catch (error) {
                console.error(`Error processing file ${file.originalname}:`, error);
                errors.push({
                    filename: file.originalname,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Processed ${results.length} documents successfully`,
            results,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Error in upload endpoint:', error);
        res.status(500).json({ 
            error: 'Failed to process documents',
            details: error.message 
        });
    }
});

// Chat endpoint
router.post('/chat', async (req, res) => {
    try {
        const { sessionId, message } = req.body;
        
        if (!sessionId || !message) {
            return res.status(400).json({ error: 'Session ID and message are required' });
        }

        console.log(`Chat request for session: ${sessionId}`);

        // Get session
        const session = await getOrCreateSession(sessionId);
        
        // Get relevant documents using Pinecone search
        let relevantDocs = [];
        const pineconeSearchResult = await pinecone.searchDocuments(sessionId, message, 3);
        
        if (pineconeSearchResult.success && pineconeSearchResult.documents.length > 0) {
            relevantDocs = pineconeSearchResult.documents;
            console.log(`Found ${relevantDocs.length} relevant documents from Pinecone`);
        } else {
            // Fallback: search in-memory documents
            console.log('Searching fallback documents');
            const sessionDocs = Array.from(fallbackDocuments.entries())
                .filter(([key, doc]) => doc.sessionId === sessionId)
                .map(([key, doc]) => doc);
            
            if (sessionDocs.length > 0) {
                relevantDocs = sessionDocs.slice(0, 3); // Take first 3 as fallback
                console.log(`Found ${relevantDocs.length} documents in fallback storage`);
            }
        }

        // Prepare context and prompt based on available documents
        let prompt = '';
        let hasRelevantDocs = relevantDocs.length > 0;
        
        if (hasRelevantDocs) {
            // Document-based response
            let context = 'Based on the uploaded documents:\n\n';
            relevantDocs.forEach((doc, index) => {
                const content = doc.content || doc.text || '';
                const filename = doc.metadata?.filename || doc.filename || `Document ${index + 1}`;
                context += `Document: ${filename}\n${content.substring(0, 2000)}...\n\n`;
            });
            
            prompt = `${context}

User question: ${message}

Please provide a comprehensive, well-formatted answer based primarily on the information from the uploaded documents. Format your response with:
- Use **bold** for important terms and headings
- Use bullet points (-) for lists
- Use numbered lists (1., 2., 3.) for sequential steps
- Separate paragraphs with line breaks
- If the documents don't contain enough information, supplement with general knowledge while clearly indicating what comes from documents vs. general knowledge

Make your response clear, organized, and easy to read.`;
        } else {
            // General knowledge response when no documents are available
            prompt = `You are a helpful AI assistant. The user has asked: "${message}"

Since no relevant documents have been uploaded for this question, please provide a helpful and informative response based on your general knowledge. 

Format your response with:
- Use **bold** for important terms and headings
- Use bullet points (-) for lists  
- Use numbered lists (1., 2., 3.) for sequential steps
- Separate paragraphs with line breaks
- Make it clear, organized, and easy to read

If this question would benefit from specific documentation or context, you can suggest that the user upload relevant documents for more targeted assistance.`;
        }

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const aiResponse = response.text();

            // Store the conversation (in session object for now)
            session.messages.push(
                { role: 'user', content: message, timestamp: new Date() },
                { role: 'assistant', content: aiResponse, timestamp: new Date() }
            );

            res.json({
                success: true,
                response: aiResponse,
                documentsFound: relevantDocs.length,
                storage: pineconeSearchResult.success ? 'pinecone' : 'fallback'
            });
        } catch (geminiError) {
            console.error('Gemini API error:', geminiError);
            
            // Handle quota errors gracefully
            if (geminiError.status === 429 || geminiError.message.includes('quota')) {
                const fallbackResponse = hasRelevantDocs 
                    ? `I found ${relevantDocs.length} relevant document(s) for your question, but I'm currently unable to process them due to API quota limits. Please try again later, or contact support for assistance.`
                    : `I'm currently unable to process your request due to API quota limits. Please try again later. In the meantime, you can upload PDF or text documents for better processing efficiency.`;
                
                res.json({
                    success: true,
                    response: fallbackResponse,
                    documentsFound: relevantDocs.length,
                    storage: pineconeSearchResult.success ? 'pinecone' : 'fallback',
                    warning: 'API quota exceeded'
                });
            } else {
                throw geminiError; // Re-throw non-quota errors
            }
        }

    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({ 
            error: 'Failed to process chat message',
            details: error.message 
        });
    }
});

// Get session info endpoint
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Get documents count
        const pineconeResult = await pinecone.getSessionDocuments(sessionId);
        let documentCount = 0;
        let storage = 'fallback';
        
        if (pineconeResult.success) {
            documentCount = pineconeResult.documents.length;
            storage = 'pinecone';
        } else {
            // Check fallback storage
            const fallbackCount = Array.from(fallbackDocuments.entries())
                .filter(([key, doc]) => doc.sessionId === sessionId).length;
            documentCount = fallbackCount;
        }

        res.json({
            success: true,
            sessionId,
            documentCount,
            storage
        });

    } catch (error) {
        console.error('Error getting session info:', error);
        res.status(500).json({ 
            error: 'Failed to get session info',
            details: error.message 
        });
    }
});

// Health check endpoint
router.get('/health', async (req, res) => {
    try {
        const pineconeHealth = await pinecone.healthCheck();
        
        res.json({
            success: true,
            pinecone: pineconeHealth.success ? 'connected' : 'unavailable',
            pineconeDetails: pineconeHealth.success ? {
                indexName: pineconeHealth.indexName,
                totalVectors: pineconeHealth.totalVectors,
                dimension: pineconeHealth.dimension
            } : { error: pineconeHealth.error },
            fallbackStorage: 'available',
            geminiAI: process.env.GOOGLE_API_KEY ? 'configured' : 'not configured'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Setup function to match the expected interface
export function setupChatbotRoutes(app) {
    app.use('/api/chatbot', router);
}

export default router;
