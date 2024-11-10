import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';

export default function WalletChat() {
  const [messages, setMessages] = useState([
    {
      type: 'bot',
      content: "Hello! I can help you today?'"
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatBalance = (balanceInSOL) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 9
    }).format(balanceInSOL);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage = inputValue;
    setInputValue('');
    setIsLoading(true);

    // Add user message to chat
    setMessages(prev => [...prev, { type: 'user', content: userMessage }]);

    try {
      const response = await fetch('http://localhost:3000/api/natural/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage })
      });

      const data = await response.json();

      // Format bot response based on API response
      let botMessage = '';
      if (data.status === 'needs_address') {
        botMessage = "Please provide a Solana wallet address for me to check the balance.";
      } else if (data.status === 'success') {
        botMessage = `The wallet ${data.publicKey.slice(0, 4)}...${data.publicKey.slice(-4)} has a balance of ${formatBalance(data.balanceInSOL)} SOL`;
      } else {
        botMessage = `Error: ${data.message || 'Something went wrong'}`;
      }

      setMessages(prev => [...prev, { type: 'bot', content: botMessage }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        type: 'bot', 
        content: "Sorry, I couldn't process your request. Please try again." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Chat header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-6 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white">Solana Wallet Assistant</h1>
          <p className="text-purple-200 text-sm mt-1">Ask me about any wallet balance</p>
        </div>
      </div>

      {/* Chat container */}
      <div className="flex-1 overflow-hidden flex flex-col max-w-7xl mx-auto w-full">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${
                    message.type === 'user'
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-br-none'
                      : 'bg-white text-gray-800 rounded-bl-none'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl px-4 py-2 rounded-bl-none shadow-sm">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="border-t bg-white p-4 sm:p-6">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="flex space-x-4">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about a wallet balance..."
                className="flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 bg-gray-50"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl px-6 py-3 hover:from-purple-700 hover:to-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}