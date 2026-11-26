# PRONOTE Custom — Lycée Odilon Redon (Pauillac `0332081H`)

Refonte complète de l'interface web de Pronote basée sur la maquette et les animations Figma (`UBEWl9SY9q6fv8CWDosM24`), connectée au portail **ÉduConnect / Lycée Connecté Nouvelle-Aquitaine** et au serveur **PRONOTE 2026** du Lycée Odilon Redon (`https://0332081h.index-education.net/pronote/`).

## Démarrage rapide en local

Double-cliquez sur [`start.bat`](./start.bat) ou lancez :

1. **Serveur Backend (API Pronote & ÉduConnect SAML) :**
   ```bash
   cd backend
   python -m uvicorn main:app --host 0.0.0.0 --port 8000
   ```
2. **Interface Web (Vite + React + Framer Motion) :**
   ```bash
   cd frontend
   npm run dev
   ```
3. Ouvrez **http://localhost:5173** (ou **http://localhost:8000** qui sert également le build de production complet).
