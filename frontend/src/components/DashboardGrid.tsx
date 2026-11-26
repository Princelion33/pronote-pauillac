import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ToutVoirButton,
  DateSelectorPill,
  HomeworkStatusBadge,
  JaiTermineButton,
  CopieDeposeeButton,
  AgendaEventRow,
  AgendaVoirPlusPill,
} from './MicroComponents';

interface DashboardGridProps {
  data: any;
  onSelectView: (viewId: string) => void;
  onToggleHomework: (hwId: string) => void;
  onDeleteSubmission: (hwId: string) => void;
  onSaveStickyNote: (text: string) => void;
}

export const DashboardGrid: React.FC<DashboardGridProps> = ({
  data,
  onSelectView,
  onToggleHomework,
  onDeleteSubmission,
  onSaveStickyNote,
}) => {
  const dayKeys = Object.keys(data.days || {});
  const now = new Date();
  const todayIso = now.toLocaleDateString('en-CA');
  const isEvening = now.getHours() >= 18;
  const targetEdtIso = isEvening
    ? new Date(now.getTime() + 86400000).toLocaleDateString('en-CA')
    : todayIso;

  const upcomingEdtIdx = dayKeys.findIndex((k) => k >= targetEdtIso);
  const upcomingCantineIdx = dayKeys.findIndex((k) => k >= todayIso);
  const figmaDemoIdx = dayKeys.indexOf('2026-09-07');
  const defaultEdtIdx =
    upcomingEdtIdx !== -1 ? upcomingEdtIdx : figmaDemoIdx !== -1 ? figmaDemoIdx : 0;
  const defaultCantineIdx =
    upcomingCantineIdx !== -1 ? upcomingCantineIdx : figmaDemoIdx !== -1 ? figmaDemoIdx : 0;

  const [edtDayIdx, setEdtDayIdx] = useState<number>(defaultEdtIdx >= 0 ? defaultEdtIdx : 0);
  const [cantineDayIdx, setCantineDayIdx] = useState<number>(
    defaultCantineIdx >= 0 ? defaultCantineIdx : 0
  );
  const [agendaExpanded, setAgendaExpanded] = useState<boolean>(false);
  const [stickyText, setStickyText] = useState<string>(data.sticky_note || '');

  useEffect(() => {
    setStickyText(data.sticky_note || '');
  }, [data.sticky_note]);

  const currentEdtKey = dayKeys[edtDayIdx] || dayKeys[0];
  const currentEdtDay = (data.days && data.days[currentEdtKey]) || {
    label: 'lun. 07 sept.',
    week: 'Semaine Q2',
    lessons: [],
  };

  const currentCantineKey = dayKeys[cantineDayIdx] || dayKeys[0];
  const currentCantineDay = (data.days && data.days[currentCantineKey]) || {
    label: 'lun. 07 sept.',
    week: 'Semaine Q2',
    canteen: { subtitle: 'Bon appétit !', items: [] },
  };

  // Group upcoming/today homeworks by date_label ("lundi 7 sept.", "jeudi 10 sept.")
  const homeworkGroups: Record<string, any[]> = {};
  for (const hw of data.homeworks || []) {
    if (hw.date_iso && hw.date_iso < todayIso) {
      continue;
    }
    if (!homeworkGroups[hw.date_label]) {
      homeworkGroups[hw.date_label] = [];
    }
    homeworkGroups[hw.date_label].push(hw);
  }

  const agendaList: any[] = data.agenda || [];
  const visibleAgenda = agendaExpanded ? agendaList : agendaList.slice(0, 3);
  const extraAgendaCount = Math.max(6, agendaList.length - 3);

  return (
    <div className="w-full max-w-[1860px] mx-auto px-4 lg:px-6 pt-6 pb-12">
      {/* 4-Column Responsive Grid matching Figma Frame 1 (400px columns with 24px gap) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start justify-items-center">
        {/* ============================================================
            COLUMN 1: EMPLOI DU TEMPS (17:998 GROUP EDT - 400x843)
           ============================================================ */}
        <div className="relative w-full max-w-[400px]">
          {/* Floating Tout voir button at top-right */}
          <div className="absolute -top-[12px] right-[10px] z-30">
            <ToutVoirButton onClick={() => onSelectView('emploi-du-temps')} />
          </div>

          <div className="figma-card relative w-full min-h-[843px] pt-5 pb-6 px-4 overflow-hidden flex flex-col">
            {/* Watermark Calendar in Bottom-Right (25:1432) */}
            <img
              src="/assets/watermark-calendar.svg"
              alt=""
              className="absolute right-[-10px] bottom-[18px] w-[145px] h-[145px] opacity-90 pointer-events-none select-none"
            />

            {/* Date Selector Component 6 */}
            <div className="mb-4 z-10">
              <DateSelectorPill
                dateKeys={dayKeys}
                currentIndex={edtDayIdx}
                labels={data.days || {}}
                onChangeIndex={setEdtDayIdx}
              />
            </div>

            {/* Lessons Timeline */}
            <div className="relative z-10 flex flex-col gap-3 flex-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentEdtKey}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="flex flex-col gap-3.5"
                >
                  {(currentEdtDay.lessons || []).length === 0 ? (
                    <div className="py-16 text-center text-[13px] font-medium text-black/60">
                      Aucun cours prévu pour cette journée.
                    </div>
                  ) : (
                    (currentEdtDay.lessons || []).map((lesson: any) => {
                    if (lesson.is_lunch) {
                      return (
                        <div
                          key={lesson.id}
                          className="flex items-center gap-2.5 h-[39px] my-0.5 select-none"
                        >
                          <div className="w-[42px] flex flex-col justify-between h-full text-right pr-1">
                            <span className="text-[12px] font-medium text-black/45 leading-none">
                              {lesson.start}
                            </span>
                            <span className="text-[12px] font-medium text-black/45 leading-none">
                              {lesson.end}
                            </span>
                          </div>
                          <div
                            style={{ background: lesson.gradient }}
                            className="w-[7px] h-[39px] rounded-[10px] shrink-0"
                          />
                          {/* Fork & Knife icon (17:1034 Vector 4) */}
                          <div className="pl-1 text-black/75 flex items-center gap-2">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z" />
                            </svg>
                          </div>
                        </div>
                      );
                    }

                    if (lesson.is_gap) {
                      return (
                        <div
                          key={lesson.id}
                          className="flex items-center gap-2.5 h-[38px] my-0.5 select-none opacity-70"
                        >
                          <div className="w-[42px] flex flex-col justify-between h-full text-right pr-1">
                            <span className="text-[11px] font-medium text-black/45 leading-none">
                              {lesson.start}
                            </span>
                            <span className="text-[11px] font-medium text-black/45 leading-none">
                              {lesson.end}
                            </span>
                          </div>
                          <div className="w-[7px] h-[34px] rounded-[10px] shrink-0 bg-black/10" />
                          <span className="text-[12px] italic font-medium text-black/50 pl-1">
                            {lesson.label || 'Pas de cours'}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <motion.div
                        key={lesson.id}
                        whileHover={{ x: 4 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        onClick={() => onSelectView('emploi-du-temps')}
                        style={{ minHeight: lesson.height || 102 }}
                        className="flex items-stretch gap-2.5 cursor-pointer group"
                      >
                        {/* Left Hours Column */}
                        <div className="w-[42px] flex flex-col justify-between py-0.5 text-right pr-1 shrink-0">
                          <span className="text-[13px] font-semibold text-black leading-none">
                            {lesson.start}
                          </span>
                          <span className="text-[13px] font-medium text-black leading-none">
                            {lesson.end}
                          </span>
                        </div>

                        {/* Vertical Color Pill Bar (7px wide, radius 10px) */}
                        <div
                          style={{ background: lesson.gradient }}
                          className="w-[7px] rounded-[10px] shrink-0 shadow-sm group-hover:scale-y-[1.03] transition-transform"
                        />

                        {/* Course Details */}
                        <div className="flex flex-col justify-center py-0.5 pl-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-[13px] font-semibold text-black leading-[16px] tracking-tight ${
                                lesson.canceled ? 'line-through opacity-60' : ''
                              }`}
                            >
                              {lesson.subject}
                            </span>
                            {lesson.canceled && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white rounded">
                                ANNULÉ
                              </span>
                            )}
                            {lesson.test && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500 text-white rounded">
                                DEVOIR
                              </span>
                            )}
                            {lesson.outing && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-600 text-white rounded">
                                SORTIE
                              </span>
                            )}
                          </div>
                          {lesson.status && !lesson.canceled && (
                            <span className="text-[11px] font-bold text-amber-700 leading-[14px]">
                              {lesson.status}
                            </span>
                          )}
                          {lesson.location_tag && (
                            <span className="text-[13px] font-medium text-black leading-[16px]">
                              {lesson.location_tag}
                            </span>
                          )}
                          {lesson.teacher && (
                            <span className="text-[13px] font-medium text-black leading-[16px]">
                              {lesson.teacher}
                            </span>
                          )}
                          {lesson.group && (
                            <span className="text-[13px] font-medium text-black leading-[16px]">
                              {lesson.group}
                            </span>
                          )}
                          {lesson.room && (
                            <span className="text-[13px] font-medium text-black leading-[16px]">
                              {lesson.room}
                            </span>
                          )}
                          {lesson.memo && (
                            <span className="text-[11px] italic text-black/65 leading-[14px] truncate">
                              {lesson.memo}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ============================================================
            COLUMN 2: PENSE-BÊTE + TRAVAIL À FAIRE + RESSOURCES PÉDAGOGIQUES
           ============================================================ */}
        <div className="w-full max-w-[400px] flex flex-col gap-5">
          {/* 1. Pense-bête (17:979 - 402x132, tilted yellow sticky note with folded corner) */}
          <motion.div
            whileHover={{ rotate: 0, scale: 1.01 }}
            initial={{ rotate: -1.1 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              backgroundColor: '#FACB4A',
              boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.18)',
              clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 26px), calc(100% - 26px) 100%, 0 100%)',
            }}
            className="relative w-full h-[132px] border border-[#E0AD22] px-4 pt-2.5 pb-3 overflow-hidden"
          >
            {/* Title */}
            <div className="w-full text-center mb-1.5">
              <span className="text-[14px] font-semibold text-black">Pense-bête</span>
            </div>

            {/* Editable Textarea */}
            <textarea
              value={stickyText}
              onChange={(e) => {
                setStickyText(e.target.value);
                onSaveStickyNote(e.target.value);
              }}
              placeholder="Écrivez quelque chose..."
              className="w-[82%] h-[80px] bg-transparent resize-none border-none outline-none text-[13px] font-medium text-black placeholder:text-black/45 leading-snug relative z-10"
            />

            {/* Lightbulb Watermark on the right (17:977) */}
            <img
              src="/assets/watermark-bulb.svg"
              alt=""
              className="absolute right-[10px] bottom-[-4px] w-[72px] h-[94px] opacity-35 pointer-events-none select-none"
            />

            {/* Folded Bottom-Right Corner Triangle (25:1227) */}
            <div
              style={{
                background: 'linear-gradient(135deg, #FDE08D 0%, #E5B228 100%)',
                boxShadow: '-2px -2px 5px rgba(0,0,0,0.18)',
              }}
              className="absolute bottom-0 right-0 w-[26px] h-[26px] rounded-tl-[6px] pointer-events-none"
            />
          </motion.div>

          {/* 2. Travail à faire pour les prochains jours (25:1196 - 400x467) */}
          <div className="relative w-full">
            <div className="absolute -top-[12px] right-[10px] z-30">
              <ToutVoirButton onClick={() => onSelectView('travail-a-faire')} />
            </div>

            <div className="figma-card relative w-full min-h-[467px] pt-4 pb-5 px-0 overflow-hidden">
              {/* Watermark Homework Pencil/Sheet in Bottom-Right (25:1431) */}
              <img
                src="/assets/watermark-homework.svg"
                alt=""
                className="absolute right-[24px] bottom-[12px] w-[120px] h-[120px] opacity-85 pointer-events-none select-none"
              />

              <h2 className="text-[14px] font-semibold text-[#00584C] text-center mb-3 px-4">
                Travail à faire pour les prochains jours
              </h2>

              <div className="flex flex-col gap-3 relative z-10">
                {Object.keys(homeworkGroups).length === 0 ? (
                  <p className="text-[13px] font-medium text-black/65 text-center py-12 px-4">
                    Aucun travail à faire pour les prochains jours.
                  </p>
                ) : (
                  Object.entries(homeworkGroups).map(([dateLabel, items]) => (
                  <div key={dateLabel} className="flex flex-col gap-2.5">
                    {/* Green gradient ribbon header ("Pour lundi 7 sept.") */}
                    <div
                      style={{
                        background: 'linear-gradient(90deg, rgba(0, 152, 129, 0.35) 0%, #009881 100%)',
                      }}
                      className="w-[237px] h-[23px] rounded-r-full flex items-center px-4 gap-1 shadow-sm"
                    >
                      <span className="text-[13px] font-medium text-white">Pour</span>
                      <span className="text-[13px] font-semibold text-white">{dateLabel}</span>
                    </div>

                    {/* Homework items for this date */}
                    <div className="flex flex-col gap-3 px-5">
                      {items.map((hw: any) => (
                        <div
                          key={hw.id}
                          className="flex flex-col gap-1.5 py-1 border-b border-black/5 last:border-b-0"
                        >
                          {/* Top Row: Subject bar + Subject Name + Status Badge ("Fait" / "Non fait") */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                style={{ background: hw.gradient }}
                                className="w-[4px] h-[20px] rounded-[10px] shrink-0"
                              />
                              <span className="text-[13px] font-medium text-black truncate">
                                {hw.subject}
                              </span>
                            </div>

                            <HomeworkStatusBadge done={hw.done} />
                          </div>

                          {/* Description text if present (rich HTML formatting preserved) */}
                          {(hw.description_html || hw.description) && (
                            hw.description_html ? (
                              <div
                                className="text-[13px] font-normal text-black pl-3 leading-snug [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_a]:text-[#008673] [&_a]:underline"
                                dangerouslySetInnerHTML={{ __html: hw.description_html }}
                              />
                            ) : (
                              <p className="text-[13px] font-medium text-black pl-3 leading-snug">
                                {hw.description}
                              </p>
                            )
                          )}

                          {/* Bottom-Right Interactive Control + Attachments */}
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <div>
                              {(hw.files || []).length > 0 && (
                                <span className="px-2 py-0.5 rounded bg-[#CDF3ED]/80 text-[#00584C] text-[10px] font-bold">
                                  📎 {hw.files.length} fichier{hw.files.length > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            {hw.type === 'submission' && !hw.submission_deleted ? (
                              <CopieDeposeeButton
                                onDeleteConfirm={() => onDeleteSubmission(hw.id)}
                              />
                            ) : (
                              <JaiTermineButton
                                done={hw.done}
                                onToggle={() => onToggleHomework(hw.id)}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
                )}
              </div>
            </div>
          </div>

          {/* 3. Dernières ressources pédagogiques (25:1363 - 400x86) */}
          <div className="relative w-full">
            <div className="absolute -top-[12px] right-[10px] z-30">
              <ToutVoirButton onClick={() => onSelectView('contenus-ressources')} />
            </div>

            <div className="figma-card relative w-full min-h-[86px] py-3.5 px-4 flex flex-col justify-between">
              <h2 className="text-[14px] font-semibold text-[#00584C] text-center">
                Dernières ressources pédagogiques
              </h2>
              {(data.resources || []).length === 0 ? (
                <p className="text-[13px] font-medium text-black/65 text-center my-auto pt-2">
                  Aucune ressource pédagogique n’est disponible.
                </p>
              ) : (
                <div className="flex flex-col gap-2 mt-2.5">
                  {(data.resources || []).slice(0, 5).map((res: any) => (
                    <div
                      key={res.id}
                      onClick={() => onSelectView('contenus-ressources')}
                      className="flex items-center justify-between gap-2 bg-white/80 hover:bg-white rounded px-2.5 py-1.5 border border-black/5 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          style={{ background: res.gradient }}
                          className="w-[4px] h-[22px] rounded-full shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="text-[12px] font-semibold text-black block truncate">
                            {res.title}
                          </span>
                          <span className="text-[11px] text-black/60 block truncate">
                            {res.subject} • {res.date}
                          </span>
                        </div>
                      </div>
                      {(res.files || []).length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-[#CDF3ED] text-[#00584C] text-[10px] font-bold shrink-0">
                          📎 {res.files.length}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================
            COLUMN 3: CARNET DE CORRESPONDANCE + DERNIÈRES NOTES
           ============================================================ */}
        <div className="w-full max-w-[400px] flex flex-col gap-5">
          {/* 1. Carnet de correspondance (25:1411 - 400x86) */}
          <div className="relative w-full">
            <div className="absolute -top-[12px] right-[10px] z-30">
              <ToutVoirButton onClick={() => onSelectView('carnet')} />
            </div>

            <div className="figma-card relative w-full min-h-[86px] py-3.5 px-4 flex flex-col justify-between">
              <h2 className="text-[14px] font-semibold text-[#00584C] text-center">
                Carnet de correspondance
              </h2>
              {(data.vie_scolaire?.absences?.length || 0) === 0 &&
              (data.vie_scolaire?.retards?.length || 0) === 0 &&
              (data.vie_scolaire?.punitions?.length || 0) === 0 ? (
                <p className="text-[13px] font-medium text-black/65 text-center my-auto pt-2">
                  {data.vie_scolaire?.carnet_empty_message ||
                    'Votre carnet est vide, vous êtes blanc comme neige.'}
                </p>
              ) : (
                <div
                  onClick={() => onSelectView('carnet')}
                  className="flex items-center justify-around gap-2 mt-2.5 cursor-pointer"
                >
                  <div className="bg-white/80 rounded px-2.5 py-1.5 text-center border border-black/5 flex-1">
                    <span className="text-[14px] font-extrabold text-[#00584C] block">
                      {data.vie_scolaire?.absences?.length || 0}
                    </span>
                    <span className="text-[10px] font-semibold text-black/65">Absences</span>
                  </div>
                  <div className="bg-white/80 rounded px-2.5 py-1.5 text-center border border-black/5 flex-1">
                    <span className="text-[14px] font-extrabold text-amber-600 block">
                      {data.vie_scolaire?.retards?.length || 0}
                    </span>
                    <span className="text-[10px] font-semibold text-black/65">Retards</span>
                  </div>
                  <div className="bg-white/80 rounded px-2.5 py-1.5 text-center border border-black/5 flex-1">
                    <span className="text-[14px] font-extrabold text-red-600 block">
                      {data.vie_scolaire?.punitions?.length || 0}
                    </span>
                    <span className="text-[10px] font-semibold text-black/65">Punitions</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. Dernières notes (25:1420 - 400x86) */}
          <div className="relative w-full">
            <div className="absolute -top-[12px] right-[10px] z-30">
              <ToutVoirButton onClick={() => onSelectView('mes-notes')} />
            </div>

            <div
              onClick={() => onSelectView('mes-notes')}
              className="figma-card relative w-full min-h-[86px] py-3.5 px-4 flex flex-col justify-between overflow-hidden cursor-pointer"
              title="Voir toutes mes notes"
            >
              {/* Double Star Watermark on the Right (100:231) */}
              <img
                src="/assets/watermark-stars.svg"
                alt=""
                className="absolute right-[-4px] top-[6px] w-[84px] h-[81px] opacity-90 pointer-events-none select-none"
              />

              <h2 className="text-[14px] font-semibold text-[#00584C] text-center relative z-10">
                Dernières notes
              </h2>

              {(data.grades || []).length === 0 ? (
                <p className="text-[13px] font-medium text-black/65 text-center my-auto pt-2 relative z-10">
                  Vous n’avez pas de notes. Pour l’instant.
                </p>
              ) : (
                <div className="flex flex-col gap-2 mt-2.5 relative z-10">
                  {(data.grades || []).slice(0, 5).map((g: any) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between bg-white/85 hover:bg-white rounded px-2.5 py-1.5 border border-black/5 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          style={{ background: g.gradient }}
                          className="w-[4px] h-[20px] rounded-full shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="text-[12px] font-semibold text-black block truncate">
                            {g.subject}
                          </span>
                          <span className="text-[10px] text-black/55 block truncate">
                            {g.date ? `${g.date}${g.title ? ` • ${g.title}` : ''}` : g.title}
                          </span>
                        </div>
                      </div>
                      <span className="text-[12px] font-bold text-[#00584C] shrink-0 ml-2">
                        {g.grade}/{g.out_of}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================
            COLUMN 4: AGENDA + INFORMATIONS & SONDAGES + DISCUSSIONS + CANTINE
           ============================================================ */}
        <div className="w-full max-w-[400px] flex flex-col gap-5">
          {/* 1. Agenda (25:1434 - 400x275) */}
          <div className="relative w-full">
            <div className="absolute -top-[12px] right-[10px] z-30">
              <ToutVoirButton onClick={() => onSelectView('agenda')} />
            </div>

            <div className="figma-card relative w-full min-h-[275px] pt-3.5 pb-12 overflow-hidden flex flex-col">
              {/* Watermark Calendar in Bottom-Right (25:1429) */}
              <img
                src="/assets/watermark-calendar.svg"
                alt=""
                className="absolute right-[18px] bottom-[8px] w-[145px] h-[145px] opacity-90 pointer-events-none select-none"
              />

              <h2 className="text-[14px] font-semibold text-[#00584C] text-center mb-2 relative z-10">
                Agenda
              </h2>

              <div className="flex flex-col divide-y divide-black/15 relative z-10">
                {visibleAgenda.length === 0 ? (
                  <p className="text-[13px] font-medium text-black/65 text-center py-8 px-4">
                    Aucun événement à venir.
                  </p>
                ) : (
                  visibleAgenda.map((ev: any) => (
                    <AgendaEventRow
                      key={ev.id}
                      day={ev.day}
                      month={ev.month}
                      title={ev.title}
                      subtitle={ev.subtitle}
                      onClick={() => onSelectView('agenda')}
                    />
                  ))
                )}
              </div>

              {/* Component 9: "+6" -> "Voir plus" pill in bottom-right */}
              {agendaList.length > 3 && (
                <div className="absolute bottom-2.5 right-3 z-20">
                  <AgendaVoirPlusPill
                    extraCount={extraAgendaCount}
                    expanded={agendaExpanded}
                    onClick={() => setAgendaExpanded(!agendaExpanded)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 2. Informations & Sondages (25:1502 - 400x86) */}
          <div className="relative w-full">
            <div className="absolute -top-[12px] right-[10px] z-30">
              <ToutVoirButton onClick={() => onSelectView('infos-sondages')} />
            </div>

            <div
              onClick={() => onSelectView('infos-sondages')}
              className="figma-card relative w-full min-h-[86px] py-3.5 px-4 flex flex-col justify-between overflow-hidden cursor-pointer"
            >
              {/* Info (i) Watermark on the Right (98:201) */}
              <img
                src="/assets/watermark-info.svg"
                alt=""
                className="absolute right-[-6px] top-[2px] w-[90px] h-[90px] opacity-85 pointer-events-none select-none"
              />

              <h2 className="text-[14px] font-semibold text-[#00584C] text-center relative z-10 flex items-center justify-center gap-2">
                <span>Informations & Sondages</span>
                {(data.informations || []).filter((i: any) => !i.read).length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#008673] text-white text-[10px] font-bold">
                    {(data.informations || []).filter((i: any) => !i.read).length}
                  </span>
                )}
              </h2>
              {(data.informations || []).length === 0 ? (
                <p className="text-[13px] font-medium text-black/65 text-center my-auto pt-2 relative z-10">
                  C’est plutôt vide ici...
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 mt-2.5 relative z-10">
                  {(data.informations || []).slice(0, 3).map((inf: any) => (
                    <div
                      key={inf.id}
                      className="flex items-center justify-between gap-2 bg-white/85 hover:bg-white rounded px-2.5 py-1.5 border border-black/5 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {!inf.read && (
                          <span className="w-2 h-2 rounded-full bg-[#008673] shrink-0" title="Non lu" />
                        )}
                        <div className="min-w-0">
                          <span className="text-[12px] font-semibold text-black block truncate">
                            {inf.title}
                          </span>
                          <span className="text-[10px] text-black/60 block truncate">
                            {inf.author} {inf.date ? `• ${inf.date}` : ''}
                          </span>
                        </div>
                      </div>
                      {inf.is_survey && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold shrink-0">
                          Sondage
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 3. Discussions (25:1511 - 400x86) */}
          <div className="relative w-full">
            <div className="absolute -top-[12px] right-[10px] z-30">
              <ToutVoirButton onClick={() => onSelectView('discussions')} />
            </div>

            <div
              onClick={() => onSelectView('discussions')}
              className="figma-card relative w-full min-h-[86px] py-3.5 px-4 flex flex-col justify-between cursor-pointer"
            >
              <h2 className="text-[14px] font-semibold text-[#00584C] text-center flex items-center justify-center gap-2">
                <span>Discussions</span>
                {(data.discussions || []).filter((d: any) => d.unread).length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#008673] text-white text-[10px] font-bold">
                    {(data.discussions || []).filter((d: any) => d.unread).length}
                  </span>
                )}
              </h2>
              {(data.discussions || []).length === 0 ? (
                <p className="text-[13px] font-medium text-black/65 text-center my-auto pt-2">
                  Vous n’avez discuté avec personne.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 mt-2.5">
                  {(data.discussions || []).slice(0, 2).map((d: any) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 bg-white/85 hover:bg-white rounded px-2.5 py-1.5 border border-black/5 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {d.unread && (
                          <span className="w-2 h-2 rounded-full bg-[#008673] shrink-0" title="Non lu" />
                        )}
                        <div className="min-w-0">
                          <span className="text-[12px] font-semibold text-black block truncate">
                            {d.subject}
                          </span>
                          <span className="text-[10px] text-black/60 block truncate">
                            {d.participants}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-medium text-black/55 shrink-0">
                        {d.date}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4. Menu de la cantine (25:1520 - 400x150) */}
          <div className="relative w-full">
            <div className="absolute -top-[12px] right-[10px] z-30">
              <ToutVoirButton onClick={() => onSelectView('menu-cantine')} />
            </div>

            <div className="figma-card relative w-full min-h-[150px] py-3.5 px-4 flex flex-col items-center justify-between">
              <h2 className="text-[14px] font-semibold text-[#00584C] text-center mb-1">
                Menu de la cantine
              </h2>

              <DateSelectorPill
                dateKeys={dayKeys}
                currentIndex={cantineDayIdx}
                labels={data.days || {}}
                onChangeIndex={setCantineDayIdx}
              />

              {(currentCantineDay.canteen?.lunch || currentCantineDay.canteen?.items || []).length > 0 ||
              (currentCantineDay.canteen?.dinner || []).length > 0 ? (
                <div className="w-full mt-2 space-y-2 px-1">
                  {(currentCantineDay.canteen?.lunch || currentCantineDay.canteen?.items || []).length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[#008673] block mb-0.5">
                        Repas de midi
                      </span>
                      <ul className="space-y-0.5 text-[11px] font-medium text-black/80">
                        {(currentCantineDay.canteen?.lunch || currentCantineDay.canteen?.items || []).map(
                          (item: string, idx: number) => (
                            <li key={idx} className="flex items-center gap-1.5 truncate">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#008673] shrink-0" />
                              <span className="truncate">{item}</span>
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
                  {(currentCantineDay.canteen?.dinner || []).length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-amber-700 block mb-0.5">
                        Repas du soir
                      </span>
                      <ul className="space-y-0.5 text-[11px] font-medium text-black/80">
                        {currentCantineDay.canteen.dinner.map((item: string, idx: number) => (
                          <li key={idx} className="flex items-center gap-1.5 truncate">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0" />
                            <span className="truncate">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[14px] font-medium text-black/65 text-center mt-1">
                  {currentCantineDay.canteen?.subtitle || 'Bon appétit !'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
