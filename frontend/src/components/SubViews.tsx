import React, { useState, useEffect } from 'react';
import {
  HomeworkStatusBadge,
  JaiTermineButton,
  CopieDeposeeButton,
  AgendaEventRow,
} from './MicroComponents';

interface SubViewProps {
  viewId: string;
  data: any;
  sessionToken?: string | null;
  onBackHome: () => void;
  onToggleHomework: (hwId: string) => void;
  onDeleteSubmission: (hwId: string) => void;
  onMarkInfoRead?: (infoId: string, read: boolean) => void;
  onReplyDiscussion?: (discussionId: string, message: string) => Promise<void>;
  onMarkDiscussionRead?: (discussionId: string, unread: boolean) => void;
  onCreateDiscussion?: (subject: string, message: string, recipientIds: string[]) => Promise<void>;
  onLoadPeriod?: (periodId: string) => Promise<void>;
}

const AttachmentChips: React.FC<{ files: any[] }> = ({ files }) => {
  if (!files || files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-black/5">
      {files.map((file: any, idx: number) => {
        const name = typeof file === 'string' ? file : file.name || 'Pièce jointe';
        const url = typeof file === 'string' ? '' : file.url || '';
        return url ? (
          <a
            key={`${name}-${idx}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded bg-[#CDF3ED]/80 hover:bg-[#008673] text-[#00584C] hover:text-white text-[11px] font-semibold transition-colors inline-flex items-center gap-1"
          >
            <span>📎</span>
            <span>{name}</span>
          </a>
        ) : (
          <span
            key={`${name}-${idx}`}
            className="px-2.5 py-1 rounded bg-[#CDF3ED]/70 text-[#00584C] text-[11px] font-semibold inline-flex items-center gap-1"
          >
            <span>📎</span>
            <span>{name}</span>
          </span>
        );
      })}
    </div>
  );
};

export const SubViewContainer: React.FC<SubViewProps> = ({
  viewId,
  data,
  sessionToken,
  onBackHome,
  onToggleHomework,
  onDeleteSubmission,
  onMarkInfoRead,
  onReplyDiscussion,
  onMarkDiscussionRead,
  onCreateDiscussion,
  onLoadPeriod,
}) => {
  // Periods for Notes / Bulletins / Compétences
  const periodsList: any[] = data.periods || [];
  const defaultPeriodId =
    data.current_period_id || (periodsList[0] ? periodsList[0].id : 'default');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(defaultPeriodId);

  useEffect(() => {
    if (data.current_period_id) {
      setSelectedPeriodId(data.current_period_id);
    } else if (periodsList.length > 0) {
      setSelectedPeriodId(periodsList[0].id);
    }
  }, [data.current_period_id, periodsList.length]);

  // Informations & Sondages filters
  const [infoFilter, setInfoFilter] = useState<'all' | 'unread' | 'surveys'>('all');
  const [infoCategoryFilter, setInfoCategoryFilter] = useState<string>('all');

  // Discussions state
  const [activeDiscId, setActiveDiscId] = useState<string | null>(null);
  const [discFilter, setDiscFilter] = useState<'all' | 'unread' | 'closed'>('all');
  const [discSearch, setDiscSearch] = useState<string>('');
  const [replyText, setReplyText] = useState<string>('');
  const [sendingReply, setSendingReply] = useState<boolean>(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // New discussion modal state
  const [showNewDisc, setShowNewDisc] = useState<boolean>(false);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState<boolean>(false);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState<string>('');
  const [newMessage, setNewMessage] = useState<string>('');
  const [creatingDisc, setCreatingDisc] = useState<boolean>(false);
  const [newDiscError, setNewDiscError] = useState<string | null>(null);

  // Homework & Resources filters
  const [hwFilter, setHwFilter] = useState<'all' | 'todo' | 'done'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  // Grades view mode (Par ordre chronologique / Par matière)
  const [gradesViewMode, setGradesViewMode] = useState<'chronological' | 'subject'>('chronological');
  // Timetable week filter
  const [edtWeekFilter, setEdtWeekFilter] = useState<string>('all');

  const openNewDiscussionModal = async () => {
    setShowNewDisc(true);
    setNewDiscError(null);
    if (recipients.length === 0 && sessionToken) {
      setLoadingRecipients(true);
      try {
        const res = await fetch('/api/discussion/recipients', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (res.ok) {
          const json = await res.json();
          setRecipients(json.recipients || []);
        }
      } catch {
        // Ignore
      } finally {
        setLoadingRecipients(false);
      }
    }
  };

  const renderHeader = (category: string, title: string, subtitle?: string) => (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-black/10">
      <div>
        <div className="flex items-center gap-2 text-[12px] font-semibold text-[#008673] uppercase tracking-wider">
          <span>{category}</span>
          <span>•</span>
          <span>Lycée Odilon Redon (Pauillac)</span>
        </div>
        <h1 className="text-[22px] font-bold text-[#00584C] mt-0.5">{title}</h1>
        {subtitle && <p className="text-[13px] font-medium text-black/65 mt-0.5">{subtitle}</p>}
      </div>

      <button
        type="button"
        onClick={onBackHome}
        className="px-4 py-2 rounded-full bg-black text-white text-[12px] font-semibold hover:bg-[#008673] transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
      >
        <span>← Retour à l’accueil</span>
      </button>
    </div>
  );

  // 1. EMPLOI DU TEMPS COMPLET
  if (viewId === 'emploi-du-temps') {
    const allDaysEntries = Object.entries(data.days || {});
    const weekNames = Array.from(
      new Set(allDaysEntries.map(([, d]: [string, any]) => d.week).filter(Boolean))
    );
    const daysEntries =
      edtWeekFilter === 'all'
        ? allDaysEntries
        : allDaysEntries.filter(([, d]: [string, any]) => d.week === edtWeekFilter);

    return (
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="figma-card p-6">
          {renderHeader(
            'Vie scolaire',
            'Emploi du temps complet',
            'Planning des cours — Lycée Odilon Redon (Pauillac 0332081H)'
          )}
          {weekNames.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <button
                type="button"
                onClick={() => setEdtWeekFilter('all')}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all cursor-pointer ${
                  edtWeekFilter === 'all'
                    ? 'bg-[#008673] text-white shadow-sm'
                    : 'bg-white/80 text-black/75 hover:bg-white border border-black/10'
                }`}
              >
                Toutes les semaines
              </button>
              {weekNames.map((wk: string) => (
                <button
                  key={wk}
                  type="button"
                  onClick={() => setEdtWeekFilter(wk)}
                  className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all cursor-pointer ${
                    edtWeekFilter === wk
                      ? 'bg-[#008673] text-white shadow-sm'
                      : 'bg-white/80 text-black/75 hover:bg-white border border-black/10'
                  }`}
                >
                  {wk}
                </button>
              ))}
            </div>
          )}
          {daysEntries.length === 0 ? (
            <div className="bg-white/90 rounded-[9px] p-8 text-center border border-black/10">
              <p className="text-[14px] font-semibold text-black/65">
                Aucun cours disponible sur cette période.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {daysEntries.map(([iso, dayObj]: [string, any]) => (
                <div
                  key={iso}
                  className="bg-white/85 rounded-[9px] p-4 border border-black/10 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-black/10">
                    <span className="text-[14px] font-bold text-[#00584C] capitalize">
                      {dayObj.label}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#CDF3ED] text-[#00584C] text-[11px] font-semibold">
                      {dayObj.week}
                    </span>
                  </div>

                  {(dayObj.lessons || []).length === 0 ? (
                    <p className="text-[12px] text-black/50 text-center py-6">Aucun cours</p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {(dayObj.lessons || []).map((lesson: any) =>
                        lesson.is_lunch ? (
                          <div
                            key={lesson.id}
                            className="flex items-center gap-2 py-1.5 px-2 rounded bg-black/[0.04] text-black/60 text-[11px] font-medium"
                          >
                            <span>
                              {lesson.start} – {lesson.end}
                            </span>
                            <span>•</span>
                            <span>Pause méridienne</span>
                          </div>
                        ) : lesson.is_gap ? (
                          <div
                            key={lesson.id}
                            className="flex items-center gap-2 py-1 px-2 rounded bg-black/[0.02] text-black/45 text-[11px] italic"
                          >
                            <span>
                              {lesson.start} – {lesson.end}
                            </span>
                            <span>•</span>
                            <span>{lesson.label || 'Pas de cours'}</span>
                          </div>
                        ) : (
                          <div
                            key={lesson.id}
                            className={`flex items-stretch gap-2.5 p-2.5 rounded-lg bg-white border shadow-sm ${
                              lesson.canceled ? 'border-red-300 opacity-75' : 'border-black/5'
                            }`}
                          >
                            <div className="w-[42px] flex flex-col justify-between text-right pr-1 shrink-0">
                              <span className="text-[11px] font-bold text-black">{lesson.start}</span>
                              <span className="text-[11px] font-medium text-black/65">
                                {lesson.end}
                              </span>
                            </div>
                            <div
                              style={{ background: lesson.gradient }}
                              className="w-[5px] rounded-full shrink-0"
                            />
                            <div className="flex flex-col text-[11px] min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`font-bold text-black ${
                                    lesson.canceled ? 'line-through' : ''
                                  }`}
                                >
                                  {lesson.subject}
                                </span>
                                {lesson.canceled && (
                                  <span className="px-1.5 py-0.5 rounded bg-red-500 text-white text-[9px] font-bold">
                                    ANNULÉ
                                  </span>
                                )}
                                {lesson.test && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-bold">
                                    DEVOIR
                                  </span>
                                )}
                                {lesson.outing && (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-bold">
                                    SORTIE
                                  </span>
                                )}
                              </div>
                              {lesson.status && !lesson.canceled && (
                                <span className="text-[10px] font-bold text-amber-700">
                                  {lesson.status}
                                </span>
                              )}
                              <span className="font-medium text-black/75 truncate">
                                {lesson.teacher} {lesson.group}
                              </span>
                              {lesson.room && (
                                <span className="font-semibold text-[#008673]">
                                  Salle {lesson.room}
                                </span>
                              )}
                              {lesson.memo && (
                                <span className="text-[10px] italic text-black/60 mt-0.5">
                                  {lesson.memo}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. CAHIER DE TEXTES — TRAVAIL À FAIRE
  if (viewId === 'travail-a-faire') {
    const allHw: any[] = data.homeworks || [];
    const hwSubjects = Array.from(new Set(allHw.map((h) => h.subject).filter(Boolean))).sort();
    const filteredHw = allHw.filter((hw) => {
      if (hwFilter === 'todo' && hw.done) return false;
      if (hwFilter === 'done' && !hw.done) return false;
      if (subjectFilter !== 'all' && hw.subject !== subjectFilter) return false;
      return true;
    });

    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="figma-card p-6">
          {renderHeader(
            'Cahier de textes',
            'Travail à faire',
            'Synchronisé avec votre espace élève Pronote — Cochez vos devoirs terminés'
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2">
              {(
                [
                  ['all', `Tous (${allHw.length})`],
                  ['todo', `À faire (${allHw.filter((h) => !h.done).length})`],
                  ['done', `Faits (${allHw.filter((h) => h.done).length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHwFilter(key)}
                  className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all cursor-pointer ${
                    hwFilter === key
                      ? 'bg-[#008673] text-white shadow-sm'
                      : 'bg-white/80 text-black/75 hover:bg-white border border-black/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {hwSubjects.length > 1 && (
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="px-3 py-1.5 rounded-full bg-white border border-black/15 text-[12px] font-semibold text-black focus:outline-none focus:border-[#008673]"
              >
                <option value="all">Toutes les matières</option>
                {hwSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>

          {filteredHw.length === 0 ? (
            <div className="bg-white/90 rounded-[9px] p-8 text-center border border-black/10">
              <p className="text-[14px] font-semibold text-black/65">
                Aucun devoir dans cette catégorie.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filteredHw.map((hw: any) => (
                <div
                  key={hw.id}
                  className="bg-white/90 rounded-[9px] p-4 border border-black/10 shadow-sm flex flex-col gap-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        style={{ background: hw.gradient }}
                        className="w-[6px] h-[54px] rounded-full shrink-0 mt-0.5"
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-full bg-[#009881] text-white text-[11px] font-semibold">
                            Pour {hw.date_label}
                          </span>
                          <span className="text-[14px] font-bold text-black">{hw.subject}</span>
                          {hw.teacher && (
                            <span className="text-[12px] font-medium text-black/60">
                              • {hw.teacher}
                            </span>
                          )}
                        </div>
                        {hw.description_html ? (
                          <div
                            className="text-[13px] font-normal text-black mt-1.5 [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[#008673] [&_a]:underline"
                            dangerouslySetInnerHTML={{ __html: hw.description_html }}
                          />
                        ) : (
                          <p className="text-[13px] font-medium text-black mt-1.5 whitespace-pre-line">
                            {hw.description || 'Travail déposé sur l’espace numérique / Capytale.'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                      <HomeworkStatusBadge done={hw.done} />
                      {hw.type === 'submission' && !hw.submission_deleted ? (
                        <CopieDeposeeButton onDeleteConfirm={() => onDeleteSubmission(hw.id)} />
                      ) : (
                        <JaiTermineButton
                          done={hw.done}
                          onToggle={() => onToggleHomework(hw.id)}
                        />
                      )}
                    </div>
                  </div>
                  <AttachmentChips files={hw.files || []} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. CAHIER DE TEXTES — CONTENUS ET RESSOURCES / FORUMS
  if (viewId === 'contenus-ressources' || viewId === 'forums-pedagogiques') {
    const resourcesList: any[] = data.resources || [];
    const forumsList: any[] = data.forums || [];

    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="figma-card p-6">
          {renderHeader(
            'Cahier de textes',
            viewId === 'forums-pedagogiques'
              ? 'Forums pédagogiques'
              : 'Contenus des cours & Ressources pédagogiques',
            'Supports de cours, TP et fichiers déposés par vos professeurs'
          )}

          {viewId === 'forums-pedagogiques' ? (
            forumsList.length === 0 ? (
              <div className="bg-white/90 rounded-[9px] p-8 text-center border border-black/10">
                <p className="text-[14px] font-semibold text-black/65">
                  Aucun forum pédagogique actif pour le moment.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {forumsList.map((f: any) => (
                  <div
                    key={f.id}
                    className="bg-white/90 rounded-[9px] p-4 border border-black/10 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-[11px] font-bold text-[#008673] uppercase">
                        {f.subject} • {f.teacher}
                      </span>
                      <h3 className="text-[15px] font-bold text-black mt-0.5">{f.title}</h3>
                      <span className="text-[12px] text-black/60">{f.last_update}</span>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[#CDF3ED] text-[#00584C] text-[12px] font-bold">
                      {f.posts_count} messages
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : resourcesList.length === 0 ? (
            <div className="bg-white/90 rounded-[9px] p-8 text-center border border-black/10">
              <p className="text-[14px] font-semibold text-black/65">
                Aucune ressource pédagogique n’est disponible sur cette période.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(new Set(resourcesList.map((r) => r.subject).filter(Boolean))).length > 1 && (
                <div className="flex justify-end">
                  <select
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-full bg-white border border-black/15 text-[12px] font-semibold text-black focus:outline-none focus:border-[#008673]"
                  >
                    <option value="all">Toutes les matières ({resourcesList.length})</option>
                    {Array.from(new Set(resourcesList.map((r) => r.subject).filter(Boolean)))
                      .sort()
                      .map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {resourcesList
                  .filter((res: any) => subjectFilter === 'all' || res.subject === subjectFilter)
                  .map((res: any) => (
                <div
                  key={res.id}
                  className="bg-white/90 rounded-[9px] p-4 border border-black/10 shadow-sm flex gap-3"
                >
                  <div
                    style={{ background: res.gradient }}
                    className="w-[6px] rounded-full shrink-0"
                  />
                  <div className="flex flex-col justify-between flex-1 min-w-0">
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-semibold text-black/60 gap-2">
                        <span className="truncate">
                          {res.subject} {res.teacher ? `• ${res.teacher}` : ''}
                        </span>
                        <span className="shrink-0">{res.date}</span>
                      </div>
                      <h3 className="text-[14px] font-bold text-[#00584C] mt-1">{res.title}</h3>
                      {(res.description_html || res.description) && (
                        res.description_html ? (
                          <div
                            className="text-[12px] font-normal text-black/85 mt-1 [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[#008673] [&_a]:underline"
                            dangerouslySetInnerHTML={{ __html: res.description_html }}
                          />
                        ) : (
                          <p className="text-[12px] font-medium text-black/80 mt-1 whitespace-pre-line">
                            {res.description}
                          </p>
                        )
                      )}
                    </div>
                    <AttachmentChips files={res.files || []} />
                  </div>
                </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 4. NOTES, RELEVÉ, BULLETINS & RÉSULTATS
  if (
    [
      'mes-notes',
      'releve',
      'mon-bulletin',
      'bulletin-classe',
      'anciens-bulletins',
      'livret-scolaire',
      'pluriannuel',
    ].includes(viewId)
  ) {
    const titles: Record<string, string> = {
      'mes-notes': 'Mes notes détaillées',
      releve: 'Relevé de notes périodique',
      'mon-bulletin': 'Mon bulletin de notes',
      'bulletin-classe': `Bulletin de ma classe (${data.user?.class_name || 'Classe'})`,
      'anciens-bulletins': 'Anciens bulletins scolaires',
      'livret-scolaire': 'Livret Scolaire Unique (LSL — Baccalauréat)',
      pluriannuel: 'Suivi pluriannuel des résultats',
    };

    const activePeriod =
      periodsList.find((p) => p.id === selectedPeriodId) || periodsList[0] || null;

    const gradesToShow: any[] = activePeriod ? activePeriod.grades || [] : data.grades || [];
    const averagesToShow: any[] = activePeriod
      ? activePeriod.averages || []
      : data.averages || [];
    const overallAvg = activePeriod
      ? activePeriod.overall_average
      : data.overall_average || '';
    const classOverallAvg = activePeriod
      ? activePeriod.class_overall_average
      : data.class_overall_average || '';
    const report = activePeriod ? activePeriod.report : null;

    return (
      <div className="max-w-[1300px] mx-auto px-6 py-8">
        <div className="figma-card p-6">
          {renderHeader(
            'Notes & Résultats',
            titles[viewId] || 'Notes & Moyennes',
            'Détail des évaluations, moyennes par matière et appréciations des professeurs'
          )}

          {/* Period Switcher + General Average Summary */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white/80 p-4 rounded-[9px] border border-black/10">
            <div className="flex flex-wrap items-center gap-2">
              {periodsList.length > 0 ? (
                periodsList.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPeriodId(p.id);
                      if (p.loaded === false && onLoadPeriod) {
                        onLoadPeriod(p.id);
                      }
                    }}
                    className={`px-4 py-1.5 rounded-full text-[12px] font-bold transition-all cursor-pointer ${
                      selectedPeriodId === p.id
                        ? 'bg-[#008673] text-white shadow-sm'
                        : 'bg-black/5 text-black hover:bg-black/10'
                    }`}
                  >
                    {p.name}
                  </button>
                ))
              ) : (
                <span className="px-4 py-1.5 rounded-full text-[12px] font-bold bg-[#008673] text-white">
                  Période en cours
                </span>
              )}
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-[11px] font-semibold text-black/60 block">
                  Moyenne générale élève
                </span>
                <span className="text-[18px] font-extrabold text-[#008673]">
                  {overallAvg ? `${overallAvg} / 20` : '—'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-semibold text-black/60 block">
                  Moyenne de la classe
                </span>
                <span className="text-[16px] font-bold text-black">
                  {classOverallAvg ? `${classOverallAvg} / 20` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Bulletin General Comments if published */}
          {report && report.comments && report.comments.length > 0 && (
            <div className="mb-6 bg-[#CDF3ED]/45 rounded-[9px] p-4 border border-[#008673]/30">
              <h3 className="text-[13px] font-bold text-[#00584C] mb-1.5">
                Appréciation générale du conseil de classe
              </h3>
              {report.comments.map((c: string, i: number) => (
                <p key={i} className="text-[13px] font-medium text-black/85">
                  {c}
                </p>
              ))}
            </div>
          )}

          {/* Averages & Bulletin Table */}
          {averagesToShow.length > 0 ? (
            <div className="overflow-x-auto bg-white rounded-[9px] border border-black/10 shadow-sm mb-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black text-white text-[12px] font-semibold">
                    <th className="py-3 px-4">Matière</th>
                    <th className="py-3 px-3 text-center">Moy. Élève</th>
                    <th className="py-3 px-3 text-center">Moy. Classe</th>
                    <th className="py-3 px-3 text-center">Min / Max</th>
                    <th className="py-3 px-4">Appréciation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 text-[13px]">
                  {averagesToShow.map((avg: any) => (
                    <tr key={avg.subject} className="hover:bg-[#CDF3ED]/25 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            style={{ background: avg.gradient }}
                            className="w-[5px] h-[32px] rounded-full shrink-0"
                          />
                          <div>
                            <div className="font-bold text-black">{avg.subject}</div>
                            {avg.teacher && (
                              <div className="text-[11px] font-medium text-black/60">
                                {avg.teacher}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-[#00584C] text-[14px]">
                        {avg.student_avg || '—'}
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-black/75">
                        {avg.class_avg || '—'}
                      </td>
                      <td className="py-3 px-3 text-center text-[12px] text-black/60">
                        {avg.min || '—'} – {avg.max || '—'}
                      </td>
                      <td className="py-3 px-4 font-medium text-black/85">
                        {avg.appreciation || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white/80 rounded-[9px] p-6 text-center border border-black/10 mb-6">
              <p className="text-[13px] font-semibold text-black/60">
                Aucune moyenne calculée pour cette période.
              </p>
            </div>
          )}

          {/* Individual Evaluations List */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-[15px] font-bold text-[#00584C]">
              Détail des devoirs notés ({gradesToShow.length})
            </h3>
            {gradesToShow.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white/80 p-1 rounded-full border border-black/10">
                <button
                  type="button"
                  onClick={() => setGradesViewMode('chronological')}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                    gradesViewMode === 'chronological'
                      ? 'bg-[#008673] text-white'
                      : 'text-black/70 hover:text-black'
                  }`}
                >
                  Par ordre chronologique
                </button>
                <button
                  type="button"
                  onClick={() => setGradesViewMode('subject')}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                    gradesViewMode === 'subject'
                      ? 'bg-[#008673] text-white'
                      : 'text-black/70 hover:text-black'
                  }`}
                >
                  Par matière
                </button>
              </div>
            )}
          </div>
          {gradesToShow.length === 0 ? (
            <div className="bg-white/80 rounded-[9px] p-6 text-center border border-black/10">
              <p className="text-[13px] font-semibold text-black/60">
                Aucune note enregistrée sur cette période.
              </p>
            </div>
          ) : gradesViewMode === 'subject' ? (
            <div className="flex flex-col gap-4">
              {Object.entries(
                gradesToShow.reduce((acc: Record<string, any[]>, g: any) => {
                  (acc[g.subject] = acc[g.subject] || []).push(g);
                  return acc;
                }, {})
              ).map(([subj, list]: [string, any[]]) => (
                <div key={subj} className="bg-white/80 rounded-[9px] p-4 border border-black/10">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div
                      style={{ background: list[0]?.gradient }}
                      className="w-[5px] h-[18px] rounded-full"
                    />
                    <span className="text-[14px] font-bold text-[#00584C]">{subj}</span>
                    <span className="text-[11px] text-black/55">({list.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {list.map((g: any) => (
                      <div
                        key={g.id}
                        className="bg-white rounded-[8px] p-3 border border-black/5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <span className="text-[12px] font-semibold text-black block truncate">
                            {g.title}
                          </span>
                          <span className="text-[11px] text-black/55">
                            {g.date} • Coeff. {g.coeff}
                            {g.class_avg ? ` • Classe : ${g.class_avg}/${g.out_of}` : ''}
                          </span>
                        </div>
                        <div className="px-2.5 py-1 rounded-lg bg-[#CDF3ED] text-[#00584C] font-extrabold text-[14px] shrink-0">
                          {g.grade}
                          <span className="text-[11px] font-semibold">/{g.out_of}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {gradesToShow.map((g: any) => (
                <div
                  key={g.id}
                  className="bg-white/90 rounded-[9px] p-3.5 border border-black/10 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      style={{ background: g.gradient }}
                      className="w-[5px] h-[42px] rounded-full shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-[13px] font-bold text-black block truncate">
                        {g.subject}
                      </span>
                      <span className="text-[12px] font-medium text-black/75 block truncate">
                        {g.title}
                      </span>
                      <span className="text-[11px] text-black/55">
                        {g.date} • Coeff. {g.coeff}
                        {g.class_avg ? ` • Classe : ${g.class_avg}/${g.out_of}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-[#CDF3ED] text-[#00584C] font-extrabold text-[15px] shrink-0">
                    {g.grade}
                    <span className="text-[11px] font-semibold">/{g.out_of}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 5. COMPÉTENCES
  if (
    [
      'mes-evaluations',
      'difficultes-appui',
      'comp-mon-bulletin',
      'comp-bulletin-classe',
      'eval-competences',
      'niveaux-maitrise',
      'livret-num',
      'anciens-bilans',
    ].includes(viewId)
  ) {
    const activePeriod =
      periodsList.find((p) => p.id === selectedPeriodId) || periodsList[0] || null;
    const compList: any[] = activePeriod
      ? activePeriod.competences || []
      : data.competences || [];

    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="figma-card p-6">
          {renderHeader(
            'Compétences',
            'Évaluations & Niveaux de maîtrise par compétences',
            'Suivi des acquis scolaires et compétences'
          )}

          {periodsList.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-5">
              {periodsList.map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPeriodId(p.id)}
                  className={`px-4 py-1.5 rounded-full text-[12px] font-bold transition-all cursor-pointer ${
                    selectedPeriodId === p.id
                      ? 'bg-[#008673] text-white shadow-sm'
                      : 'bg-white/80 text-black hover:bg-white border border-black/10'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {compList.length === 0 ? (
            <div className="bg-white/90 rounded-[9px] p-8 text-center border border-black/10">
              <p className="text-[14px] font-semibold text-black/65">
                Aucune évaluation par compétences sur cette période.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {compList.map((c: any) => (
                <div
                  key={c.id}
                  className="bg-white/90 rounded-[9px] p-4 border border-black/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <span className="text-[11px] font-bold text-[#008673] uppercase">
                      {c.subject} • {c.domain}
                    </span>
                    <h3 className="text-[14px] font-bold text-black mt-0.5">{c.skill}</h3>
                    <span className="text-[12px] text-black/60">
                      Évalué le {c.date}
                      {c.teacher ? ` par ${c.teacher}` : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {c.level_label && (
                      <span className="text-[12px] font-semibold text-[#00584C]">
                        {c.level_label}
                      </span>
                    )}
                    <span className="w-9 h-9 rounded-full bg-[#008673] text-white font-bold text-[13px] flex items-center justify-center shadow-sm">
                      {c.level}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 6. VIE SCOLAIRE — CARNET DE CORRESPONDANCE
  if (viewId === 'carnet') {
    const absences: any[] = data.vie_scolaire?.absences || [];
    const retards: any[] = data.vie_scolaire?.retards || [];
    const punitions: any[] = data.vie_scolaire?.punitions || [];
    const isEmpty = absences.length === 0 && retards.length === 0 && punitions.length === 0;

    return (
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <div className="figma-card p-6">
          {renderHeader(
            'Vie scolaire',
            'Carnet de correspondance & Assiduité',
            'Suivi des absences, retards, punitions et observations'
          )}

          {isEmpty ? (
            <div className="bg-white/90 rounded-[9px] p-8 text-center border border-black/10">
              <div className="w-14 h-14 rounded-full bg-[#CDF3ED] text-[#008673] flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
                ✓
              </div>
              <h3 className="text-[16px] font-bold text-[#00584C]">
                {data.vie_scolaire?.carnet_empty_message ||
                  'Votre carnet est vide, vous êtes blanc comme neige.'}
              </h3>
              <p className="text-[13px] font-medium text-black/65 mt-1">
                Aucune absence, aucun retard ni punition enregistrés sur l’année en cours.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Summary Counters */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/90 rounded-[9px] p-4 border border-black/10 text-center">
                  <span className="text-[24px] font-extrabold text-[#00584C] block">
                    {absences.length}
                  </span>
                  <span className="text-[12px] font-semibold text-black/65">Absence(s)</span>
                </div>
                <div className="bg-white/90 rounded-[9px] p-4 border border-black/10 text-center">
                  <span className="text-[24px] font-extrabold text-amber-600 block">
                    {retards.length}
                  </span>
                  <span className="text-[12px] font-semibold text-black/65">Retard(s)</span>
                </div>
                <div className="bg-white/90 rounded-[9px] p-4 border border-black/10 text-center">
                  <span className="text-[24px] font-extrabold text-red-600 block">
                    {punitions.length}
                  </span>
                  <span className="text-[12px] font-semibold text-black/65">Punition(s)</span>
                </div>
              </div>

              {absences.length > 0 && (
                <div>
                  <h3 className="text-[15px] font-bold text-[#00584C] mb-2.5">Absences</h3>
                  <div className="flex flex-col gap-2.5">
                    {absences.map((ab: any) => (
                      <div
                        key={ab.id}
                        className="bg-white/90 rounded-[9px] p-3.5 border border-black/10 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <span className="text-[13px] font-bold text-black block">
                            Du {ab.from_date} au {ab.to_date} {ab.hours ? `(${ab.hours})` : ''}
                          </span>
                          {ab.reasons && ab.reasons.length > 0 && (
                            <span className="text-[12px] text-black/70">
                              Motif : {ab.reasons.join(', ')}
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            ab.justified
                              ? 'bg-[#CDF3ED] text-[#00584C]'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {ab.justified ? 'Justifiée' : 'Non justifiée'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {retards.length > 0 && (
                <div>
                  <h3 className="text-[15px] font-bold text-[#00584C] mb-2.5">Retards</h3>
                  <div className="flex flex-col gap-2.5">
                    {retards.map((dl: any) => (
                      <div
                        key={dl.id}
                        className="bg-white/90 rounded-[9px] p-3.5 border border-black/10 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <span className="text-[13px] font-bold text-black block">
                            Le {dl.date} — {dl.minutes} min
                          </span>
                          {(dl.justification || (dl.reasons && dl.reasons.length > 0)) && (
                            <span className="text-[12px] text-black/70">
                              {dl.justification || dl.reasons.join(', ')}
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            dl.justified
                              ? 'bg-[#CDF3ED] text-[#00584C]'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {dl.justified ? 'Justifié' : 'Non justifié'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {punitions.length > 0 && (
                <div>
                  <h3 className="text-[15px] font-bold text-[#00584C] mb-2.5">Punitions</h3>
                  <div className="flex flex-col gap-2.5">
                    {punitions.map((pu: any) => (
                      <div
                        key={pu.id}
                        className="bg-white/90 rounded-[9px] p-3.5 border border-red-200"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-bold text-red-700">{pu.nature}</span>
                          <span className="text-[12px] text-black/60">{pu.date}</span>
                        </div>
                        {pu.giver && (
                          <span className="text-[12px] font-medium text-black/70 block">
                            Donnée par : {pu.giver}
                          </span>
                        )}
                        {pu.reasons && pu.reasons.length > 0 && (
                          <p className="text-[12px] text-black/80 mt-1">
                            Motif : {pu.reasons.join(', ')}
                          </p>
                        )}
                        {pu.circumstances && (
                          <p className="text-[12px] text-black/70 mt-0.5">{pu.circumstances}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 7. COMMUNICATION — AGENDA / INFOS & SONDAGES / DISCUSSIONS / RENDEZ-VOUS / MENU CANTINE
  if (
    ['agenda', 'infos-sondages', 'discussions', 'mes-rendez-vous', 'menu-cantine'].includes(viewId)
  ) {
    const allInfos: any[] = data.informations || [];
    const infoCategories = Array.from(new Set(allInfos.map((i) => i.category).filter(Boolean))).sort();
    const filteredInfos = allInfos.filter((inf) => {
      if (infoFilter === 'unread' && inf.read) return false;
      if (infoFilter === 'surveys' && !inf.is_survey) return false;
      if (infoCategoryFilter !== 'all' && inf.category !== infoCategoryFilter) return false;
      return true;
    });

    const allDiscs: any[] = data.discussions || [];
    const filteredDiscs = allDiscs.filter((d) => {
      if (discFilter === 'unread' && !d.unread) return false;
      if (discFilter === 'closed' && !d.closed) return false;
      if (discSearch.trim()) {
        const q = discSearch.trim().toLowerCase();
        const matchSubj = (d.subject || '').toLowerCase().includes(q);
        const matchPart = (d.participants || '').toLowerCase().includes(q);
        if (!matchSubj && !matchPart) return false;
      }
      return true;
    });

    return (
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <div className="figma-card p-6">
          {renderHeader(
            'Communication',
            viewId === 'agenda'
              ? 'Agenda de l’établissement'
              : viewId === 'infos-sondages'
              ? 'Informations & Sondages'
              : viewId === 'discussions'
              ? 'Messagerie & Discussions'
              : viewId === 'menu-cantine'
              ? 'Menus de la restauration scolaire'
              : 'Mes rendez-vous',
            'Lycée Odilon Redon — Pauillac (0332081H)'
          )}

          {viewId === 'agenda' && (
            <div className="bg-white/90 rounded-[9px] overflow-hidden divide-y divide-black/10 border border-black/10">
              {(data.agenda || []).length === 0 ? (
                <p className="p-8 text-center text-[13px] font-medium text-black/60">
                  Aucun événement à venir.
                </p>
              ) : (
                (data.agenda || []).map((ev: any) => (
                  <AgendaEventRow
                    key={ev.id}
                    day={ev.day}
                    month={ev.month}
                    title={ev.title}
                    subtitle={ev.subtitle}
                  />
                ))
              )}
            </div>
          )}

          {viewId === 'infos-sondages' && (
            <div className="flex flex-col gap-4">
              {/* Filter Pills + Category (Nature) Dropdown */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ['all', `Toutes (${allInfos.length})`],
                      ['unread', `Non lues (${allInfos.filter((i) => !i.read).length})`],
                      ['surveys', `Sondages (${allInfos.filter((i) => i.is_survey).length})`],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setInfoFilter(key)}
                      className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all cursor-pointer ${
                        infoFilter === key
                          ? 'bg-[#008673] text-white shadow-sm'
                          : 'bg-white/80 text-black/75 hover:bg-white border border-black/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {infoCategories.length > 1 && (
                  <select
                    value={infoCategoryFilter}
                    onChange={(e) => setInfoCategoryFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-full bg-white border border-black/15 text-[12px] font-semibold text-black focus:outline-none focus:border-[#008673]"
                  >
                    <option value="all">Toutes les catégories</option>
                    {infoCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {filteredInfos.length === 0 ? (
                <div className="bg-white/90 rounded-[9px] p-8 text-center border border-black/10">
                  <p className="text-[14px] font-semibold text-black/65">
                    Aucune information ou sondage dans cette catégorie.
                  </p>
                </div>
              ) : (
                filteredInfos.map((inf: any) => (
                  <div
                    key={inf.id}
                    className={`bg-white/95 rounded-[9px] p-4 border shadow-sm transition-colors ${
                      !inf.read ? 'border-[#008673] ring-1 ring-[#008673]/25' : 'border-black/10'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold">
                      <div className="flex items-center gap-2">
                        {!inf.read && (
                          <span className="px-2 py-0.5 rounded-full bg-[#008673] text-white text-[10px] font-bold">
                            NOUVEAU
                          </span>
                        )}
                        {inf.is_survey && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                            SONDAGE
                          </span>
                        )}
                        <span className="text-[#008673]">{inf.category}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-black/60">{inf.date}</span>
                        {onMarkInfoRead && (
                          <button
                            type="button"
                            onClick={() => onMarkInfoRead(inf.id, !inf.read)}
                            className="px-2.5 py-1 rounded-full bg-black/5 hover:bg-[#CDF3ED] text-[#00584C] text-[11px] font-semibold cursor-pointer transition-colors"
                          >
                            {inf.read ? 'Marquer non lu' : '✓ Marquer comme lu'}
                          </button>
                        )}
                      </div>
                    </div>
                    <h3 className="text-[15px] font-bold text-black mt-1.5">{inf.title}</h3>
                    <span className="text-[12px] font-medium text-black/60 block mb-2">
                      Par {inf.author}
                    </span>
                    {inf.content_html ? (
                      <div
                        className="text-[13px] font-normal text-black/90 leading-relaxed [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[#008673] [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: inf.content_html }}
                      />
                    ) : (
                      <p className="text-[13px] font-medium text-black/85 leading-relaxed whitespace-pre-line">
                        {inf.content || 'Aucun contenu détaillé.'}
                      </p>
                    )}
                    <AttachmentChips files={inf.attachments || []} />
                  </div>
                ))
              )}
            </div>
          )}

          {viewId === 'discussions' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ['all', `Toutes (${allDiscs.length})`],
                      ['unread', `Non lues (${allDiscs.filter((d) => d.unread).length})`],
                      ['closed', `Fermées (${allDiscs.filter((d) => d.closed).length})`],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDiscFilter(key)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                        discFilter === key
                          ? 'bg-[#008673] text-white shadow-sm'
                          : 'bg-white/80 text-black/75 hover:bg-white border border-black/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <input
                    type="text"
                    value={discSearch}
                    onChange={(e) => setDiscSearch(e.target.value)}
                    placeholder="Rechercher..."
                    className="h-8 px-3 rounded-full bg-white border border-black/15 text-[12px] focus:outline-none focus:border-[#008673] w-44"
                  />
                </div>
                {onCreateDiscussion && (
                  <button
                    type="button"
                    onClick={openNewDiscussionModal}
                    className="px-4 py-2 rounded-full bg-[#008673] hover:bg-[#00584C] text-white text-[12px] font-bold shadow-sm cursor-pointer transition-colors"
                  >
                    + Nouvelle discussion
                  </button>
                )}
              </div>

              {showNewDisc && (
                <div className="bg-white rounded-[9px] p-4 border-2 border-[#008673] shadow-md space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[14px] font-bold text-[#00584C]">
                      Démarrer une nouvelle discussion
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowNewDisc(false)}
                      className="text-black/50 hover:text-black font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  {newDiscError && (
                    <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold">
                      {newDiscError}
                    </div>
                  )}
                  <div>
                    <label className="block text-[12px] font-bold text-black mb-1">
                      Destinataire(s)
                    </label>
                    {loadingRecipients ? (
                      <p className="text-[12px] text-black/55">Chargement des destinataires...</p>
                    ) : (
                      <select
                        multiple
                        value={selectedRecipientIds}
                        onChange={(e) =>
                          setSelectedRecipientIds(
                            Array.from(e.target.selectedOptions, (opt) => opt.value)
                          )
                        }
                        className="w-full h-28 p-2 rounded-lg border border-black/20 text-[12px]"
                      >
                        {recipients.map((r: any) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <span className="text-[10px] text-black/50">
                      Maintenez Ctrl pour sélectionner plusieurs destinataires
                    </span>
                  </div>
                  <input
                    type="text"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="Objet de la discussion"
                    className="w-full h-9 px-3 rounded-lg border border-black/20 text-[13px]"
                  />
                  <textarea
                    rows={3}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Votre message..."
                    className="w-full p-3 rounded-lg border border-black/20 text-[13px]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewDisc(false)}
                      className="px-3.5 py-1.5 rounded-lg bg-black/5 text-[12px] font-semibold cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={creatingDisc}
                      onClick={async () => {
                        if (!onCreateDiscussion) return;
                        setNewDiscError(null);
                        setCreatingDisc(true);
                        try {
                          await onCreateDiscussion(newSubject, newMessage, selectedRecipientIds);
                          setShowNewDisc(false);
                          setNewSubject('');
                          setNewMessage('');
                          setSelectedRecipientIds([]);
                        } catch (err: any) {
                          setNewDiscError(err.message || 'Erreur');
                        } finally {
                          setCreatingDisc(false);
                        }
                      }}
                      className="px-4 py-1.5 rounded-lg bg-[#008673] text-white text-[12px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      {creatingDisc ? 'Envoi...' : 'Envoyer'}
                    </button>
                  </div>
                </div>
              )}

              {filteredDiscs.length === 0 ? (
                <div className="bg-white/90 rounded-[9px] p-8 text-center border border-black/10">
                  <p className="text-[14px] font-semibold text-black/65">
                    Aucune discussion dans cette catégorie.
                  </p>
                </div>
              ) : (
                filteredDiscs.map((d: any) => {
                  const isOpen = activeDiscId === d.id || filteredDiscs.length === 1;
                  return (
                    <div
                      key={d.id}
                      className={`bg-white/95 rounded-[9px] p-4 border shadow-sm ${
                        d.unread ? 'border-[#008673] ring-1 ring-[#008673]/25' : 'border-black/10'
                      }`}
                    >
                      <div
                        onClick={() => setActiveDiscId(isOpen ? null : d.id)}
                        className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          {d.unread && (
                            <span className="px-2 py-0.5 rounded-full bg-[#008673] text-white text-[10px] font-bold">
                              NON LU
                            </span>
                          )}
                          <h3 className="text-[15px] font-bold text-[#00584C]">{d.subject}</h3>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[12px] font-medium text-black/60">{d.date}</span>
                          {onMarkDiscussionRead && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMarkDiscussionRead(d.id, !d.unread);
                              }}
                              className="px-2.5 py-0.5 rounded-full bg-black/5 hover:bg-[#CDF3ED] text-[#00584C] text-[11px] font-semibold cursor-pointer"
                            >
                              {d.unread ? 'Marquer lu' : 'Marquer non lu'}
                            </button>
                          )}
                        </div>
                      </div>
                      <span className="text-[12px] font-semibold text-black/70 block mt-0.5">
                        {d.participants}
                      </span>

                      {isOpen && (
                        <div className="mt-3 space-y-2.5">
                          {(d.messages || []).length === 0 ? (
                            <p className="text-[12px] italic text-black/50">
                              Aucun message affiché dans ce fil.
                            </p>
                          ) : (
                            (d.messages || []).map((m: any, i: number) => (
                              <div
                                key={m.id || i}
                                className="p-3 rounded-lg bg-[#CDF3ED]/35 border border-black/5 text-[13px]"
                              >
                                <div className="flex items-center justify-between text-[11px] font-bold text-[#00584C] mb-1">
                                  <span>{m.sender}</span>
                                  <span className="text-black/50 font-medium">{m.date}</span>
                                </div>
                                {m.body_html ? (
                                  <div
                                    className="font-normal text-black [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[#008673] [&_a]:underline"
                                    dangerouslySetInnerHTML={{ __html: m.body_html }}
                                  />
                                ) : (
                                  <p className="font-medium text-black whitespace-pre-line">
                                    {m.body}
                                  </p>
                                )}
                              </div>
                            ))
                          )}

                          {onReplyDiscussion && d.replyable !== false && !d.closed && (
                            <div className="pt-2 flex flex-col gap-2">
                              {replyError && (
                                <span className="text-[11px] font-semibold text-red-600">
                                  {replyError}
                                </span>
                              )}
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  placeholder="Répondre à cette discussion..."
                                  className="flex-1 h-9 px-3 rounded-lg border border-black/20 text-[13px] focus:outline-none focus:border-[#008673]"
                                />
                                <button
                                  type="button"
                                  disabled={sendingReply || !replyText.trim()}
                                  onClick={async () => {
                                    setReplyError(null);
                                    setSendingReply(true);
                                    try {
                                      await onReplyDiscussion(d.id, replyText);
                                      setReplyText('');
                                    } catch (err: any) {
                                      setReplyError(err.message || "Erreur d'envoi");
                                    } finally {
                                      setSendingReply(false);
                                    }
                                  }}
                                  className="px-4 h-9 rounded-lg bg-[#008673] hover:bg-[#00584C] text-white text-[12px] font-bold cursor-pointer disabled:opacity-50"
                                >
                                  {sendingReply ? '...' : 'Répondre'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {viewId === 'menu-cantine' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(data.days || {}).map(([iso, dObj]: [string, any]) => {
                const lunch: string[] = dObj.canteen?.lunch || dObj.canteen?.items || [];
                const dinner: string[] = dObj.canteen?.dinner || [];
                return (
                  <div
                    key={iso}
                    className="bg-white/90 rounded-[9px] p-4 border border-black/10 shadow-sm space-y-3"
                  >
                    <span className="text-[14px] font-bold text-[#00584C] block">
                      {dObj.label} ({dObj.week})
                    </span>
                    {lunch.length === 0 && dinner.length === 0 ? (
                      <p className="text-[12px] text-black/55 italic">
                        {dObj.canteen?.subtitle || 'Aucun menu communiqué'}
                      </p>
                    ) : (
                      <>
                        {lunch.length > 0 && (
                          <div>
                            <span className="text-[11px] font-bold uppercase text-[#008673] block mb-1">
                              Repas de midi
                            </span>
                            <ul className="space-y-1.5 text-[13px] font-medium text-black">
                              {lunch.map((item: string, i: number) => (
                                <li key={i} className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-[#008673] shrink-0" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {dinner.length > 0 && (
                          <div>
                            <span className="text-[11px] font-bold uppercase text-amber-700 block mb-1">
                              Repas du soir
                            </span>
                            <ul className="space-y-1.5 text-[13px] font-medium text-black">
                              {dinner.map((item: string, i: number) => (
                                <li key={i} className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {viewId === 'mes-rendez-vous' && (
            <div className="bg-white/90 rounded-[9px] p-8 text-center border border-black/10">
              <p className="text-[14px] font-semibold text-black/70">
                Aucun rendez-vous programmé pour le moment.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 8. MES DONNÉES — COMPTE & DOCUMENTS
  const docsList: any[] = data.documents || [];
  return (
    <div className="max-w-[1000px] mx-auto px-6 py-8">
      <div className="figma-card p-6">
        {renderHeader(
          'Mes données',
          viewId === 'documents' ? 'Mes documents administratifs' : 'Mon compte élève',
          'Informations synchronisées avec le Lycée Odilon Redon (0332081H)'
        )}

        {viewId === 'documents' ? (
          docsList.length === 0 ? (
            <div className="bg-white/90 rounded-[9px] p-8 text-center border border-black/10">
              <p className="text-[14px] font-semibold text-black/65">
                Aucun document administratif disponible sur Pronote.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {docsList.map((doc: any) => (
                <div
                  key={doc.id}
                  className="bg-white/90 rounded-[9px] p-4 border border-black/10 flex items-center justify-between"
                >
                  <div>
                    <span className="text-[11px] font-bold text-[#008673] uppercase">
                      {doc.category}
                    </span>
                    <h3 className="text-[14px] font-bold text-black">{doc.title}</h3>
                    <span className="text-[12px] text-black/60">
                      Mis à disposition le {doc.date} • {doc.size}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="px-3.5 py-1.5 rounded-full bg-[#008673] text-white text-[12px] font-semibold hover:bg-[#00584C] cursor-pointer"
                  >
                    Télécharger PDF
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="bg-white/90 rounded-[9px] p-6 border border-black/10 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
            {data.user?.profile_picture && (
              <div className="sm:col-span-2 flex items-center gap-4 pb-3 border-b border-black/10">
                <img
                  src={data.user.profile_picture}
                  alt={data.user.name}
                  className="w-20 h-20 rounded-full object-cover border-2 border-[#008673] shadow-sm"
                />
                <div>
                  <span className="font-bold text-[16px] text-black block">{data.user?.name}</span>
                  <span className="text-[12px] font-semibold text-[#008673]">
                    {data.user?.class_name} • {data.user?.establishment}
                  </span>
                </div>
              </div>
            )}
            <div>
              <span className="text-black/55 font-medium block">Élève</span>
              <span className="font-bold text-[15px] text-black">
                {data.user?.name}
                {data.user?.delegue && (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-[#CDF3ED] text-[#00584C] text-[11px] font-bold">
                    Délégué(e)
                  </span>
                )}
              </span>
            </div>
            <div>
              <span className="text-black/55 font-medium block">Classe</span>
              <span className="font-bold text-[15px] text-[#00584C]">{data.user?.class_name}</span>
            </div>
            <div>
              <span className="text-black/55 font-medium block">Établissement</span>
              <span className="font-semibold text-black">{data.user?.establishment}</span>
            </div>
            <div>
              <span className="text-black/55 font-medium block">Numéro INE</span>
              <span className="font-semibold text-black">{data.user?.ine || 'Non renseigné'}</span>
            </div>
            {data.user?.email && (
              <div>
                <span className="text-black/55 font-medium block">E-mail</span>
                <span className="font-semibold text-black">{data.user.email}</span>
              </div>
            )}
            {data.user?.phone && (
              <div>
                <span className="text-black/55 font-medium block">Téléphone</span>
                <span className="font-semibold text-black">{data.user.phone}</span>
              </div>
            )}
            {data.user?.address && (
              <div className="sm:col-span-2">
                <span className="text-black/55 font-medium block">Adresse</span>
                <span className="font-semibold text-black">{data.user.address}</span>
              </div>
            )}
            <div>
              <span className="text-black/55 font-medium block">Authentification</span>
              <span className="font-semibold text-[#008673]">
                ÉduConnect Nouvelle-Aquitaine (Lycée Connecté)
              </span>
            </div>
          </div>
        )}
        {(data.extraction_warnings || []).length > 0 && (
          <div className="mt-6 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[12px]">
            <strong>Note Pronote :</strong>{' '}
            {(data.extraction_warnings || []).join(' • ')}
          </div>
        )}
      </div>
    </div>
  );
};
