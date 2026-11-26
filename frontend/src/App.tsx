import React, { useEffect, useState, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardGrid } from './components/DashboardGrid';
import { SubViewContainer } from './components/SubViews';
import { LoginModal } from './components/LoginModal';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<string>('home');
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    const saved = localStorage.getItem('pronote_pauillac_auth_token');
    return saved && saved !== 'default-figma-session' ? saved : null;
  });
  const [mode, setMode] = useState<'demo' | 'real'>('real');
  const [data, setData] = useState<any>(null);
  const [loginModalOpen, setLoginModalOpen] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [hideDisconnectBanner, setHideDisconnectBanner] = useState<boolean>(false);
  const isDisconnectHours = (() => {
    const h = new Date().getHours();
    return h >= 20 || h < 7;
  })();

  const handleLogout = useCallback(() => {
    localStorage.removeItem('pronote_pauillac_auth_token');
    localStorage.removeItem('pronote_pauillac_token');
    setSessionToken(null);
    setData(null);
    setLoginModalOpen(false);
  }, []);

  const fetchState = useCallback(
    async (token: string) => {
      try {
        const res = await fetch('/api/state', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.status === 401) {
          handleLogout();
          return;
        }
        if (res.ok) {
          const json = await res.json();
          setMode(json.mode || 'real');
          const nextData = json.data || {};
          const userName = nextData?.user?.name || 'default';
          const savedSticky = localStorage.getItem(`pronote_pauillac_sticky_${userName}`);
          if (savedSticky && !nextData.sticky_note) {
            nextData.sticky_note = savedSticky;
          }
          setData(nextData);
        }
      } catch (err) {
        console.error('Failed to fetch state from API:', err);
      }
    },
    [handleLogout]
  );

  useEffect(() => {
    if (sessionToken) {
      fetchState(sessionToken);
    }
  }, [sessionToken, fetchState]);

  const handleToggleHomework = async (hwId: string) => {
    if (!sessionToken) return;
    setData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        homeworks: (prev.homeworks || []).map((h: any) =>
          h.id === hwId ? { ...h, done: !h.done } : h
        ),
      };
    });

    try {
      await fetch('/api/homework/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ homework_id: hwId }),
      });
    } catch {
      // Keep optimistic state
    }
  };

  const handleDeleteSubmission = async (hwId: string) => {
    if (!sessionToken) return;
    setData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        homeworks: (prev.homeworks || []).map((h: any) =>
          h.id === hwId
            ? { ...h, submission_deleted: true, type: 'checkbox', done: false }
            : h
        ),
      };
    });

    try {
      await fetch('/api/homework/delete-submission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ homework_id: hwId }),
      });
    } catch {
      // Keep optimistic state
    }
  };

  const handleSaveStickyNote = async (content: string) => {
    const userName = data?.user?.name || 'default';
    localStorage.setItem(`pronote_pauillac_sticky_${userName}`, content);
    if (!sessionToken) return;
    try {
      await fetch('/api/sticky-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ content }),
      });
    } catch {
      // Ignore offline error
    }
  };

  const handleRefresh = async () => {
    if (!sessionToken || refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setMode(json.mode || 'real');
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to refresh state:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkInfoRead = async (infoId: string, read: boolean) => {
    if (!sessionToken) return;
    setData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        informations: (prev.informations || []).map((inf: any) =>
          inf.id === infoId ? { ...inf, read } : inf
        ),
      };
    });
    try {
      await fetch('/api/information/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ info_id: infoId, read }),
      });
    } catch {
      // Keep optimistic state
    }
  };

  const handleReplyDiscussion = async (discussionId: string, message: string) => {
    if (!sessionToken) return;
    const res = await fetch('/api/discussion/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ discussion_id: discussionId, message }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Impossible d'envoyer le message.");
    }
    const json = await res.json();
    setData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        discussions: (prev.discussions || []).map((d: any) =>
          d.id === discussionId ? json.discussion : d
        ),
      };
    });
  };

  const handleMarkDiscussionRead = async (discussionId: string, unread: boolean) => {
    if (!sessionToken) return;
    setData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        discussions: (prev.discussions || []).map((d: any) =>
          d.id === discussionId ? { ...d, unread } : d
        ),
      };
    });
    try {
      await fetch('/api/discussion/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ discussion_id: discussionId, unread }),
      });
    } catch {
      // Keep optimistic state
    }
  };

  const handleCreateDiscussion = async (subject: string, message: string, recipientIds: string[]) => {
    if (!sessionToken) return;
    const res = await fetch('/api/discussion/new', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ subject, message, recipient_ids: recipientIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Erreur lors de la création de la discussion.');
    }
    const json = await res.json();
    setData((prev: any) => {
      if (!prev) return prev;
      return { ...prev, discussions: json.discussions || prev.discussions };
    });
  };

  const handleLoadPeriod = async (periodId: string) => {
    if (!sessionToken) return;
    try {
      const res = await fetch(`/api/period/${encodeURIComponent(periodId)}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.period) {
          setData((prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              periods: (prev.periods || []).map((p: any) =>
                p.id === periodId ? json.period : p
              ),
            };
          });
        }
      }
    } catch {
      // Ignore
    }
  };

  // Connexion obligatoire avant d'accéder à l'interface Pronote
  if (!sessionToken) {
    return (
      <LoginModal
        isOpen={true}
        isMandatory={true}
        onSuccessLogin={(newToken, newMode) => {
          localStorage.setItem('pronote_pauillac_auth_token', newToken);
          setSessionToken(newToken);
          setMode(newMode);
          fetchState(newToken);
        }}
      />
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen pronote-mesh-bg flex items-center justify-center">
        <div className="figma-card px-8 py-6 flex items-center gap-4">
          <div className="w-5 h-5 border-2 border-[#008673] border-t-transparent rounded-full animate-spin" />
          <span className="text-[14px] font-semibold text-[#00584C]">
            Chargement de votre espace Pronote — Lycée Odilon Redon (Pauillac)...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pronote-mesh-bg flex flex-col relative overflow-x-hidden">
      {/* Animated Ambient Shader Blobs matching Figma Frame 1 (#FECC05, #FFFFFF, #009881) */}
      <div
        style={{
          background:
            'radial-gradient(circle, rgba(254,204,5,0.22) 0%, rgba(254,204,5,0) 70%)',
        }}
        className="mesh-blob-1 pointer-events-none fixed top-[20px] left-[32%] w-[640px] h-[420px] rounded-full blur-2xl z-0"
      />
      <div
        style={{
          background:
            'radial-gradient(circle, rgba(0,152,129,0.34) 0%, rgba(0,152,129,0) 70%)',
        }}
        className="mesh-blob-2 pointer-events-none fixed bottom-[-100px] left-[10%] w-[780px] h-[540px] rounded-full blur-3xl z-0"
      />

      {/* Top Header + Black 7-Menu Navigation Bar */}
      <Navbar
        activeView={activeView}
        onSelectView={setActiveView}
        user={
          data.user || {
            name: 'Élève Odilon Redon',
            class_name: 'Première Générale 1',
            establishment: 'Lycée Odilon Redon — Pauillac (0332081H)',
          }
        }
        mode={mode}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onOpenLogin={() => setLoginModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Droit à la déconnexion banner (20h - 7h, matching official Pronote) */}
      {isDisconnectHours && !hideDisconnectBanner && (
        <div className="relative z-10 max-w-[1860px] w-full mx-auto px-4 lg:px-6 pt-3">
          <div className="bg-amber-50/95 border border-amber-300/80 text-amber-950 rounded-lg px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[12px] shadow-sm">
            <div className="flex items-center gap-2">
              <span className="font-bold">🌙 Droit à la déconnexion (20h–7h) :</span>
              <span>
                Vous êtes actuellement dans une plage horaire où certaines notifications Pronote peuvent être différées afin de respecter le droit à la déconnexion.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setHideDisconnectBanner(true)}
              className="px-2.5 py-1 rounded bg-amber-200/70 hover:bg-amber-300/80 text-amber-950 text-[11px] font-semibold cursor-pointer transition-colors shrink-0"
            >
              Masquer ce message
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="relative z-10 flex-1">
        {activeView === 'home' ? (
          <DashboardGrid
            data={data}
            onSelectView={setActiveView}
            onToggleHomework={handleToggleHomework}
            onDeleteSubmission={handleDeleteSubmission}
            onSaveStickyNote={handleSaveStickyNote}
          />
        ) : (
          <SubViewContainer
            viewId={activeView}
            data={data}
            sessionToken={sessionToken}
            onBackHome={() => setActiveView('home')}
            onToggleHomework={handleToggleHomework}
            onDeleteSubmission={handleDeleteSubmission}
            onMarkInfoRead={handleMarkInfoRead}
            onReplyDiscussion={handleReplyDiscussion}
            onMarkDiscussionRead={handleMarkDiscussionRead}
            onCreateDiscussion={handleCreateDiscussion}
            onLoadPeriod={handleLoadPeriod}
          />
        )}
      </main>

      {/* ÉduConnect Account Switch Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        isMandatory={false}
        onClose={() => setLoginModalOpen(false)}
        onSuccessLogin={(newToken, newMode) => {
          localStorage.setItem('pronote_pauillac_auth_token', newToken);
          setSessionToken(newToken);
          setMode(newMode);
          fetchState(newToken);
        }}
      />
    </div>
  );
};

export default App;
