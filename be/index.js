import express from 'express';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, clusterApiUrl } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { handleBalanceQuery } from './balance-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();

// Enable CORS for all origins and methods
app.use(cors({
    origin: '*',
    methods: '*',
    allowedHeaders: '*'
}));

app.use(express.json());

// Connect to Solana devnet with improved commitment
const connection = new Connection(clusterApiUrl('devnet'), {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000
});

// Helper function to convert lamports to SOL
const lamportsToSol = (lamports) => {
    return lamports / LAMPORTS_PER_SOL;
};

// Create a new wallet
app.post('/api/wallet/create', (req, res) => {
    try {
        const newWallet = Keypair.generate();
        
        const response = {
            publicKey: newWallet.publicKey.toString(),
            secretKey: Buffer.from(newWallet.secretKey).toString('base64'),
            message: 'New wallet created successfully'
        };
        
        res.json(response);
    } catch (error) {
        console.error('Wallet creation error:', error);
        res.status(500).json({
            error: 'Failed to create wallet',
            details: error.message
        });
    }
});

// Get wallet balance with retries
async function getBalanceWithRetry(publicKey, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const balance = await connection.getBalance(publicKey, 'confirmed');
            return balance;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between retries
        }
    }
}

// Get balance
app.get('/api/wallet/balance/:publicKey', async (req, res) => {
    try {
        const publicKey = new PublicKey(req.params.publicKey);
        const balance = await getBalanceWithRetry(publicKey);
        
        const response = {
            publicKey: publicKey.toString(),
            balanceInLamports: balance,
            balanceInSOL: lamportsToSol(balance),
            message: 'Balance fetched successfully'
        };
        
        res.json(response);
    } catch (error) {
        console.error('Balance fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch balance',
            details: error.message
        });
    }
});

// Request airdrop with confirmation
app.post('/api/wallet/airdrop', async (req, res) => {
    try {
        const { publicKey, amount } = req.body;
        
        if (!publicKey || !amount) {
            return res.status(400).json({
                error: 'Missing required parameters',
                details: 'Both publicKey and amount are required'
            });
        }

        const address = new PublicKey(publicKey);
        const lamports = amount * LAMPORTS_PER_SOL;
        
        // Get initial balance
        const initialBalance = await getBalanceWithRetry(address);
        
        // Request airdrop
        const signature = await connection.requestAirdrop(address, lamports);
        
        // Wait for confirmation with detailed status
        try {
            const confirmation = await connection.confirmTransaction(
                signature,
                'confirmed'
            );
            
            if (confirmation.value.err) {
                throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
            }
        } catch (error) {
            throw new Error('Transaction confirmation failed: ' + error.message);
        }

        // Wait a bit for the network to process
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get new balance and verify airdrop
        const newBalance = await getBalanceWithRetry(address);
        const balanceChange = newBalance - initialBalance;

        const response = {
            publicKey: address.toString(),
            signature: signature,
            requestedAmount: amount,
            initialBalanceSOL: lamportsToSol(initialBalance),
            newBalanceSOL: lamportsToSol(newBalance),
            actualChangeSOL: lamportsToSol(balanceChange),
            message: 'Airdrop successful',
            status: 'confirmed'
        };
        
        res.json(response);
    } catch (error) {
        console.error('Airdrop error:', error);
        res.status(500).json({
            error: 'Airdrop failed',
            details: error.message
        });
    }
});

handleBalanceQuery(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});