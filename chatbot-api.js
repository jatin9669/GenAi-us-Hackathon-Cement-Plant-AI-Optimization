import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

// In-memory storage for sessions and documents
const sessions = new Map();
const documents = new Map();

// Helper function to extract text from documents
async function extractTextFromDocument(fileBuffer, mimeType, filename) {
    try {
        // Handle text files directly
        if (mimeType === 'text/plain') {
            console.log(`Reading text file: ${filename}`);
            return fileBuffer.toString('utf-8');
        }
        
        // For all other file types (PDF, DOC, DOCX), use Gemini
        console.log(`Using Gemini for text extraction: ${filename}`);
        return await extractTextWithGemini(fileBuffer, mimeType);
        
    } catch (error) {
        console.error('Error extracting text:', error);
        throw new Error(`Failed to extract text from ${filename}: ${error.message}`);
    }
}

// Helper function to extract text using Gemini
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
            throw new Error('API quota exceeded. Please try again later.');
        }
        
        throw new Error('Failed to extract text from document');
    }
}

// Helper function to get or create session
function getOrCreateSession(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            id: sessionId,
            createdAt: new Date(),
            messages: []
        });
    }
    return sessions.get(sessionId);
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
        
        // Store in memory
        documents.set(documentId, {
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
            storage: 'memory'
        };
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
        const session = getOrCreateSession(sessionId);
        
        // Get relevant documents for this session
        const sessionDocs = Array.from(documents.values())
            .filter(doc => doc.sessionId === sessionId);

        // Prepare context and prompt based on available documents
        let prompt = '';
        let hasRelevantDocs = sessionDocs.length > 0;
        
        if (hasRelevantDocs) {
            // Document-based response
            let context = 'Based on the uploaded documents:\n\n';
            sessionDocs.forEach((doc, index) => {
                const filename = doc.metadata?.filename || `Document ${index + 1}`;
                context += `Document: ${filename}\n${doc.content.substring(0, 2000)}...\n\n`;
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

            // Store the conversation
            session.messages.push(
                { role: 'user', content: message, timestamp: new Date() },
                { role: 'assistant', content: aiResponse, timestamp: new Date() }
            );

            res.json({
                success: true,
                response: aiResponse,
                documentsFound: sessionDocs.length,
                storage: 'memory'
            });
        } catch (geminiError) {
            console.error('Gemini API error:', geminiError);
            
            // Handle quota errors gracefully
            if (geminiError.status === 429 || geminiError.message.includes('quota')) {
                const fallbackResponse = hasRelevantDocs 
                    ? `I found ${sessionDocs.length} relevant document(s) for your question, but I'm currently unable to process them due to API quota limits. Please try again later.`
                    : `I'm currently unable to process your request due to API quota limits. Please try again later.`;
                
                res.json({
                    success: true,
                    response: fallbackResponse,
                    documentsFound: sessionDocs.length,
                    storage: 'memory',
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
        const sessionDocs = Array.from(documents.values())
            .filter(doc => doc.sessionId === sessionId);

        res.json({
            success: true,
            sessionId,
            documentCount: sessionDocs.length,
            storage: 'memory'
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
        res.json({
            success: true,
            storage: 'memory',
            documentsCount: documents.size,
            sessionsCount: sessions.size,
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
