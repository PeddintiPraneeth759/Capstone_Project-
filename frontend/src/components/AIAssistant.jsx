import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';

const AIAssistant = ({ location }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! I\'m your AI Travel Assistant. Ask me about traffic, routes, weather, or anything travel-related! 🚀' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [assistantStatus, setAssistantStatus] = useState('Ready to help');
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const quickPrompts = [
    'Is there traffic ahead?',
    'Which route is safest?',
    'What\'s the weather like?',
    'Any road issues nearby?',
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage("Your browser doesn't support speech recognition. You can still type your message.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      sendMessageRef.current(transcript);
    };
    recognition.onerror = (e) => {
      console.error('Speech error', e);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    
    try {
      recognition.start();
    } catch (error) {
      setIsListening(false);
      setErrorMessage(error.message || 'Voice input could not start.');
    }
  };

  const sendMessage = async (messageText) => {
    const text = messageText || input.trim();
    if (!text || isTyping) return;

    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setErrorMessage('');
    setIsTyping(true);

    try {
      const res = await api.post('/api/assistant/chat', {
        message: text,
        context: {
          location: location || null,
        }
      });

      setAssistantStatus('Ready to help');
      setErrorMessage('');
      setMessages(prev => [...prev, { role: 'assistant', text: res.data.reply }]);
      speakText(res.data.reply);
    } catch (error) {
      console.error('AI Assistant error:', error);
      const message = error.response?.data?.message || error.response?.data?.error || error.message;
      setErrorMessage(message || 'Check your connection and try again.');
      const requiresSignIn = error.response?.data?.message?.includes('Invalid or expired sign-in');
      setAssistantStatus(requiresSignIn ? 'Sign in again' : error.response?.status === 503 ? 'Backend setup needed' : 'Connection issue');
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: error.response?.status === 503
          ? (message || 'The travel assistant is temporarily unavailable. Please check the backend setup.')
          : requiresSignIn
            ? 'Your Firebase sign-in expired. Please sign in again to chat.'
            : message || 'I couldn’t reach the assistant just now. Please try again.'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    const handleUnauthorized = () => {
      setAssistantStatus('Sign in again');
      setErrorMessage('Your sign-in session has expired. Refresh and sign in again to use the assistant.');
    };
    window.addEventListener('wayfare:auth-expired', handleUnauthorized);
    return () => window.removeEventListener('wayfare:auth-expired', handleUnauthorized);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="assistant-fab fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white"
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="assistant-panel fixed bottom-24 right-6 z-50 flex max-h-[560px] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="assistant-header flex items-center gap-3 p-4">
              <div className="assistant-mark grid h-10 w-10 place-items-center rounded-xl">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Your travel companion</h3>
                <p className="assistant-status flex items-center gap-1 text-[10px]">
                  <span className={`assistant-status-dot inline-block h-1.5 w-1.5 rounded-full ${errorMessage ? 'has-error' : ''}`} />
                  {assistantStatus}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="assistant-messages flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'assistant-user-message rounded-br-md'
                      : 'assistant-reply-message rounded-bl-md'
                  }`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
              {errorMessage && !isTyping && (
                <p className="assistant-error" role="status">Connection detail: {errorMessage}</p>
              )}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white/10 px-4 py-3 rounded-2xl rounded-bl-md border border-white/5">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts */}
            {messages.length <= 2 && (
              <div className="px-4 pb-2 flex gap-2 flex-wrap">
                {quickPrompts.map((prompt, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    disabled={isTyping}
                    className="assistant-prompt-chip rounded-full px-3 py-2 text-[11px] transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="assistant-composer p-3">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about traffic, routes..."
                  className="assistant-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm transition-all"
                />
                <motion.button
                  type="button"
                  onClick={startListening}
                  whileTap={{ scale: 0.9 }}
                  className={`assistant-tool-button shrink-0 rounded-xl p-2 transition-colors ${isListening ? 'listening' : ''}`}
                  title="Voice Command"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => sendMessage()}
                  whileTap={{ scale: 0.9 }}
                  disabled={!input.trim() || isTyping}
                  className="assistant-send-button shrink-0 rounded-xl p-2.5 transition-colors disabled:opacity-40"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIAssistant;
