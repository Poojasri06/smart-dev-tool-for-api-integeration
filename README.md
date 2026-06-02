# ⚡ Smart DevTool — API Integration Generator

> Paste any API documentation URL, describe what you want to do, pick your language.
> Get a production-ready SDK wrapper in under 30 seconds.

## 🚀 Setup & Run

### Prerequisites
- Python 3.10+
- Node.js 18+
- Free Groq API key from [console.groq.com](https://console.groq.com)

### Backend
```bash
cd backend
pip install -r requirements.txt
copy .env.example .env   # then paste your Groq key
uvicorn main:app --reload
```

Create `backend/.env`:
```
GROQ_API_KEY=gsk_your_key_here
```

Verify key: `python check_groq_key.py`  
Health check: http://127.0.0.1:8000/health

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

## 📁 Structure
```
smart-devtool/
├── backend/
│   ├── main.py
│   ├── scraper.py
│   ├── gemini_client.py   # Groq LLM (named for legacy)
│   ├── security.py
│   ├── models.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## 🛠️ Tech Stack
- Frontend: React + Vite
- Backend: FastAPI
- AI: Groq (LLaMA 3.3 70B)
- Scraping: BeautifulSoup4
