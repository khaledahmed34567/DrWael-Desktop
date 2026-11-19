(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DWCourseAlerts = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function txt(lang, ar, en) {
    return lang === 'en' ? en : ar;
  }

  function formatLectureCount(count, lang) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
      return lang === 'en' ? 'Updated on open' : 'يُعرض عند الفتح';
    }
    if (lang === 'en') {
      return count === 1 ? '1 Lecture' : count + ' Lectures';
    }
    if (count === 0) return '0 محاضرات';
    if (count === 1) return 'محاضرة واحدة';
    if (count === 2) return 'محاضرتان';
    if (count <= 10) return count + ' محاضرات';
    return count + ' محاضرة';
  }

  function formatTaskCount(count, lang) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return '';
    if (lang === 'en') return count === 1 ? '1 Task' : count + ' Tasks';
    if (count === 0) return '0 مهام';
    if (count === 1) return 'مهمة واحدة';
    if (count === 2) return 'مهمتان';
    if (count <= 10) return count + ' مهام';
    return count + ' مهمة';
  }

  function buildCourseDetails(course, lectures, tasks, lang, cachedLectureCount) {
    const c = course || {};
    const l = lang === 'en' ? 'en' : 'ar';
    const title = l === 'en' ? (c.titleEn || c.title || 'Course') : (c.title || c.titleEn || 'الدورة');
    const rawInstructor = l === 'en'
      ? (c.instructorEn || c.instructor || c.lecturerEn || c.lecturer || c.doctor || c.teacher)
      : (c.instructorAr || c.instructor || c.lecturerAr || c.lecturer || c.doctor || c.teacher);
    const instructor = String(rawInstructor || '').trim() || txt(l, 'د. وائل · فريق التدريس', 'Dr. Wael · Teaching Team');

    let lectureCount = null;
    if (Array.isArray(lectures)) lectureCount = lectures.length;
    else if (typeof cachedLectureCount === 'number' && Number.isFinite(cachedLectureCount)) lectureCount = cachedLectureCount;
    else if (typeof c.lectureCount === 'number' && Number.isFinite(c.lectureCount)) lectureCount = c.lectureCount;
    else if (typeof c.lecturesCount === 'number' && Number.isFinite(c.lecturesCount)) lectureCount = c.lecturesCount;

    let taskCount = null;
    if (Array.isArray(tasks)) taskCount = tasks.length;
    else if (typeof c.taskCount === 'number' && Number.isFinite(c.taskCount)) taskCount = c.taskCount;

    const rawSummary = l === 'en'
      ? (c.summaryEn || c.summary || c.descEn || c.desc || c.description)
      : (c.summaryAr || c.summary || c.descAr || c.desc || c.description);

    let summary = String(rawSummary || '').trim();
    if (!summary) {
      const lecTitles = Array.isArray(lectures)
        ? lectures.map((x) => (l === 'en' ? (x.titleEn || x.title) : (x.title || x.titleEn))).filter(Boolean)
        : [];
      if (lecTitles.length > 0) {
        const preview = lecTitles.slice(0, 3).join(l === 'en' ? ', ' : '، ');
        const more = lecTitles.length > 3 ? (l === 'en' ? ' and more.' : ' والمزيد.') : '.';
        summary = l === 'en'
          ? `Course "${title}" covers structured lessons and tasks across ${formatLectureCount(lecTitles.length, 'en')}, including: ${preview}${more}`
          : `تتناول دورة «${title}» شرحًا منظمًا ومهام تطبيقية عبر ${formatLectureCount(lecTitles.length, 'ar')}، وتشمل: ${preview}${more}`;
      } else {
        summary = l === 'en'
          ? `Structured veterinary curriculum for "${title}" with organized lectures, study materials, and interactive progress tracking.`
          : `محتوى تعليمي متكامل لدورة «${title}» لطلاب الطب البيطري يشمل محاضرات مرتبة ومهام تدريبية لمتابعة تقدمك.`;
      }
    }

    return {
      title,
      instructor,
      lectureCount,
      lectureCountText: formatLectureCount(lectureCount, l),
      taskCount,
      taskCountText: formatTaskCount(taskCount, l),
      summary
    };
  }

  function getEnrolledCourses(courses, subsMap, profile) {
    if (!Array.isArray(courses)) return [];
    const subs = subsMap || {};
    const p = profile || {};
    const extras = Array.isArray(p.extra) ? p.extra : [];
    const inCurriculum = (c) => (c.year === p.year && c.term === p.term) || extras.includes(c.id);
    return courses.filter((c) => {
      if (!c || !c.id) return false;
      if (subs[c.id]) return true;
      if (p.role === 'admin' && inCurriculum(c)) return true;
      if (!(Number(c.price) > 0) && inCurriculum(c)) return true;
      return false;
    });
  }

  function parseDeadlineMs(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') {
      if (!Number.isFinite(val) || val <= 0) return null;
      return val < 1e12 ? val * 1000 : val;
    }
    if (typeof val === 'object') {
      if (typeof val.toMillis === 'function') {
        const ms = val.toMillis();
        return Number.isFinite(ms) && ms > 0 ? ms : null;
      }
      if (typeof val.seconds === 'number' && Number.isFinite(val.seconds)) {
        return val.seconds * 1000;
      }
    }
    if (typeof val === 'string') {
      const s = val.trim();
      if (!s) return null;
      if (/^\d+$/.test(s)) return parseDeadlineMs(Number(s));
      const ms = Date.parse(s);
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    }
    return null;
  }

  function formatTimeRemaining(ms, lang) {
    const mins = Math.max(1, Math.round(ms / 60000));
    if (mins < 60) {
      return lang === 'en' ? `${mins} min` : (mins === 1 ? 'دقيقة واحدة' : mins <= 10 ? `${mins} دقائق` : `${mins} دقيقة`);
    }
    const hrs = Math.round(mins / 60);
    if (hrs < 24) {
      return lang === 'en' ? `${hrs} hr` : (hrs === 1 ? 'ساعة واحدة' : hrs === 2 ? 'ساعتان' : hrs <= 10 ? `${hrs} ساعات` : `${hrs} ساعة`);
    }
    const days = Math.round(hrs / 24);
    return lang === 'en' ? `${days} d` : (days === 1 ? 'يوم واحد' : days === 2 ? 'يومان' : `${days} أيام`);
  }

  const DEFAULT_WINDOWS = [
    { key: '1h', maxMs: 3600000 },
    { key: '24h', maxMs: 86400000 }
  ];

  function findApproachingTaskAlerts(opts) {
    const o = opts || {};
    const tasks = Array.isArray(o.tasks) ? o.tasks : [];
    const progressMap = o.progressMap || {};
    const coursesById = o.coursesById || {};
    const sentKeys = { ...(o.sentKeys || {}) };
    const now = typeof o.now === 'number' ? o.now : Date.now();
    const l = o.lang === 'en' ? 'en' : 'ar';
    const windows = (Array.isArray(o.windows) && o.windows.length ? o.windows : DEFAULT_WINDOWS)
      .slice()
      .sort((a, b) => a.maxMs - b.maxMs);

    const alerts = [];
    for (const k of tasks) {
      if (!k || !k.id) continue;
      if (progressMap[k.id] && progressMap[k.id].done) continue;
      const dueMs = parseDeadlineMs(k.dueAt ?? k.deadline ?? k.dueDate ?? k.due);
      if (!dueMs || dueMs <= now) continue;
      const rem = dueMs - now;
      const matched = windows.find((w) => rem <= w.maxMs);
      if (!matched) continue;

      const dedupeKey = `due:${k.id}:${matched.key}:${dueMs}`;
      if (sentKeys[dedupeKey]) continue;

      for (const w of windows) {
        if (w.maxMs >= matched.maxMs) {
          sentKeys[`due:${k.id}:${w.key}:${dueMs}`] = now;
        }
      }

      const course = coursesById[k.courseId] || {};
      const courseName = l === 'en' ? (course.titleEn || course.title || '') : (course.title || course.titleEn || '');
      const taskTitle = l === 'en' ? (k.titleEn || k.title || 'Task') : (k.title || k.titleEn || 'مهمة');
      const remTxt = formatTimeRemaining(rem, l);

      const title = matched.key === '1h'
        ? txt(l, 'تنبيه عاجل: موعد تسليم قريب', 'Urgent: Task deadline very soon')
        : txt(l, 'اقتراب موعد تسليم مهمة', 'Task deadline approaching');
      const body = courseName
        ? txt(
            l,
            `باقي ${remTxt} على موعد تسليم «${taskTitle}» في دورة «${courseName}».`,
            `${remTxt} left until "${taskTitle}" is due in "${courseName}".`
          )
        : txt(
            l,
            `باقي ${remTxt} على موعد تسليم «${taskTitle}».`,
            `${remTxt} left until "${taskTitle}" is due.`
          );

      alerts.push({
        id: dedupeKey,
        kind: 'due',
        stage: matched.key,
        title,
        body,
        courseId: k.courseId || '',
        taskId: k.id,
        dueAt: dueMs,
        at: now,
        read: false
      });
    }

    return { alerts, sentKeys };
  }

  function findApproachingReminderAlerts(opts) {
    const o = opts || {};
    const reminders = Array.isArray(o.reminders) ? o.reminders : [];
    const sentKeys = { ...(o.sentKeys || {}) };
    const now = typeof o.now === 'number' ? o.now : Date.now();
    const l = o.lang === 'en' ? 'en' : 'ar';
    const windows = (Array.isArray(o.windows) && o.windows.length ? o.windows : DEFAULT_WINDOWS)
      .slice()
      .sort((a, b) => a.maxMs - b.maxMs);

    const alerts = [];
    for (const r of reminders) {
      if (!r || !r.id || r.done) continue;
      const dueMs = parseDeadlineMs(r.at);
      if (!dueMs || dueMs <= now) continue;
      const rem = dueMs - now;
      const matched = windows.find((w) => rem <= w.maxMs);
      if (!matched) continue;

      const dedupeKey = `rem_due:${r.id}:${matched.key}:${dueMs}`;
      if (sentKeys[dedupeKey]) continue;

      for (const w of windows) {
        if (w.maxMs >= matched.maxMs) {
          sentKeys[`rem_due:${r.id}:${w.key}:${dueMs}`] = now;
        }
      }

      const remTxt = formatTimeRemaining(rem, l);
      const title = matched.key === '1h'
        ? txt(l, 'اقترب الموعد المحدد (أقل من ساعة)', 'Upcoming deadline (under 1 hr)')
        : txt(l, 'تذكير بموعد تسليم قريب', 'Upcoming task deadline');
      const body = r.courseTitle
        ? txt(l, `باقي ${remTxt} على «${r.title}» (${r.courseTitle}).`, `${remTxt} left for "${r.title}" (${r.courseTitle}).`)
        : txt(l, `باقي ${remTxt} على «${r.title}».`, `${remTxt} left for "${r.title}".`);

      alerts.push({
        id: dedupeKey,
        kind: 'due',
        stage: matched.key,
        title,
        body,
        courseId: r.courseId || '',
        taskId: r.taskId || '',
        dueAt: dueMs,
        at: now,
        read: false
      });
    }

    return { alerts, sentKeys };
  }

  function detectNewLectures(opts) {
    const o = opts || {};
    const course = o.course || {};
    const lectures = Array.isArray(o.lectures) ? o.lectures : [];
    const seenByCourse = { ...(o.seenByCourse || {}) };
    const sentKeys = { ...(o.sentKeys || {}) };
    const now = typeof o.now === 'number' ? o.now : Date.now();
    const l = o.lang === 'en' ? 'en' : 'ar';

    if (!course.id) return { alerts: [], seenByCourse, sentKeys };

    const currentIds = lectures.map((x) => String(x.id)).filter(Boolean);
    const prev = seenByCourse[course.id];

    // First time we observe this course for the user: seed baseline silently
    if (!prev || !Array.isArray(prev.ids)) {
      seenByCourse[course.id] = { ids: [...new Set(currentIds)], seededAt: now };
      return { alerts: [], seenByCourse, sentKeys };
    }

    const prevSet = new Set(prev.ids.map(String));
    const alerts = [];
    const courseName = l === 'en' ? (course.titleEn || course.title || 'Course') : (course.title || course.titleEn || 'الدورة');

    for (const lec of lectures) {
      if (!lec || !lec.id) continue;
      const lid = String(lec.id);
      if (prevSet.has(lid)) continue;
      prevSet.add(lid);

      const dedupeKey = `lec:${course.id}:${lid}`;
      if (sentKeys[dedupeKey]) continue;
      sentKeys[dedupeKey] = now;

      const lecTitle = l === 'en' ? (lec.titleEn || lec.title || 'New lecture') : (lec.title || lec.titleEn || 'محاضرة جديدة');
      alerts.push({
        id: dedupeKey,
        kind: 'lecture',
        title: txt(l, 'محاضرة جديدة متاحة', 'New lecture available'),
        body: txt(
          l,
          `توفرت محاضرة جديدة «${lecTitle}» في دورة «${courseName}».`,
          `A new lecture "${lecTitle}" is now available in "${courseName}".`
        ),
        courseId: course.id,
        lectureId: lid,
        at: now,
        read: false
      });
    }

    seenByCourse[course.id] = {
      ids: [...prevSet],
      seededAt: prev.seededAt || now
    };

    return { alerts, seenByCourse, sentKeys };
  }

  return {
    buildCourseDetails,
    formatLectureCount,
    formatTaskCount,
    getEnrolledCourses,
    parseDeadlineMs,
    formatTimeRemaining,
    findApproachingTaskAlerts,
    findApproachingReminderAlerts,
    detectNewLectures
  };
}));
