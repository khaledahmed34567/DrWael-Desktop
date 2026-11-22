(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DWStudentPro = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  const PRO_FREE_LAUNCH_MS = Date.UTC(2026, 10, 21, 0, 0, 0);

  function txt(lang, ar, en) {
    return lang === 'en' ? en : ar;
  }

  function parseMs(val) {
    if (!val) return 0;
    if (typeof val === 'number') return Number.isFinite(val) && val > 0 ? val : 0;
    if (typeof val === 'string') {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) return n;
      const p = Date.parse(val);
      return Number.isFinite(p) && p > 0 ? p : 0;
    }
    if (typeof val === 'object') {
      if (typeof val.toDate === 'function') {
        try {
          const d = val.toDate();
          return d ? d.getTime() : 0;
        } catch (e) {
          return 0;
        }
      }
      if (typeof val.seconds === 'number') {
        return val.seconds * 1000 + Math.round((val.nanoseconds || 0) / 1e6);
      }
    }
    return 0;
  }

  function evaluateProAccess(profile, settings, nowMs) {
    const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
    if (!profile) {
      return {
        active: false,
        paid: false,
        freeYearActive: false,
        isAdmin: false,
        freeUntil: 0,
        paidUntil: 0,
        effectiveUntil: 0,
        daysRemaining: 0,
        includesCourses: false,
        source: 'none'
      };
    }

    const isAdmin = profile.role === 'admin';
    const paidUntil = parseMs(profile.vipUntil);
    const paid = Boolean(profile.vip || paidUntil > now);
    const s = settings || {};
    const freeEnabled = s.freePro !== false && s.freeProYear !== false;

    const createdMs = parseMs(profile.createdAt);
    const freeStart = createdMs > 0 ? Math.max(createdMs, PRO_FREE_LAUNCH_MS) : PRO_FREE_LAUNCH_MS;
    const freeUntil = freeEnabled ? (freeStart + ONE_YEAR_MS) : 0;
    const freeYearActive = Boolean(freeEnabled && now < freeUntil);

    const effectiveUntil = Math.max(paidUntil, freeYearActive ? freeUntil : 0);
    const active = Boolean(isAdmin || paid || freeYearActive);
    const daysRemaining = active && effectiveUntil > now
      ? Math.max(1, Math.ceil((effectiveUntil - now) / 86400000))
      : 0;

    let source = 'none';
    if (isAdmin) source = 'admin';
    else if (paid) source = 'paid';
    else if (freeYearActive) source = 'free-year';

    return {
      active,
      paid,
      freeYearActive,
      isAdmin,
      freeUntil,
      paidUntil,
      effectiveUntil,
      daysRemaining,
      includesCourses: false,
      source
    };
  }

  function hasCourseAccess(course, subsMap, profile) {
    if (!course || !course.id) return false;
    if (profile && profile.role === 'admin') return true;
    const price = Number(course.price || 0);
    if (price <= 0) return true;
    return Boolean(subsMap && subsMap[course.id]);
  }

  function getProFeaturesList(lang) {
    const l = lang === 'en' ? 'en' : 'ar';
    return [
      {
        id: 'ai-chat',
        title: txt(l, 'مساعد د. وائل AI وتلخيص المحاضرات', 'Dr. Wael AI & Lecture Summarizer'),
        desc: txt(l, 'اسأل الذكاء الاصطناعي في المواد البيطرية ولخّص أي مهمة أو اختبار بضغطة واحدة.', 'Ask AI any study question and summarize tasks or quizzes in one tap.')
      },
      {
        id: 'forum-group',
        title: txt(l, 'المنتدى الخاص والجروب الجامع وأولوية النشر', 'Private Forum, Community Group & Priority'),
        desc: txt(l, 'المشاركة في منتدى برو، الجروب الجامع، ورفع حتى 8 صور مع فترة انتظار أقصر.', 'Access Pro forum, community group chat, up to 8 images/post, and shorter cooldown.')
      },
      {
        id: 'themes-cloud',
        title: txt(l, 'الثيمات المميزة والأيقونات والحفظ السحابي', 'Pro Themes, Icons & Cloud Sync'),
        desc: txt(l, 'فتح كل الثيمات، أيقونات التطبيق، وحفظ ملاحظات الـ PDF ومحادثات AI في حسابك.', 'Unlock all themes, app icons, and cloud sync for PDF notes and AI chats.')
      },
      {
        id: 'student-hub',
        title: txt(l, 'حقيبة الطالب الذكية والمراجعة', 'Smart Student Study Hub'),
        desc: txt(l, 'بطاقات مراجعة بيطرية، خطة يومية، حاسبة GPA والمحاليل الوريدية، ومفكرة دراسية.', 'Veterinary flashcards, daily study planner, GPA & fluid calculators, and study notes.')
      }
    ];
  }

  function getDefaultFlashcards(lang) {
    const l = lang === 'en' ? 'en' : 'ar';
    return [
      {
        id: 'fc-anat-1',
        subject: 'anatomy',
        subjectLabel: txt(l, 'التشريح', 'Anatomy'),
        front: txt(l, 'ما عدد الغرف في معدة المجترات (Ruminants)؟ وما وظيفة كل منها؟', 'What are the 4 compartments of the ruminant stomach and their main roles?'),
        back: txt(l, 'الكرش (Rumen: التخمّر الميكروبي)، القلنسوة (Reticulum: التقاط الأجسام الغريبة ودفع البلعة)، الورقية (Omasum: امتصاص الماء والأملاح)، والمنفحة (Abomasum: المعدة الحقيقية الهاضمة بالإنزيمات والأحماض).', 'Rumen (microbial fermentation), Reticulum (honeycomb/hardware trap & regurgitation), Omasum (water/electrolyte absorption), Abomasum (true enzymatic/acidic stomach).')
      },
      {
        id: 'fc-anat-2',
        subject: 'anatomy',
        subjectLabel: txt(l, 'التشريح', 'Anatomy'),
        front: txt(l, 'أي الضلوع في الكلب والقطة يُعتبر الضلع العائم (Floating rib)؟', 'Which rib is the floating rib in dogs and cats?'),
        back: txt(l, 'الضلع الثالث عشر (13th rib) لا يتصل غضروفه بالقوس الضلعي في أغلب الحالات وينتهي حرًا في عضلات جدار البطن.', 'The 13th rib (costochondral cartilage ends freely in the abdominal wall without joining the costal arch).')
      },
      {
        id: 'fc-phys-1',
        subject: 'physiology',
        subjectLabel: txt(l, 'الفسيولوجي', 'Physiology'),
        front: txt(l, 'ما المعدل الطبيعي لنبض القلب ودرجة الحرارة في الكلب البالغ؟', 'What are normal resting heart rate and rectal temperature in an adult dog?'),
        back: txt(l, 'النبض: 70–120 نبضة/دقيقة (وقد يصل 160 في السلالات الصغيرة) · الحرارة المستقيمية: 38.0–39.2°م (100.5–102.5°F).', 'Heart rate: 70–120 bpm (up to ~160 in toy breeds) · Rectal temp: 38.0–39.2°C (100.5–102.5°F).')
      },
      {
        id: 'fc-phys-2',
        subject: 'physiology',
        subjectLabel: txt(l, 'الفسيولوجي', 'Physiology'),
        front: txt(l, 'ما زمن امتلاء الشعيرات الدموية (CRT) الطبيعي في الحيوانات الأليفة؟', 'What is the normal Capillary Refill Time (CRT) in small animals?'),
        back: txt(l, 'أقل من ثانيتين (1–2 ثانية). تأخره (>2 ثانية) يشير عادةً إلى ضعف التروية أو الجفاف أو الصدمة.', 'Less than 2 seconds (1–2 s). Prolonged CRT (>2 s) suggests poor perfusion, dehydration, or shock.')
      },
      {
        id: 'fc-pharm-1',
        subject: 'pharmacology',
        subjectLabel: txt(l, 'الفارماكولوجي', 'Pharmacology'),
        front: txt(l, 'لماذا يُمنع إعطاء الباراسيتامول (Acetaminophen) للقطط؟', 'Why is Acetaminophen (Paracetamol) strictly contraindicated in cats?'),
        back: txt(l, 'لأن القطط تفتقر لإنزيم Glucuronyl transferase اللازم لأيضه، مما يسبب تراكم نواتج سامة تدمر كرات الدم الحمراء (Methemoglobinemia) والكبد.', 'Cats lack UDP-glucuronosyltransferase needed for conjugation, leading to fatal methemoglobinemia, Heinz body anemia, and hepatotoxicity.')
      },
      {
        id: 'fc-pharm-2',
        subject: 'pharmacology',
        subjectLabel: txt(l, 'الفارماكولوجي', 'Pharmacology'),
        front: txt(l, 'ما الترياق النوعي (Antidote) لتسمم مضادات التخثر (Warfarin / Brodifacoum)؟', 'What is the specific antidote for anticoagulant rodenticide toxicity?'),
        back: txt(l, 'فيتامين K1 (Phytomenadione) بجرعة علاجية مستمرة لمدة 2–4 أسابيع مع متابعة زمن التجلط PT.', 'Vitamin K1 (Phytomenadione) given for 2–4 weeks with prothrombin time (PT) monitoring.')
      },
      {
        id: 'fc-para-1',
        subject: 'micro',
        subjectLabel: txt(l, 'الطفيليات والميكرو', 'Micro & Parasitology'),
        front: txt(l, 'كيف تنتقل الدودة القلبية (Dirofilaria immitis) في الكلاب؟', 'How is canine heartworm (Dirofilaria immitis) transmitted?'),
        back: txt(l, 'عن طريق لدغة البعوض الحامل للطور المعدي (L3)، ثم تهاجر وتنضج في الشرايين الرئوية والبطين الأيمن.', 'By infected mosquitoes transmitting L3 larvae, which mature in the pulmonary arteries and right heart chambers.')
      },
      {
        id: 'fc-micro-2',
        subject: 'micro',
        subjectLabel: txt(l, 'الطفيليات والميكرو', 'Micro & Parasitology'),
        front: txt(l, 'ما الفحص التشخيصي الأسرع لفيروس البارفو (Canine Parvovirus) في العيادة؟', 'What is the rapid in-clinic diagnostic test for Canine Parvovirus?'),
        back: txt(l, 'اختبار المستضد السريع من البراز (Fecal ELISA Antigen SNAP test) مع ملاحظة نقص كرات الدم البيضاء في CBC.', 'Fecal antigen ELISA (SNAP test), often supported by leukopenia/neutropenia on CBC.')
      },
      {
        id: 'fc-clin-1',
        subject: 'clinical',
        subjectLabel: txt(l, 'العيادة والطوارئ', 'Clinical & ER'),
        front: txt(l, 'أول خطوات التعامل مع حالة التواء المعدة وتمددها الحاد (GDV) في الكلاب الكبيرة؟', 'What are the immediate stabilization priorities in Gastric Dilatation-Volvulus (GDV)?'),
        back: txt(l, 'تعويض الصدمة بسوائل وريدية سريعة (Shock bolus) بالتوازي مع تفريغ الغازات (Trocarization أو أنبوب معدي) ثم التثبيت الجراحي (Gastropexy).', 'Aggressive IV shock fluid resuscitation plus gastric decompression (orogastric tube or trocarization) before surgical derotation & gastropexy.')
      },
      {
        id: 'fc-clin-2',
        subject: 'clinical',
        subjectLabel: txt(l, 'العيادة والطوارئ', 'Clinical & ER'),
        front: txt(l, 'كم معدل السوائل الوريدية اليومي الأساسي (Maintenance) التقريبي للكلاب والقطط؟', 'What is the approximate daily maintenance IV fluid rate for adult dogs and cats?'),
        back: txt(l, 'حوالي 40–60 مل/كجم/يوم (أو ≈ 2 مل/كجم/ساعة)، ويُضاف إليها نسبة الجفاف (% × الوزن × 10) وأي فاقد مستمر.', 'Roughly 40–60 mL/kg/day (~2 mL/kg/hr), plus dehydration deficit (% × kg × 10) and ongoing losses.')
      }
    ];
  }

  function recordFlashcardReview(progressMap, cardId, status, nowMs) {
    const next = Object.assign({}, progressMap || {});
    if (!cardId) return next;
    const prev = next[cardId] || { reviews: 0 };
    next[cardId] = {
      status: status === 'mastered' ? 'mastered' : 'review',
      reviews: (Number(prev.reviews) || 0) + 1,
      updatedAt: typeof nowMs === 'number' ? nowMs : Date.now()
    };
    return next;
  }

  function computeFlashcardStats(cards, progressMap) {
    const list = Array.isArray(cards) ? cards.filter(Boolean) : [];
    const prog = progressMap || {};
    let mastered = 0;
    let needsReview = 0;
    let unseen = 0;
    for (const c of list) {
      const st = prog[c.id] && prog[c.id].status;
      if (st === 'mastered') mastered++;
      else if (st === 'review') needsReview++;
      else unseen++;
    }
    const total = list.length;
    const percent = total ? Math.round((mastered / total) * 100) : 0;
    return { total, mastered, needsReview, unseen, percent };
  }

  function calculateGPA(entries, lang) {
    const l = lang === 'en' ? 'en' : 'ar';
    const list = Array.isArray(entries) ? entries : [];
    let totalCredits = 0;
    let totalPoints = 0;
    let validCount = 0;

    for (const item of list) {
      if (!item) continue;
      const credits = Number(item.credits);
      const points = Number(item.gradePoints);
      if (!Number.isFinite(credits) || credits <= 0) continue;
      if (!Number.isFinite(points) || points < 0 || points > 4) continue;
      totalCredits += credits;
      totalPoints += credits * points;
      validCount++;
    }

    const gpa = totalCredits > 0 ? Math.round((totalPoints / totalCredits) * 100) / 100 : 0;
    const percentage = totalCredits > 0 ? Math.round((gpa / 4) * 1000) / 10 : 0;

    let label = txt(l, 'أدخل المواد والساعات', 'Add courses & credits');
    if (totalCredits > 0) {
      if (gpa >= 3.5) label = txt(l, 'امتياز مع مرتبة الشرف', 'Excellent');
      else if (gpa >= 3.0) label = txt(l, 'جيد جدًا', 'Very Good');
      else if (gpa >= 2.4) label = txt(l, 'جيد', 'Good');
      else if (gpa >= 2.0) label = txt(l, 'مقبول', 'Pass');
      else label = txt(l, 'تحتاج لرفع المعدل', 'Needs improvement');
    }

    return {
      gpa,
      gpaText: gpa.toFixed(2),
      percentage,
      totalCredits,
      validCount,
      label
    };
  }

  function calculateFluidRate(opts) {
    const o = opts || {};
    const weightKg = Number(o.weightKg);
    const dehydrationPct = Math.max(0, Math.min(15, Number(o.dehydrationPct) || 0));
    const maintenanceMlKgDay = Number(o.maintenanceMlKgDay) > 0 ? Number(o.maintenanceMlKgDay) : 50;
    const ongoingLossMl = Math.max(0, Number(o.ongoingLossMl) || 0);
    const dropFactor = Number(o.dropFactor) === 60 ? 60 : 20;

    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      return { ok: false };
    }

    const maintenance24h = Math.round(weightKg * maintenanceMlKgDay);
    const deficit24h = Math.round(weightKg * dehydrationPct * 10);
    const total24h = Math.round(maintenance24h + deficit24h + ongoingLossMl);
    const mlPerHour = Math.round((total24h / 24) * 10) / 10;
    const dropsPerMin = Math.round(((mlPerHour * dropFactor) / 60) * 10) / 10;

    return {
      ok: true,
      weightKg,
      dehydrationPct,
      maintenance24h,
      deficit24h,
      ongoingLossMl: Math.round(ongoingLossMl),
      total24h,
      mlPerHour,
      dropsPerMin,
      dropFactor
    };
  }

  function computePlannerSummary(tasks, studyMap, goalMinutes, nowMs) {
    const list = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
    const doneTasks = list.filter((t) => Boolean(t.done)).length;
    const pendingTasks = list.length - doneTasks;
    const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
    const goal = Number(goalMinutes) >= 10 ? Math.round(Number(goalMinutes)) : 60;

    const map = studyMap || {};
    const todayStr = new Date(now).toDateString();
    const todayMinutes = Math.max(0, Number(map[todayStr] || 0));

    let weekMinutes = 0;
    for (let i = 0; i < 7; i++) {
      const ds = new Date(now - i * 86400000).toDateString();
      weekMinutes += Math.max(0, Number(map[ds] || 0));
    }

    const dailyPercent = Math.min(100, Math.round((todayMinutes / goal) * 100));
    return {
      totalTasks: list.length,
      doneTasks,
      pendingTasks,
      todayMinutes,
      weekMinutes,
      goalMinutes: goal,
      dailyPercent,
      goalMet: todayMinutes >= goal
    };
  }

  // Date-only deadlines use calendar days, not elapsed hours (DST-safe).
  function examDaysLeft(dateText, nowMs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText))) return null;
    const [y,m,d] = dateText.split('-').map(Number);
    const exam = new Date(y,m-1,d);
    if(exam.getFullYear()!==y || exam.getMonth()!==m-1 || exam.getDate()!==d) return null;
    const now = new Date(nowMs === undefined ? Date.now() : nowMs);
    return Math.round((Date.UTC(y,m-1,d)-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);
  }

  function searchStudyNotes(notes, query) {
    const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').trim();
    const q = normalize(query);
    return (Array.isArray(notes) ? notes : []).filter(n => n && (!q || normalize(n.title+' '+n.body).includes(q)));
  }

  function exportStudyNotes(notes) {
    return (Array.isArray(notes) ? notes : []).filter(Boolean).map(n => String(n.title||'')+'\n'+String(n.body||'')).join('\n\n--------------------\n\n');
  }

  function createFocusSession(minutes, nowMs, id) {
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120 || !Number.isFinite(nowMs)) throw new Error('Invalid focus duration');
    return { schema: 1, id: String(id || ('focus_' + nowMs)).slice(0,80), phase: 'running', durationMs: minutes * 60000, endAt: nowMs + minutes * 60000, remainingMs: minutes * 60000 };
  }
  function focusSnapshot(session, nowMs) {
    if (!session || session.schema !== 1 || typeof session.id !== 'string' || !['running','paused','completed'].includes(session.phase) || !Number.isInteger(session.durationMs) || session.durationMs < 300000 || session.durationMs > 7200000 || !Number.isFinite(nowMs)) return null;
    const out = { ...session };
    if (out.phase === 'running') {
      if (!Number.isFinite(out.endAt)) return null;
      out.remainingMs = Math.max(0, Math.min(out.durationMs, out.endAt - nowMs));
      if (out.remainingMs === 0) { out.phase = 'completed'; out.completedAt = out.endAt; }
    } else if (out.phase === 'completed') out.remainingMs = 0;
    else if (!Number.isFinite(out.remainingMs) || out.remainingMs < 0 || out.remainingMs > out.durationMs) return null;
    return out;
  }
  function transitionFocus(session, action, nowMs) {
    const out = focusSnapshot(session, nowMs);
    if (!out || out.phase === 'completed') return out;
    if (action === 'pause' && out.phase === 'running') out.phase = 'paused';
    else if (action === 'resume' && out.phase === 'paused') { out.phase = 'running'; out.endAt = nowMs + out.remainingMs; }
    return out;
  }
  function examCalendar(exams, nowMs) {
    const now = new Date(nowMs === undefined ? Date.now() : nowMs);
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid calendar time');
    const stamp = now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const escape = value => String(value || '').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
    const date = d => d.toISOString().slice(0,10).replace(/-/g,'');
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DrWael//Student Exams//EN','CALSCALE:GREGORIAN'];
    (Array.isArray(exams) ? exams : []).forEach((exam,index) => {
      if (!exam || examDaysLeft(exam.date,now.getTime()) === null || !String(exam.title || '').trim()) return;
      const [y,m,d] = exam.date.split('-').map(Number);
      const end = new Date(Date.UTC(y,m-1,d+1));
      const id = String(exam.id || index).replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,120);
      lines.push('BEGIN:VEVENT','UID:'+id+'@drwael.local','DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+exam.date.replace(/-/g,''),'DTEND;VALUE=DATE:'+date(end),'SUMMARY:'+escape(exam.title),'TRANSP:TRANSPARENT','END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const fold = line => {
      const parts=[];let current='',bytes=0;
      for(const ch of line) {
        const size=new TextEncoder().encode(ch).length;
        if(bytes+size>75){parts.push(current);current=' ';bytes=1;}
        current+=ch;bytes+=size;
      }
      parts.push(current);return parts.join('\r\n');
    };
    return lines.map(fold).join('\r\n')+'\r\n';
  }

  return {
    createFocusSession, focusSnapshot, transitionFocus, examCalendar,
    examDaysLeft,
    searchStudyNotes,
    exportStudyNotes,
    ONE_YEAR_MS,
    PRO_FREE_LAUNCH_MS,
    evaluateProAccess,
    hasCourseAccess,
    getProFeaturesList,
    getDefaultFlashcards,
    recordFlashcardReview,
    computeFlashcardStats,
    calculateGPA,
    calculateFluidRate,
    computePlannerSummary
  };
}));
