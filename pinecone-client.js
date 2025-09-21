import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';

class PineconeClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.pinecone = null;
        this.index = null;
        this.indexName = 'chatbot-documents';
        this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        this.initialized = false;
    }

    async initialize() {
        try {
            if (!this.apiKey) {
                throw new Error('Pinecone API key not provided');
            }

            this.pinecone = new Pinecone({
                apiKey: this.apiKey,
            });

            // Try to get the index
            try {
                this.index = this.pinecone.index(this.indexName);
                this.initialized = true;
                console.log('Pinecone client initialized successfully');
                return { success: true };
            } catch (indexError) {
                console.log('Index not found, will create it when needed');
                this.initialized = false;
                return { success: false, error: 'Index not found' };
            }
        } catch (error) {
            console.error('Failed to initialize Pinecone:', error);
            this.initialized = false;
            return { success: false, error: error.message };
        }
    }

    async healthCheck() {
        try {
            if (!this.initialized) {
                const initResult = await this.initialize();
                if (!initResult.success) {
                    return { success: false, error: initResult.error };
                }
            }

            // Try to get index stats
            const stats = await this.index.describeIndexStats();
            return {
                success: true,
                indexName: this.indexName,
                totalVectors: stats.totalVectorCount || 0,
                dimension: stats.dimension || 1536
            };
        } catch (error) {
            console.error('Pinecone health check failed:', error);
            return { success: false, error: error.message };
        }
    }

    async generateEmbedding(text) {
        try {
            const result = await this.model.embedContent(text);
            return result.embedding.values;
        } catch (error) {
            console.error('Error generating embedding:', error);
            throw error;
        }
    }

    async storeDocument(sessionId, documentId, content, metadata = {}) {
        try {
            if (!this.initialized) {
                const initResult = await this.initialize();
                if (!initResult.success) {
                    return { success: false, error: initResult.error };
                }
            }

            // Generate embedding for the content
            const embedding = await this.generateEmbedding(content);

            // Prepare the vector
            const vector = {
                id: documentId,
                values: embedding,
                metadata: {
                    sessionId,
                    content: content.substring(0, 40000), // Limit content size
                    ...metadata,
                    timestamp: new Date().toISOString()
                }
            };

            // Upsert the vector
            await this.index.upsert([vector]);

            return {
                success: true,
                documentId,
                vectorId: documentId
            };
        } catch (error) {
            console.error('Error storing document in Pinecone:', error);
            return { success: false, error: error.message };
        }
    }

    async searchDocuments(sessionId, query, topK = 3) {
        try {
            if (!this.initialized) {
                const initResult = await this.initialize();
                if (!initResult.success) {
                    return { success: false, error: initResult.error, documents: [] };
                }
            }

            // Generate embedding for the query
            const queryEmbedding = await this.generateEmbedding(query);

            // Search for similar vectors
            const searchResults = await this.index.query({
                vector: queryEmbedding,
                topK,
                filter: { sessionId: { $eq: sessionId } },
                includeMetadata: true
            });

            // Format the results
            const documents = searchResults.matches.map(match => ({
                id: match.id,
                content: match.metadata.content,
                metadata: match.metadata,
                score: match.score
            }));

            return {
                success: true,
                documents,
                query
            };
        } catch (error) {
            console.error('Error searching documents in Pinecone:', error);
            return { success: false, error: error.message, documents: [] };
        }
    }

    async getSessionDocuments(sessionId) {
        try {
            if (!this.initialized) {
                const initResult = await this.initialize();
                if (!initResult.success) {
                    return { success: false, error: initResult.error, documents: [] };
                }
            }

            // Query all documents for the session
            const searchResults = await this.index.query({
                vector: new Array(1536).fill(0), // Dummy vector
                topK: 100,
                filter: { sessionId: { $eq: sessionId } },
                includeMetadata: true
            });

            const documents = searchResults.matches.map(match => ({
                id: match.id,
                metadata: match.metadata
            }));

            return {
                success: true,
                documents
            };
        } catch (error) {
            console.error('Error getting session documents:', error);
            return { success: false, error: error.message, documents: [] };
        }
    }
}

export default PineconeClient;
