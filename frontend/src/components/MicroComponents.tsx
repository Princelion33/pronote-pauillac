import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Component 3 / Component 5 from Figma:
 * Default: 82x24px, #FFFFFF, radius=15px, "Tout voir" 11px + diagonal arrow 10x10
 * Hover (150ms EASE_OUT_BACK): 105x28px, "Tout voir" 13px + diagonal arrow 14x14
 */
export const ToutVoirButton: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={{
        width: hovered ? 105 : 82,
        height: hovered ? 28 : 24,
      }}
      transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
      style={{
        borderRadius: 15,
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.18)',
      }}
      className="flex items-center justify-center gap-1.5 px-2 cursor-pointer select-none z-20 border border-black/5"
    >
      <motion.span
        animate={{ fontSize: hovered ? '13px' : '11px' }}
        transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
        className="font-medium text-black whitespace-nowrap leading-none"
      >
        Tout voir
      </motion.span>
      <motion.svg
        animate={{
          width: hovered ? 14 : 10,
          height: hovered ? 14 : 10,
        }}
        transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2.5 2.5L9.5 9.5M9.5 9.5V3.5M9.5 9.5H3.5"
          stroke="#000000"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </motion.button>
  );
};

/**
 * Component 6 from Figma (Date Selector in EDT & Menu de la cantine):
 * Left button: 24x24 (#008673) -> 42x24 (#40B2A1) on hover/click (150ms EASE_OUT_BACK)
 * Center mask pill: 132x24 (#FFFFFF, radius 26) with sliding date label + calendar icon
 * Right button: 24x24 (#008673) -> 42x24 (#40B2A1) on hover/click (150ms EASE_OUT_BACK)
 * Week subtitle below: "Semaine Q2" / "Semaine Q1" (#008673, Montserrat 600 11px)
 */
