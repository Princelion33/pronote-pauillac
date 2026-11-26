import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface NavSubItem {
  id: string;
  label: string;
  isSectionHeader?: boolean;
}

export interface NavMenuConfig {
  id: string;
  label: string;
  width: number;
  items: NavSubItem[];
}

/**
 * Exact 7 Navigation Menus & Sub-items extracted from the Figma JSON (Component 1, 10, 12, 13, 14, 15)
 */
export const FIGMA_NAV_MENUS: NavMenuConfig[] = [
  {
    id: 'mes-donnees',
    label: 'Mes données',
    width: 98,
    items: [
      { id: 'compte', label: 'Compte' },
      { id: 'documents', label: 'Documents' },
    ],
  },
  {
    id: 'cahier-de-textes',
    label: 'Cahier de textes',
    width: 117,
    items: [
      { id: 'contenus-ressources', label: 'Contenus et ressources' },
      { id: 'travail-a-faire', label: 'Travail à faire' },
      { id: 'forums-pedagogiques', label: 'Forums pédagogiques' },
    ],
  },
  {
    id: 'notes',
    label: 'Notes',
    width: 71,
    items: [
      { id: 'mes-notes', label: 'Mes notes' },
      { id: 'releve', label: 'Relevé' },
      { id: 'bulletins-header', label: 'Bulletins', isSectionHeader: true },
      { id: 'mon-bulletin', label: 'Mon bulletin de notes' },
      { id: 'bulletin-classe', label: 'Bulletin de ma classe' },
      { id: 'anciens-bulletins', label: 'Anciens bulletins' },
    ],
  },
  {
    id: 'competences',
    label: 'Compétences',
    width: 117,
    items: [
      { id: 'eval-header', label: 'Évaluations', isSectionHeader: true },
      { id: 'mes-evaluations', label: 'Mes évaluations' },
      { id: 'difficultes-appui', label: 'Difficultés et points d’appui' },
      { id: 'bilan-per-header', label: 'Bilan périodique', isSectionHeader: true },
      { id: 'comp-mon-bulletin', label: 'Mon bulletin de notes' },
      { id: 'comp-bulletin-classe', label: 'Bulletin de ma classe' },
      { id: 'bilan-dom-header', label: 'Bilan par domaine', isSectionHeader: true },
      { id: 'eval-competences', label: 'Évaluations par compétences' },
      { id: 'niveaux-maitrise', label: 'Niveaux de maitrise par matière' },
      { id: 'livret-num', label: 'Livret de compétences numériques' },
      { id: 'anciens-bilans', label: 'Anciens bilans' },
    ],
  },
  {
    id: 'resultats',
    label: 'Résultats',
    width: 98,
    items: [
      { id: 'livret-scolaire', label: 'Livret scolaire' },
      { id: 'pluriannuel', label: 'Pluriannuel' },
    ],
  },
  {
    id: 'vie-scolaire',
    label: 'Vie scolaire',
    width: 98,
    items: [
      { id: 'emploi-du-temps', label: 'Emploi du temps' },
      { id: 'carnet', label: 'Carnet' },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    width: 135,
    items: [
      { id: 'infos-sondages', label: 'Informations & sondages' },
      { id: 'discussions', label: 'Discussions' },
      { id: 'mes-rendez-vous', label: 'Mes rendez-vous' },
      { id: 'agenda', label: 'Agenda' },
      { id: 'menu-cantine', label: 'Menu' },
    ],
  },
];

interface NavbarProps {
  activeView: string;
  onSelectView: (viewId: string) => void;
  user: {
    name: string;
    class_name: string;
    establishment: string;
    profile_picture?: string;
  };
  mode: 'demo' | 'real';
  refreshing?: boolean;
  onRefresh?: () => void;
  onOpenLogin: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  onSelectView,
  user,
  mode,
  refreshing = false,
  onRefresh,
  onOpenLogin,
  onLogout,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [hoveredSubItemId, setHoveredSubItemId] = useState<string | null>(null);
  const [homeHovered, setHomeHovered] = useState(false);
  const [harassmentOpen, setHarassmentOpen] = useState(false);

  const isHomeActive = activeView === 'home';

  return (
    <header className="w-full select-none z-50 relative">
      {/* Top White Bar (1920x47 in Figma) */}
      <div className="w-full h-[47px] bg-white flex items-center justify-between px-0 border-b border-black/5">
        {/* Left: Lycée Odilon Redon Logo (47x47) + Student & ÉduConnect Badge */}
        <div className="flex items-center gap-3">
          <img
            src="/assets/logo-lycee-or.png"
            alt="Lycée Odilon Redon - Pauillac"
            className="w-[47px] h-[47px] object-contain cursor-pointer"
            onClick={() => onSelectView('home')}
          />
          <div className="flex items-center gap-2">
            <span className="hidden md:inline text-[12px] font-semibold text-black/80 truncate max-w-[260px] lg:max-w-none">
              {user.establishment}
            </span>
            <span className="hidden md:inline text-black/25">•</span>
            {user.profile_picture ? (
              <img
                src={user.profile_picture}
                alt={user.name}
                className="w-9 h-9 rounded-full object-cover border border-[#008673]/50 shadow-sm shrink-0"
              />
            ) : (
              <div
                title={user.name}
                className="w-9 h-9 rounded-full bg-[#008673] text-white text-[11px] font-bold flex items-center justify-center shrink-0"
              >
                {(user.name || 'EL')
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() || '')
                  .join('')}
              </div>
            )}
            <span className="hidden sm:inline text-[12px] font-bold text-[#00584C] whitespace-nowrap">
              {user.name} ({user.class_name})
            </span>
          </div>
        </div>

        {/* Right: Stop harcèlement + Refresh + ÉduConnect Status + Logout + Custom PRONOTE Logo (130x28) */}
        <div className="flex items-center gap-2 pr-3 shrink-0">
          <button
            type="button"
            onClick={() => setHarassmentOpen(true)}
            title="Stop harcèlement — Numéro national 3018"
            className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>🛡️</span>
            <span>Stop harcèlement</span>
          </button>
          {mode === 'real' && onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title="Actualiser les données depuis Pronote"
              className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold bg-[#F4F7F6] text-[#00584C] hover:bg-[#CDF3ED] border border-black/10 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span className={refreshing ? 'inline-block animate-spin' : ''}>↻</span>
              <span className="hidden md:inline">{refreshing ? 'Synchro...' : 'Actualiser'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenLogin}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm whitespace-nowrap shrink-0 ${
              mode === 'real'
                ? 'bg-[#008673] text-white hover:bg-[#00584C]'
                : 'bg-[#CDF3ED] text-[#00584C] hover:bg-[#6BC5B7] hover:text-black border border-[#008673]/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                mode === 'real' ? 'bg-emerald-300 animate-pulse' : 'bg-[#008673]'
              }`}
            />
            <span className="hidden lg:inline">
              {mode === 'real'
                ? 'Connecté (ÉduConnect 0332081H)'
                : 'Changer de compte'}
            </span>
            <span className="lg:hidden">
              {mode === 'real' ? 'Connecté' : 'Compte'}
            </span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="px-2.5 py-1.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Déconnexion
          </button>

          <img
            src="/assets/logo-pronote.png"
            alt="PRONOTE"
            className="w-[130px] h-[28px] object-contain cursor-pointer ml-1"
            onClick={() => onSelectView('home')}
          />
        </div>
      </div>

      {/* Bottom Black Navigation Bar (1920x45 in Figma) */}
      <nav className="w-full h-[45px] bg-black flex items-center relative">
        {/* Component 2: Home Button (47x45) */}
        <button
          type="button"
          onClick={() => {
            onSelectView('home');
            setOpenMenuId(null);
          }}
          onMouseEnter={() => setHomeHovered(true)}
          onMouseLeave={() => setHomeHovered(false)}
          className="relative w-[47px] h-[45px] bg-black flex items-center justify-center overflow-hidden cursor-pointer shrink-0"
          title="Accueil Pronote"
        >
          {/* White slide-down rectangle (Rectangle 5 in Component 2) */}
          <motion.div
            animate={{
              height: isHomeActive || homeHovered ? 45 : 1,
            }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute top-0 left-0 right-0 bg-white pointer-events-none"
          />

          {/* Bottom #008673 emerald bar (Rectangle 17: 1px -> 3px) */}
          <motion.div
            animate={{
              height: isHomeActive ? 3 : homeHovered ? 2 : 1,
            }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute bottom-0 left-0 right-0 bg-[#008673] z-20"
          />

          {/* House Icon (18x19) with animated door width (12x8 -> 9x7 -> 6x7) */}
          <div className="relative z-10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 8.5L10 2.5L17 8.5V17.5H3V8.5Z"
                stroke={isHomeActive || homeHovered ? '#000000' : '#FFFFFF'}
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <motion.rect
                initial={false}
                x={7.5}
                width={5}
                height={7}
                animate={{
                  x: isHomeActive ? 7.5 : homeHovered ? 6.5 : 5.5,
                  width: isHomeActive ? 5 : homeHovered ? 7 : 9,
                  height: 7,
                }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                y="10.5"
                fill={isHomeActive || homeHovered ? '#000000' : '#FFFFFF'}
              />
            </svg>
          </div>
        </button>

        {/* The 7 Figma Dropdown Menus */}
        <div className="flex items-center h-[45px]">
          {FIGMA_NAV_MENUS.map((menu) => {
            const isOpen = openMenuId === menu.id;
            const isMenuSelected = menu.items.some((it) => it.id === activeView);

            return (
              <div
                key={menu.id}
                style={{ width: menu.width }}
                className="relative h-[45px] shrink-0"
                onMouseEnter={() => setOpenMenuId(menu.id)}
                onMouseLeave={() => {
                  setOpenMenuId(null);
                  setHoveredSubItemId(null);
                }}
              >
                {/* Top Tab Button */}
                <button
                  type="button"
                  onClick={() => {
                    const firstActionable = menu.items.find((i) => !i.isSectionHeader);
                    if (firstActionable) {
                      onSelectView(firstActionable.id);
                      setOpenMenuId(null);
                    }
                  }}
                  style={{ width: menu.width }}
                  className="relative h-[45px] flex items-center justify-center cursor-pointer overflow-hidden"
                >
                  {/* Background fill (#000000 -> #4B4B4B when open) */}
                  <motion.div
                    animate={{
                      backgroundColor: isOpen ? '#4B4B4B' : '#000000',
                    }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute inset-0"
                  />

                  {/* Bottom emerald indicator (#008673, 3px when active/hovered) */}
                  <motion.div
                    animate={{
                      height: isOpen || isMenuSelected ? 3 : 0,
                    }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute bottom-0 left-0 right-0 bg-[#008673] z-20"
                  />

                  <span className="relative z-10 text-[12px] font-semibold text-white whitespace-nowrap">
                    {menu.label}
                  </span>
                </button>

                {/* Animated 250px Dropdown Container (Variante2..14 in Figma) */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: -4 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -4 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="absolute left-0 top-[45px] w-[250px] bg-white shadow-2xl border border-black/15 overflow-hidden z-50"
                    >
                      {menu.items.map((sub, idx) => {
                        const isSubHovered = hoveredSubItemId === sub.id;
                        const isSubActive = activeView === sub.id;

                        if (sub.isSectionHeader) {
                          return (
                            <div
                              key={sub.id}
                              onMouseEnter={() => setHoveredSubItemId(sub.id)}
                              onClick={() => {
                                const nextItem = menu.items[idx + 1];
                                if (nextItem) {
                                  onSelectView(nextItem.id);
                                  setOpenMenuId(null);
                                }
                              }}
                              className="relative w-[250px] h-[45px] flex items-center border-b border-black/15 cursor-pointer overflow-hidden bg-white"
                            >
                              {/* Left 18px black bar that sweeps to 250px on hover */}
                              <motion.div
                                animate={{
                                  width: isSubHovered ? 250 : 18,
                                }}
                                transition={{ duration: 0.15, ease: 'easeOut' }}
                                className="absolute left-0 top-0 bottom-0 bg-black"
                              />
                              <span
                                style={{
                                  color: isSubHovered ? '#FFFFFF' : '#000000',
                                }}
                                className="relative z-10 pl-[28px] text-[15px] font-bold transition-colors duration-150"
                              >
                                {sub.label}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onMouseEnter={() => setHoveredSubItemId(sub.id)}
                            onClick={() => {
                              onSelectView(sub.id);
                              setOpenMenuId(null);
                            }}
                            className="relative w-[250px] h-[45px] flex items-center text-left border-b border-black/10 last:border-b-0 cursor-pointer overflow-hidden bg-white"
                          >
                            {/* Figma Signature Animation: 18px left black bar expands to 250px on hover! */}
                            <motion.div
                              animate={{
                                width: isSubHovered || isSubActive ? 250 : 18,
                                backgroundColor: isSubActive && !isSubHovered ? '#008673' : '#000000',
                              }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                              className="absolute left-0 top-0 bottom-0"
                            />

                            <motion.span
                              animate={{
                                x: isSubHovered ? 4 : 0,
                                color: isSubHovered || isSubActive ? '#FFFFFF' : '#000000',
                              }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                              className="relative z-10 pl-[28px] pr-3 text-[12px] font-medium truncate"
                            >
                              {sub.label}
                            </motion.span>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Stop Harcèlement Modal (matching official Pronote utility) */}
      <AnimatePresence>
        {harassmentOpen && (
          <div
            onClick={() => setHarassmentOpen(false)}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[440px] bg-white rounded-2xl shadow-2xl border border-black/10 overflow-hidden"
            >
              <div className="bg-black text-white px-5 py-3.5 flex items-center justify-between border-b-[3px] border-[#008673]">
                <span className="text-[14px] font-bold">🛡️ Stop harcèlement — Aide & Écoute</span>
                <button
                  type="button"
                  onClick={() => setHarassmentOpen(false)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="p-5 space-y-3 text-[13px] text-black/85">
                <p className="font-medium">
                  Tu es victime ou témoin de harcèlement ou de cyberharcèlement scolaire ? Tu n’es pas seul(e).
                </p>
                <div className="p-3.5 rounded-xl bg-[#CDF3ED]/50 border border-[#008673]/30">
                  <span className="text-[18px] font-extrabold text-[#00584C] block">
                    📞 3018 (Numéro national)
                  </span>
                  <span className="text-[12px] font-medium text-black/75">
                    Gratuit, anonyme et confidentiel — 7j/7 de 9h00 à 23h00 (par téléphone ou via l’appli 3018).
                  </span>
                </div>
                <p className="text-[12px] text-black/70">
                  Tu peux aussi contacter la <strong>Vie Scolaire</strong> ou l’infirmerie du Lycée Odilon Redon, ou consulter{' '}
                  <a
                    href="https://www.education.gouv.fr/non-au-harcelement"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#008673] font-semibold underline"
                  >
                    education.gouv.fr/non-au-harcelement
                  </a>.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
};
