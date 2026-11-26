import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import jsQR from 'jsqr';

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
  const [qrStatus, setQrStatus] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eduVerify, setEduVerify] = useState<{
    challenge_id: string;
    title: string;
    prompt: string;
    input_name?: string;
    input_label?: string;
    choices?: Array<{ name: string; value: string; label: string }>;
    error?: string | null;
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const applyDecodedQr = useCallback(
    (rawText: string) => {
      try {
        const parsed = JSON.parse(rawText);
        if (!parsed || typeof parsed !== 'object' || !parsed.jeton) {
          throw new Error('Not a Pronote QR');
        }
        setQrJson(rawText);
        setQrStatus('✓ QR Code Pronote lu avec succès !');
        setError(null);
        stopCamera();
      } catch {
        setError("Ce QR Code n'est pas un QR Code de connexion Pronote valide.");
      }
    },
    [stopCamera]
  );

  const decodeQrFromImageFile = useCallback(
    (file: File | Blob) => {
      setError(null);
      setQrStatus(null);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setError("Impossible de lire l'image dans ce navigateur.");
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            applyDecodedQr(code.data);
          } else {
            setError(
              'Aucun QR Code détecté dans cette capture. Essaie une capture plus nette autour du carré QR.'
            );
          }
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setError("Impossible de charger l'image.");
      };
      img.src = url;
    },
    [applyDecodedQr]
  );

  useEffect(() => {
    if (!isOpen || loginTab !== 'qrcode') {
      stopCamera();
      return;
    }
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            decodeQrFromImageFile(blob);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isOpen, loginTab, decodeQrFromImageFile, stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      const scanFrame = () => {
        const video = videoRef.current;
        if (!streamRef.current) return;
        if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data) {
              applyDecodedQr(code.data);
              return;
            }
          }
        }
        rafRef.current = requestAnimationFrame(scanFrame);
      };
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
          rafRef.current = requestAnimationFrame(scanFrame);
        }
      }, 50);
    } catch {
      setError("Accès à la caméra refusé ou indisponible. Utilise plutôt Ctrl+V ou l'import de capture !");
      stopCamera();
    }
  };

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
      if (json.requires_verification) {
        setEduVerify(json);
        setVerifyCode('');
        setError(json.error || null);
        return;
      }
      onSuccessLogin(json.token, 'real');
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le serveur ÉduConnect.');
    } finally {
      setLoading(false);
    }
  };

  const handleEduVerifySubmit = async (choice?: { name: string; value: string }) => {
    if (!eduVerify) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/educonnect-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: eduVerify.challenge_id,
          code: eduVerify.input_name ? verifyCode : undefined,
          choice_name: choice?.name,
          choice_value: choice?.value,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || 'Échec de vérification ÉduConnect.');
      }
      if (json.requires_verification) {
        setEduVerify(json);
        setVerifyCode('');
        setError(json.error || null);
        return;
      }
      setEduVerify(null);
      onSuccessLogin(json.token, 'real');
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la vérification.');
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
          eduVerify ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleEduVerifySubmit();
              }}
              className="p-6 pt-4 space-y-4"
            >
              <div className="p-3 rounded-lg bg-[#CDF3ED]/55 border border-[#008673]/30 text-[12px] text-[#00584C] leading-relaxed">
                <strong className="block text-[13px] mb-1">{eduVerify.title}</strong>
                <span>{eduVerify.prompt}</span>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-[12px] font-semibold leading-snug">
                  {error}
                </div>
              )}

              {eduVerify.input_name && (
                <div>
                  <label className="block text-[12px] font-bold text-black mb-1">
                    {eduVerify.input_label || 'Code de confirmation'}
                  </label>
                  <input
                    type="text"
                    required
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    placeholder="Entrez le code reçu..."
                    className="w-full h-[42px] px-3.5 rounded-lg border border-black/20 text-[14px] font-bold tracking-wider focus:outline-none focus:border-[#008673] focus:ring-2 focus:ring-[#008673]/20"
                  />
                </div>
              )}

              {eduVerify.choices && eduVerify.choices.length > 0 && !eduVerify.input_name ? (
                <div className="space-y-2">
                  {eduVerify.choices.map((ch, idx) => (
                    <button
                      key={`${ch.name}-${idx}`}
                      type="button"
                      disabled={loading}
                      onClick={() => handleEduVerifySubmit({ name: ch.name, value: ch.value })}
                      style={{
                        background: 'linear-gradient(90deg, #008673 0%, #009881 100%)',
                      }}
                      className="w-full py-2.5 px-4 rounded-lg text-white text-[13px] font-bold shadow-sm hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
                    >
                      {loading ? 'Envoi en cours...' : ch.label}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: 'linear-gradient(90deg, #008673 0%, #009881 100%)',
                  }}
                  className="w-full h-[44px] rounded-lg text-white text-[13px] font-bold shadow-md hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Vérification en cours...' : 'Confirmer mon identité'}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setEduVerify(null);
                  setError(null);
                }}
                className="w-full py-2 text-[12px] font-semibold text-black/60 hover:text-black cursor-pointer"
              >
                ← Revenir à la connexion ÉduConnect
              </button>
            </form>
          ) : (
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
          )
        ) : (
          <form onSubmit={handleQrCodeSubmit} className="p-6 pt-4 space-y-4">
            <div className="p-3 rounded-lg bg-[#CDF3ED]/55 border border-[#008673]/30 text-[12px] text-[#00584C] font-medium leading-relaxed">
              Sur ton Pronote officiel (icône <strong>QR Code</strong> en haut à droite), génère un QR Code avec un PIN à 4 chiffres, fais une capture d’écran (<strong>Win+Shift+S</strong>) puis fais simplement <strong>Ctrl+V</strong> ici !
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-[12px] font-semibold leading-snug">
                {error}
              </div>
            )}

            {qrStatus && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-[12px] font-bold leading-snug">
                {qrStatus}
              </div>
            )}

            {/* Easy Paste / Drop / Upload / Camera QR box */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) decodeQrFromImageFile(file);
              }}
              className="rounded-xl border-2 border-dashed border-[#008673]/45 bg-[#F4F7F6] p-3.5 text-center space-y-2.5"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) decodeQrFromImageFile(file);
                }}
              />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-lg bg-white hover:bg-[#CDF3ED]/50 border border-black/15 text-[12px] font-bold text-[#00584C] cursor-pointer shadow-sm transition-colors"
                >
                  📷 Importer une image
                </button>
                <button
                  type="button"
                  onClick={() => (cameraActive ? stopCamera() : startCamera())}
                  className="px-3.5 py-2 rounded-lg bg-white hover:bg-[#CDF3ED]/50 border border-black/15 text-[12px] font-bold text-[#00584C] cursor-pointer shadow-sm transition-colors"
                >
                  {cameraActive ? '⏹ Arrêter caméra' : '🎥 Scanner caméra'}
                </button>
              </div>
              <p className="text-[11px] font-medium text-black/60">
                Ou appuie directement sur <strong>Ctrl+V</strong> après une capture d’écran !
              </p>
              {cameraActive && (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full max-h-[180px] rounded-lg border border-black/15 object-cover"
                />
              )}
            </div>

            <details className="text-[11px] text-black/65">
              <summary className="cursor-pointer font-semibold hover:text-black">
                Avancé : coller le texte JSON manuellement
              </summary>
              <textarea
                rows={2}
                value={qrJson}
                onChange={(e) => {
                  setQrJson(e.target.value);
                  setQrStatus(e.target.value.trim() ? '✓ JSON saisi' : null);
                }}
                placeholder='{"jeton":"...","login":"...","url":"https://0332081h.index-education.net/pronote/eleve.html"}'
                className="w-full mt-2 p-2 rounded-lg border border-black/20 text-[11px] font-mono focus:outline-none focus:border-[#008673]"
              />
            </details>

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
              disabled={loading || !qrJson.trim()}
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