export const DateSelectorPill: React.FC<{
  dateKeys: string[];
  currentIndex: number;
  labels: Record<string, { label: string; week: string }>;
  onChangeIndex: (newIdx: number) => void;
}> = ({ dateKeys, currentIndex, labels, onChangeIndex }) => {
  const [hoverLeft, setHoverLeft] = useState(false);
  const [hoverRight, setHoverRight] = useState(false);
  const [direction, setDirection] = useState<number>(0);

  const currentKey = dateKeys[currentIndex] || dateKeys[0];
  const currentInfo = labels[currentKey] || { label: 'lun. 07 sept.', week: 'Semaine Q2' };

  const handlePrev = () => {
    setDirection(-1);
    const nextIdx = currentIndex > 0 ? currentIndex - 1 : dateKeys.length - 1;
    onChangeIndex(nextIdx);
  };

  const handleNext = () => {
    setDirection(1);
    const nextIdx = currentIndex < dateKeys.length - 1 ? currentIndex + 1 : 0;
    onChangeIndex(nextIdx);
  };

  return (
    <div className="flex flex-col items-center select-none">
      <div className="flex items-center justify-center gap-2 h-[24px]">
        {/* Left Arrow Pill */}
        <motion.button
          type="button"
          onClick={handlePrev}
          onMouseEnter={() => setHoverLeft(true)}
          onMouseLeave={() => setHoverLeft(false)}
          animate={{
            width: hoverLeft ? 42 : 24,
            backgroundColor: hoverLeft ? '#40B2A1' : '#008673',
          }}
          transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
          className="h-[24px] rounded-[26px] flex items-center justify-center text-white shadow-sm cursor-pointer"
          title="Jour précédent"
        >
          <motion.svg
            animate={{ width: hoverLeft ? 6 : 5, height: hoverLeft ? 10 : 8 }}
            viewBox="0 0 6 10"
            fill="none"
          >
            <path d="M5 1L1 5L5 9" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        </motion.button>

        {/* Center Date Mask Group (132x24) */}
        <div
          onClick={handleNext}
          className="relative w-[132px] h-[24px] rounded-[26px] bg-white border border-[#008673]/60 shadow-inner flex items-center justify-between px-3 overflow-hidden cursor-pointer"
          title="Cliquer pour faire défiler les jours"
        >
          <div className="relative flex-1 h-full flex items-center overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={currentKey}
                initial={{ x: direction >= 0 ? 40 : -40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction >= 0 ? -40 : 40, opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="text-[11px] font-medium text-black whitespace-nowrap"
              >
                {currentInfo.label}
              </motion.span>
            </AnimatePresence>
          </div>
          {/* Small calendar icon (9x9) */}
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="shrink-0 ml-1">
            <rect x="1.5" y="2.5" width="9" height="8" rx="1.2" stroke="#00584C" strokeWidth="1.2" />
            <path d="M1.5 5H10.5" stroke="#00584C" strokeWidth="1.2" />
            <path d="M4 1.5V3M8 1.5V3" stroke="#00584C" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>

        {/* Right Arrow Pill */}
        <motion.button
          type="button"
          onClick={handleNext}
          onMouseEnter={() => setHoverRight(true)}
          onMouseLeave={() => setHoverRight(false)}
          animate={{
            width: hoverRight ? 42 : 24,
            backgroundColor: hoverRight ? '#40B2A1' : '#008673',
          }}
          transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
          className="h-[24px] rounded-[26px] flex items-center justify-center text-white shadow-sm cursor-pointer"
          title="Jour suivant"
        >
          <motion.svg
            animate={{ width: hoverRight ? 6 : 5, height: hoverRight ? 10 : 8 }}
            viewBox="0 0 6 10"
            fill="none"
          >
            <path d="M1 1L5 5L1 9" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        </motion.button>
      </div>

      {/* Semaine Q1 / Q2 animated subtitle */}
      <div className="h-[20px] flex items-center justify-center overflow-hidden mt-1">
        <AnimatePresence mode="wait">
          <motion.span
            key={currentInfo.week}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="text-[11px] font-semibold text-[#008673]"
          >
            {currentInfo.week}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
};

/**
 * Component 8 from Figma (Homework "J'ai terminé" button + "Non fait" / "Fait" badge):
 * - Badge Non fait (60x21): GRADIENT_LINEAR(#C36969@0%, rgba(252,230,199,0.75)@100%)
 * - Badge Fait (37x21): GRADIENT_LINEAR(#699FC3@0%, rgba(199,231,252,0.75)@100%)
 * - Button (114x24):
 *   Left square: 24x24 -> 34x24 on hover (150ms EASE_OUT_BACK)
 *   Right label: 88x24 -> 78x24 on hover ("J'ai terminé", 11px)
 */
export const HomeworkStatusBadge: React.FC<{ done: boolean }> = ({ done }) => {
  return (
    <motion.div
      layout
      initial={false}
      animate={{
        width: done ? 37 : 60,
        background: done
          ? 'linear-gradient(90deg, #699FC3 0%, rgba(199, 231, 252, 0.85) 100%)'
          : 'linear-gradient(90deg, #C36969 0%, rgba(252, 230, 199, 0.85) 100%)',
      }}
      transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
      className="h-[21px] rounded-[4px] flex items-center justify-center shadow-sm select-none shrink-0"
    >
      <span className="text-[11px] font-medium text-black leading-none">
        {done ? 'Fait' : 'Non fait'}
      </span>
    </motion.div>
  );
};

export const JaiTermineButton: React.FC<{
  done: boolean;
  onToggle: () => void;
}> = ({ done, onToggle }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="inline-flex items-center gap-[2px] h-[24px] cursor-pointer select-none"
    >
      {/* Left Checkbox Square (24px -> 34px on hover) */}
      <motion.div
        animate={{
          width: hovered ? 34 : 24,
          background: done
            ? 'linear-gradient(135deg, #6BC5B7 0%, rgba(205, 243, 237, 0.85) 100%)'
            : 'linear-gradient(135deg, #008673 0%, rgba(107, 197, 183, 0.85) 100%)',
        }}
        transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
        className="h-[24px] rounded-[4px] flex items-center justify-center shadow-sm"
      >
        <AnimatePresence>
          {(done || hovered) && (
            <motion.svg
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: done ? 1 : 0.45 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
              width="13"
              height="10"
              viewBox="0 0 14 10"
              fill="none"
            >
              <path
                d="M1.5 5L5.2 8.5L12.5 1.5"
                stroke={done ? '#000000' : '#FFFFFF'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Right Label Box (88px -> 78px on hover) */}
      <motion.div
        animate={{
          width: hovered ? 78 : 88,
        }}
        transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
        style={{
          background: 'linear-gradient(90deg, #6BC5B7 0%, rgba(205, 243, 237, 0.85) 100%)',
        }}
        className="h-[24px] rounded-[4px] flex items-center justify-center shadow-sm px-1"
      >
        <span className="text-[11px] font-medium text-black whitespace-nowrap leading-none">
          J’ai terminé
        </span>
      </motion.div>
    </div>
  );
};

/**
 * Component 7 from Figma ("Copie déposée" with 5 interactive variants!):
 * - Default: 88x24 "Copie déposée" + 24x24 delete X button
 * - Hover: 78x24 "Copie déposée" + 34x24 delete X button (150ms EASE_OUT_BACK)
 * - Click X (Confirm state): expands to 224x24 "Voulez-vous vraiment supprimer votre copie ?" + 56x24 X + 56x24 Check
 */
export const CopieDeposeeButton: React.FC<{
  onDeleteConfirm: () => void;
}> = ({ onDeleteConfirm }) => {
  const [hovered, setHovered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [hoverConfirmBtn, setHoverConfirmBtn] = useState<'yes' | 'no' | null>(null);

  if (confirming) {
    return (
      <motion.div
        initial={{ opacity: 0.8, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="inline-flex items-center gap-[2px] h-[24px] select-none"
      >
        <div
          style={{
            background: 'linear-gradient(90deg, #6BC5B7 0%, rgba(205, 243, 237, 0.9) 100%)',
          }}
          className="w-[214px] h-[24px] rounded-[4px] flex items-center justify-center px-2 shadow-sm"
        >
          <span className="text-[9px] font-medium text-black whitespace-nowrap">
            Voulez-vous vraiment supprimer votre copie ?
          </span>
        </div>

        {/* Confirm delete (Red X button) */}
        <motion.button
          type="button"
          onClick={onDeleteConfirm}
          onMouseEnter={() => setHoverConfirmBtn('yes')}
          onMouseLeave={() => setHoverConfirmBtn(null)}
          animate={{ width: hoverConfirmBtn === 'yes' ? 54 : 44 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{
            background: 'linear-gradient(135deg, #7A1C1C 0%, #EF4444 100%)',
          }}
          className="h-[24px] rounded-[4px] flex items-center justify-center text-white cursor-pointer shadow-sm"
          title="Confirmer la suppression de la copie"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </motion.button>

        {/* Cancel (Green Check button) */}
        <motion.button
          type="button"
          onClick={() => setConfirming(false)}
          onMouseEnter={() => setHoverConfirmBtn('no')}
          onMouseLeave={() => setHoverConfirmBtn(null)}
          animate={{ width: hoverConfirmBtn === 'no' ? 54 : 44 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{
            background: 'linear-gradient(135deg, #6BC5B7 0%, rgba(205, 243, 237, 0.9) 100%)',
          }}
          className="h-[24px] rounded-[4px] flex items-center justify-center text-black cursor-pointer shadow-sm"
          title="Garder ma copie"
        >
          <svg width="12" height="9" viewBox="0 0 14 10" fill="none">
            <path d="M1.5 5L5.2 8.5L12.5 1.5" stroke="#000000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
      </motion.div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="inline-flex items-center gap-[2px] h-[24px] select-none"
    >
      <motion.div
        animate={{ width: hovered ? 78 : 88 }}
        transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
        style={{
          background: 'linear-gradient(90deg, #6BC5B7 0%, rgba(205, 243, 237, 0.85) 100%)',
        }}
        className="h-[24px] rounded-[4px] flex items-center justify-center shadow-sm px-1"
      >
        <span
          style={{ fontSize: hovered ? '9px' : '10px' }}
          className="font-medium text-black whitespace-nowrap transition-all"
        >
          Copie déposée
        </span>
      </motion.div>

      <motion.button
        type="button"
        onClick={() => setConfirming(true)}
        animate={{
          width: hovered ? 34 : 24,
        }}
        transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
        style={{
          background: hovered
            ? 'linear-gradient(135deg, #450A0A 0%, #DC2626 100%)'
            : 'linear-gradient(135deg, #6BC5B7 0%, #B91C1C 100%)',
        }}
        className="h-[24px] rounded-[4px] flex items-center justify-center cursor-pointer shadow-sm"
        title="Supprimer ou remplacer la copie"
      >
        <motion.svg
          animate={{ width: hovered ? 10 : 8, height: hovered ? 10 : 8 }}
          viewBox="0 0 10 10"
          fill="none"
        >
          <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="#000000" strokeWidth="1.8" strokeLinecap="round" />
        </motion.svg>
      </motion.button>
    </div>
  );
};

/**
 * Component Date (38:90) from Figma Agenda:
 * - Default: 400x53, right green gradient width 207px, right bar 2px #008673, date square 38x36
 * - Hover (150ms EASE_OUT): right green gradient width 400px, right bar 5px #008673, date square 45x36
 */
export const AgendaEventRow: React.FC<{
  day: string;
  month: string;
  title: string;
  subtitle: string;
  onClick?: () => void;
}> = ({ day, month, title, subtitle, onClick }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative w-full h-[53px] flex items-center px-4 overflow-hidden cursor-pointer select-none"
    >
      {/* Sweeping green gradient from right to left */}
      <motion.div
        animate={{
          width: hovered ? '100%' : '52%',
          opacity: hovered ? 0.28 : 0.16,
        }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        style={{
          background: 'linear-gradient(90deg, rgba(205, 243, 237, 0) 0%, #008673 100%)',
        }}
        className="absolute right-0 top-0 bottom-0 pointer-events-none"
      />

      {/* Right vertical emerald bar (2px -> 5px on hover) */}
      <motion.div
        animate={{ width: hovered ? 5 : 2 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="absolute right-0 top-0 bottom-0 bg-[#008673]"
      />

      {/* Date square badge (38x36 -> 45x36 on hover) */}
      <motion.div
        animate={{ width: hovered ? 45 : 38 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        style={{
          background: 'linear-gradient(135deg, #6BC5B7 0%, rgba(205, 243, 237, 0.85) 100%)',
          borderRadius: 5,
        }}
        className="h-[36px] flex flex-col items-center justify-center shrink-0 mr-3 shadow-sm z-10"
      >
        <span className="text-[12px] font-semibold text-[#00584C] leading-[13px]">{day}</span>
        <span className="text-[11px] font-semibold text-[#00584C] leading-[12px]">{month}</span>
      </motion.div>

      {/* Event Title & Subtitle */}
      <div className="flex flex-col justify-center z-10 min-w-0">
        <span className="text-[13px] font-semibold text-black truncate leading-tight">
          {title}
        </span>
        <span className="text-[12px] font-medium text-black/80 truncate leading-tight mt-0.5">
          {subtitle}
        </span>
      </div>
    </div>
  );
};

/**
 * Component 9 (25:1492) from Figma Agenda:
 * - Default: 68x32 pill, radius=21, eye icon + "+6"
 * - Hover (150ms EASE_OUT_BACK): 119x36 pill, eye icon + "Voir plus"
 */
export const AgendaVoirPlusPill: React.FC<{
  extraCount: number;
  expanded: boolean;
  onClick: () => void;
}> = ({ extraCount, expanded, onClick }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={{
        width: hovered || expanded ? 119 : 68,
        height: hovered ? 36 : 32,
        background: hovered
          ? 'linear-gradient(90deg, #6BC5B7 0%, rgba(107, 197, 183, 0.95) 100%)'
          : 'linear-gradient(90deg, #008673 0%, rgba(107, 197, 183, 0.88) 100%)',
      }}
      transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
      style={{ borderRadius: 21 }}
      className="flex items-center justify-center gap-1.5 text-white shadow-md cursor-pointer select-none px-3 z-20"
    >
      {/* Eye icon */}
      <motion.svg
        animate={{ width: hovered ? 19 : 15, height: hovered ? 14 : 11 }}
        transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
        viewBox="0 0 18 14"
        fill="none"
      >
        <path
          d="M1 7C2.8 3 5.7 1 9 1C12.3 1 15.2 3 17 7C15.2 11 12.3 13 9 13C5.7 13 2.8 11 1 7Z"
          stroke="#FFFFFF"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="7" r="2.5" stroke="#FFFFFF" strokeWidth="1.6" />
      </motion.svg>

      <span className="font-semibold text-white whitespace-nowrap text-[13px] leading-none">
        {expanded ? 'Réduire' : hovered ? 'Voir plus' : `+${extraCount}`}
      </span>
    </motion.button>
  );
};
