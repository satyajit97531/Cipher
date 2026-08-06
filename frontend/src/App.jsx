import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// Axios global setup to attach JWT token to every request
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await axios.post(`http://localhost:5000${endpoint}`, { username, password });
      if (isLogin) {
        localStorage.setItem('token', res.data.token);
        navigate('/history');
      } else {
        alert('Registration complete. You may now login, detective.');
        setIsLogin(true);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'An error occurred.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>{isLogin ? 'Sign In To HQ' : 'Register New Detective'}</h2>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="Alias (Username)" value={username} onChange={e => setUsername(e.target.value)} required />
          <input type="password" placeholder="Passcode" value={password} onChange={e => setPassword(e.target.value)} required />
          <button type="submit" className="action-btn">{isLogin ? 'Enter' : 'Register'}</button>
        </form>
        <p onClick={() => setIsLogin(!isLogin)} className="toggle-auth">
          {isLogin ? "Need a badge? Register here." : "Already have a badge? Sign in."}
        </p>
      </div>
    </div>
  );
}

function CaseHistory() {
  const [chats, setChats] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('http://localhost:5000/api/chats')
      .then(res => setChats(res.data))
      .catch(() => navigate('/')); // Redirect to auth if token fails
  }, [navigate]);

  return (
    <div className="history-container">
      <div className="history-header">
        <h2>Cases</h2>
        <button onClick={() => { localStorage.removeItem('token'); navigate('/'); }} className="logout-btn">Log Out</button>
      </div>
      <div className="case-list">
        <Link to="/chat/new" className="case-card new-case">+ Start a New Case</Link>
        {chats.map(chat => (
          <Link to={`/chat/${chat._id}`} key={chat._id} className="case-card">
            <h4>{chat.title}</h4>
            <small>{new Date(chat.updatedAt).toLocaleDateString()}</small>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ChatRoom() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [currentChatId, setCurrentChatId] = useState(chatId);
  const [selectedImage, setSelectedImage] = useState(null); // 👈 Holds the image file string

  useEffect(() => {
    if (chatId !== 'new') {
      axios.get(`http://localhost:5000/api/chats/${chatId}`)
        .then(res => setMessages(res.data.messages))
        .catch(err => console.error(err));
    } else {
      setMessages([{ text: "What's the situation, a new mystery to solve?", sender: 'cipher' }]);
    }
  }, [chatId]);

  // 👈 Converts uploaded image into Base64 format
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        setSelectedImage(reader.result); 
      };
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && !selectedImage) return;

    const displayResponse = selectedImage ? `[Attached Photo] ${input}` : input;
    setMessages(prev => [...prev, { text: displayResponse, sender: 'user' }]);
    
    // Save variables locally to clear input boxes instantly
    const messageToSend = input;
    const imageToSend = selectedImage;
    
    setInput('');
    setSelectedImage(null);

    try {
      // Send both text and image together
      const res = await axios.post(`http://localhost:5000/api/chats/${currentChatId}`, {
        message: messageToSend,
        image: imageToSend
      });
      
      setMessages(prev => [...prev, { text: res.data.reply, sender: 'cipher' }]);
      if (currentChatId === 'new') {
        setCurrentChatId(res.data.chatId);
        navigate(`/chat/${res.data.chatId}`, { replace: true });
      }
    } catch (err) {
      setMessages(prev => [...prev, { text: 'Connection lost.', sender: 'cipher' }]);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <Link to="/history" className="back-btn">← Files</Link>
        Cipher🕵🏻‍♀️
      </div>
      <div className="chat-window">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message-wrapper ${msg.sender}`}>
            <div className="message-bubble">{msg.text}</div>
          </div>
        ))}
      </div>

      {/* 👈 Small preview box above the input so you know an image is loaded */}
      {selectedImage && (
        <div style={{ display: 'flex', padding: '10px 20px', background: '#0d0d0f', alignItems: 'center', gap: '10px' }}>
          <img src={selectedImage} alt="preview" style={{ height: '50px', borderRadius: '4px', border: '1px solid #d4af37' }} />
          <button type="button" onClick={() => setSelectedImage(null)} style={{ background: '#442222', color: '#fff', border: 'none', padding: '2px 8px', cursor: 'pointer' }}>❌</button>
        </div>
      )}

      <form onSubmit={sendMessage} className="chat-input-area">
        {/* 👈 The Custom Upload Button */}
        <label style={{ display: 'flex', alignItems: 'center', fontSize: '1.5rem', cursor: 'pointer', padding: '0 10px', color: '#777' }}>
          📎
          <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
        </label>
        
        <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message to collect evidence..." />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/history" element={<CaseHistory />} />
        <Route path="/chat/:chatId" element={<ChatRoom />} />
      </Routes>
    </Router>
  );
}