# Deepfake Detection Application

A privacy-focused web application for screening images for signs of AI-generated or manipulated content.

Users can upload an image, receive a preliminary analysis, and view a confidence score with a plain-language explanation. The application is designed for everyday users, content creators, small businesses, educators, and cybersecurity professionals.

> **Project status:** Core frontend and backend structure are completed. The pre-trained deepfake detection model has not yet been integrated.

## Project Goals

- Build a functional full-stack image screening application
- Provide clear analysis results and confidence information
- Handle uploaded images temporarily and minimize data retention
- Provide an accessible interface for non-technical users
- Keep the detection layer modular so the selected pre-trained model can be replaced if needed

## Architecture

```text
React / TypeScript
        │
        │ /api
        ▼
FastAPI / Python
        │
        ├── Authentication
        ├── Image validation & temporary handling
        ├── Image preprocessing
        └── Pre-trained detection model
                │
                ▼
        Analysis result
        ├── Result state
        ├── Confidence
        └── Explanation

Firebase Authentication ──► User access
Firestore ────────────────► Saved result metadata
```
## Members

- Rojin Osia - Backend Developer
- Nattharut Natvongsaku - Frontend Developer and UX/UI Designer
- Lucy Kwak - Product Research, Backend Development, and Frontend Support
- Terry Kim - Backend Development, System Integration, and Project Coordination
- Trinity Ma

## Tech Stack

**Frontend**
- React 18
- TypeScript
- Vite
- CSS3

**Backend**
- Python
- FastAPI
- Uvicorn

**Authentication & Storage**
- Firebase Authentication
- Firebase Firestore

**Detection**
- Pre-trained deepfake detection model — **not yet integrated**

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 20.19+ or 22.12+

### Backend

```bash
cd backend

python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
python main.py
```

Backend: `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

The Vite development server proxies `/api` requests to the backend.

## Current Limitations

- The deepfake detection model has not yet been integrated.
- Model inference and final evaluation metrics are not yet available.
- The application is a screening tool, not a forensic or identity-verification authority.
- Detection results should not be treated as definitive proof.

## Frontend Documentation

See [`frontend/README.md`](frontend/README.md) for the frontend route map, design tokens, Figma references, and documented design deviations.
