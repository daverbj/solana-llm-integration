import express from 'express';
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { OutputFixingParser, StructuredOutputParser } from "langchain/output_parsers";
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize OpenAI and Connection
const model = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    modelName: 'gpt-3.5-turbo'
});

const connection = new Connection(clusterApiUrl('devnet'), {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000
});

// Define the output parser
const parser = StructuredOutputParser.fromNamesAndDescriptions({
    action: "The action to perform (either 'get_balance' or 'request_address')",
    publicKey: "The Solana public key if provided in the query, or 'none' if not found",
    needsAddress: "String 'true' if we need to ask the user for an address, 'false' otherwise"
});

// Create a fixing parser to handle potential parsing errors
const fixingParser = OutputFixingParser.fromLLM(model, parser);

// Create prompt template
const promptTemplate = new PromptTemplate({
    template: `Extract information from the following user query about a Solana wallet balance.
    If a public key/address is mentioned, identify it. If no address is provided, indicate that we need to request it.

    User Query: {query}

    {format_instructions}
    
    Helpful notes:
    - Solana addresses are base58-encoded and typically 32-44 characters long
    - They often start with a number or letter
    - If you're unsure if something is a valid address, set needsAddress to 'true'
    - All values in the response must be strings
    - Use 'none' for publicKey if no address is found
    - Use 'true' or 'false' as strings for needsAddress
    
    Provide your response in the exact format requested:`,
    inputVariables: ["query"],
    partialVariables: {
        format_instructions: parser.getFormatInstructions()
    }
});

// Helper function to check if a string might be a Solana address
function isPotentiallySolanaAddress(str) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str);
}

// Helper function to get balance with retry logic
async function getBalanceWithRetry(publicKey, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const balance = await connection.getBalance(publicKey, 'confirmed');
            return balance;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// New natural language balance endpoint
async function handleBalanceQuery(app) {
    app.post('/api/natural/balance', async (req, res) => {
        try {
            const { query } = req.body;
            
            if (!query) {
                return res.status(400).json({
                    error: 'Missing query parameter',
                    message: 'Please provide a natural language query'
                });
            }

            // Format the prompt
            const promptValue = await promptTemplate.format({
                query: query
            });

            // Get LLM response
            const llmResponse = await model.invoke(promptValue);
            const llmResponseText = llmResponse.content;
            
            // Parse the response using the fixing parser
            const parsedResponse = await fixingParser.parse(llmResponseText);

            // If we need an address, return a request for it
            if (parsedResponse.needsAddress === 'true' || parsedResponse.publicKey === 'none') {
                return res.json({
                    status: 'needs_address',
                    message: 'Please provide a Solana wallet address to check the balance'
                });
            }

            // Verify the provided address
            if (!isPotentiallySolanaAddress(parsedResponse.publicKey)) {
                return res.status(400).json({
                    error: 'Invalid address format',
                    message: 'The provided address does not appear to be a valid Solana address'
                });
            }

            // Get the balance
            try {
                const publicKey = new PublicKey(parsedResponse.publicKey);
                const balance = await getBalanceWithRetry(publicKey);
                
                const response = {
                    status: 'success',
                    publicKey: publicKey.toString(),
                    balanceInLamports: balance,
                    balanceInSOL: balance / 1e9,
                    message: 'Balance fetched successfully'
                };
                
                res.json(response);
            } catch (error) {
                res.status(400).json({
                    error: 'Balance fetch failed',
                    message: error.message
                });
            }
        } catch (error) {
            console.error('Natural language processing error:', error);
            res.status(500).json({
                error: 'Processing failed',
                message: error.message
            });
        }
    });
}

export { handleBalanceQuery };