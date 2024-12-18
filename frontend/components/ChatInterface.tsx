'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Message } from '@/app/types';

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chatMessages');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    localStorage.setItem('chatMessages', JSON.stringify(messages));
  }, [messages]);

  const formatRecommendations = (recommendations: any[]) => {
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      return "No suitable courses found based on your input.";
    }

    return recommendations.map(course => (
      `🎓 ${course.course_code}: ${course.title}\n` +
      `📊 Average Grade: ${course.average_grade}\n` +
      `📚 Workload: ${course.workload}\n` +
      `📅 Class Times: ${course.class_times?.join(', ') || 'N/A'}\n` +
      `💡 Recommendation Reason: ${course.reason}\n` +
      `📝 Comments: ${course.comments}\n`
    )).join('\n');
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      sender: 'user',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      console.log('Sending request with input:', input);
      
      const response = await fetch('http://localhost:2000/api/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: input }),
      });

      console.log('Received response:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (response.ok) {
        if (data.recommendations && Array.isArray(data.recommendations)) {
          const systemMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: formatRecommendations(data.recommendations),
            sender: 'system',
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, systemMessage]);
        } else {
          throw new Error('Invalid recommendations format received');
        }
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: `Error: ${data.error}\nDetails: ${data.details || 'No additional details available'}`,
          sender: 'system',
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error in handleSend:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `An error occurred: ${error.message || 'Unknown error'}. Please check the console for more details.`,
        sender: 'system',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem('chatMessages');
  };

  const downloadHistory = () => {
    const content = messages
      .map(m => `[${new Date(m.timestamp).toLocaleString()}] ${m.sender}: ${m.content}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat-history.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-lg shadow-lg">
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-xl font-semibold">Course Recommendation Assistant</h2>
        <div className="space-x-2">
          <Button variant="outline" size="sm" onClick={clearHistory}>
            Clear History
          </Button>
          <Button variant="outline" size="sm" onClick={downloadHistory}>
            Download Chat
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.sender === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <pre className="whitespace-pre-wrap font-sans">
                  {message.content}
                </pre>
                <span className="text-xs opacity-75 mt-1 block">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-3">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex space-x-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Tell me about your interests and courses taken..."
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={isTyping}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}