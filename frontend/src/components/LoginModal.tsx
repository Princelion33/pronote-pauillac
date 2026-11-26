import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface LoginModalProps {
  isOpen: boolean;
  isMandatory?: boolean;
  onClose?: () => void;
  onSuccessLogin: (token: string, mode: 'real' | 'demo') => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  isMandatory = false,
  onClose,
  onSuccessLogin,
}) => {
  const isRemoteHost =
    typeof window !== 'undefined' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname);
  const [loginTab, setLoginTab] = useState<'educonnect' | 'qrcode'>(
    isRemoteHost ? 'qrcode' : 'educonnect'
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [qrJson, setQrJson] = useState('');
  const [qrPin, setQrPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEduConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          mode: 'educonnect',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || 'Erreur de connexion ÉduConnect.');
      }
      onSuccessLogin(json.token, 'real');
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le serveur ÉduConnect.');
    } finally {
      setLoading(false);
    }
  };

  const handleQrCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_json: qrJson.trim(),
          pin: qrPin.trim(),
          mode: 'qrcode',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || 'Erreur de connexion par QR Code.');
      }
      onSuccessLogin(json.token, 'real');
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || 'QR Code invalide ou expiré.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-4 ${
        isMandatory ? 'pronote-mesh-bg' : 'bg-black/60 backdrop-blur-sm'
      }`}
    >
      {isMandatory && (
        <>
          <div
            style={{
              background:
                'radial-gradient(circle, rgba(254,204,5,0.24) 0%, rgba(254,204,5,0) 70%)',
            }}
            className="mesh-blob-1 pointer-events-none fixed top-[30px] left-[28%] w-[640px] h-[420px] rounded-full blur-2xl z-0"
          />
          <div
            style={{
              background:
                'radial-gradient(circle, rgba(0,152,129,0.36) 0%, rgba(0,152,129,0) 70%)',
            }}
            className="mesh-blob-2 pointer-events-none fixed bottom-[-80px] left-[12%] w-[780px] h-[540px] rounded-full blur-3xl z-0"
          />
        </>
      )}

      {/* Top Branding Banner on Mandatory Full-Screen Login */}
      {isMandatory && (
        <div className="relative z-10 flex items-center gap-4 mb-6 bg-white/90 backdrop-blur-md px-6 py-3 rounded-full shadow-lg border border-black/10">
          <img
            src="/assets/logo-lycee-or.png"
            alt="Lycée Odilon Redon"
            className="w-10 h-10 object-contain"
          />
          <div className="h-6 w-[1px] bg-black/15" />
          <img
            src="/assets/logo-pronote.png"
            alt="PRONOTE"
            className="h-6 object-contain"
          />
          <span className="text-[12px] font-bold text-[#00584C] bg-[#CDF3ED] px-2.5 py-0.5 rounded-full">
            Pauillac • 0332081H
          </span>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-[470px] bg-white rounded-[16px] shadow-2xl border border-black/10 overflow-hidden"
      >
        {/* Top Emerald & Black Header */}
        <div className="bg-black text-white px-6 py-4 flex items-center justify-between border-b-[3px] border-[#008673]">
          <div className="flex items-center gap-3">
            <img
              src="/assets/logo-lycee-or.png"
              alt="Lycée Odilon Redon"
              className="w-10 h-10 rounded bg-white p-0.5 object-contain"
            />
            <div>
              <h2 className="text-[15px] font-bold leading-tight">
                Authentification Pronote Requise
              </h2>
              <p className="text-[11px] font-medium text-[#6BC5B7]">
                Lycée Odilon Redon (Pauillac) • ÉduConnect / Lycée Connecté
              </p>
            </div>
          </div>

          {!isMandatory && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Method Selector Tabs */}
        <div className="grid grid-cols-2 bg-[#F4F7F6] p-1.5 mx-6 mt-5 rounded-lg border border-black/10 gap-1">
          <button
            type="button"
            onClick={() => {
              setLoginTab('qrcode');
              setError(null);
            }}
            className={`py-2 rounded-md text-[12px] font-bold transition-all cursor-pointer ${
              loginTab === 'qrcode'
                ? 'bg-[#008673] text-white shadow-sm'
                : 'text-black/70 hover:text-black'
            }`}
          >
            QR Code Pronote
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginTab('educonnect');
              setError(null);
            }}
            className={`py-2 rounded-md text-[12px] font-bold transition-all cursor-pointer ${
              loginTab === 'educonnect'
                ? 'bg-[#008673] text-white shadow-sm'
                : 'text-black/70 hover:text-black'
            }`}
          >
            ÉduConnect
          </button>
        </div>

        {loginTab === 'educonnect' ? (
          <form onSubmit={handleEduConnectSubmit} className="p-6 pt-4 space-y-4">
            <div className="p-3 rounded-lg bg-[#CDF3ED]/55 border border-[#008673]/30 text-[12px] text-[#00584C] font-medium leading-relaxed">
              Connectez-vous avec votre <strong>identifiant et mot de passe ÉduConnect</strong> (idéal en local ; sur serveur en ligne, préférez l’onglet <strong>QR Code Pronote</strong>).
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-[12px] font-semibold leading-snug">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[12px] font-bold text-black mb-1">
                Identifiant ÉduConnect
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: prenom.nom12"
                className="w-full h-[42px] px-3.5 rounded-lg border border-black/20 text-[13px] font-medium focus:outline-none focus:border-[#008673] focus:ring-2 focus:ring-[#008673]/20"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-black mb-1">
                Mot de passe ÉduConnect
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Votre mot de passe ÉduConnect"
                  className="w-full h-[42px] pl-3.5 pr-11 rounded-lg border border-black/20 text-[13px] font-medium focus:outline-none focus:border-[#008673] focus:ring-2 focus:ring-[#008673]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={
                    showPassword
                      ? 'Masquer le mot de passe'
                      : 'Afficher le mot de passe'
                  }
                  aria-label={
                    showPassword
                      ? 'Masquer le mot de passe'
                      : 'Afficher le mot de passe'
                  }
                  className="absolute right-2.5 p-1.5 rounded-md text-black/55 hover:text-[#008673] hover:bg-black/5 transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    /* Eye-Off Icon */
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    /* Eye Icon */
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: 'linear-gradient(90deg, #008673 0%, #009881 100%)',
              }}
              className="w-full h-[44px] rounded-lg text-white text-[13px] font-bold shadow-md hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {loading
                ? 'Authentification ÉduConnect en cours...'
                : 'Se connecter avec ÉduConnect'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleQrCodeSubmit} className="p-6 pt-4 space-y-4">
            <div className="p-3 rounded-lg bg-[#CDF3ED]/55 border border-[#008673]/30 text-[12px] text-[#00584C] font-medium leading-relaxed">
              Sur votre Pronote officiel (icône <strong>QR Code</strong> en haut à droite), générez un QR Code avec un code PIN à 4 chiffres, scannez-le pour récupérer son texte JSON et collez-le ci-dessous.
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-[12px] font-semibold leading-snug">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[12px] font-bold text-black mb-1">
                Contenu JSON du QR Code Pronote
              </label>
              <textarea
                rows={3}
                required
                value={qrJson}
                onChange={(e) => setQrJson(e.target.value)}
                placeholder='{"jeton":"...","login":"...","url":"https://0332081h.index-education.net/pronote/eleve.html"}'
                className="w-full p-2.5 rounded-lg border border-black/20 text-[11px] font-mono focus:outline-none focus:border-[#008673]"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-black mb-1">
                Code PIN à 4 chiffres
              </label>
              <input
                type="text"
                maxLength={4}
                required
                value={qrPin}
                onChange={(e) => setQrPin(e.target.value)}
                placeholder="ex: 1234"
                className="w-full h-[40px] px-3.5 rounded-lg border border-black/20 text-[13px] font-bold tracking-widest focus:outline-none focus:border-[#008673]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: 'linear-gradient(90deg, #008673 0%, #009881 100%)',
              }}
              className="w-full h-[44px] rounded-lg text-white text-[13px] font-bold shadow-md hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Validation du QR Code...' : 'Se connecter par QR Code'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
};
