(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DWStudentBadges = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function txt(lang, ar, en) {
    return lang === 'en' ? en : ar;
  }

  function computeStreakDays(daysMap, nowMs) {
    const map = daysMap && typeof daysMap === 'object' ? daysMap : {};
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    let streak = 0;
    for (let i = 0; i < 400; i++) {
      const d = new Date(now - i * 86400000).toDateString();
      if (Number(map[d]) > 0) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  }

  function computeStudyMinutes(studyMap) {
    const map = studyMap && typeof studyMap === 'object' ? studyMap : {};
    let total = 0;
    for (const k of Object.keys(map)) {
      const v = Number(map[k]);
      if (Number.isFinite(v) && v > 0) total += v;
    }
    return Math.round(total);
  }

  function getMilestoneDefinitions(lang) {
    const l = lang === 'en' ? 'en' : 'ar';
    return [
      {
        id: 'first-step',
        kind: 'milestone',
        tier: 'bronze',
        icon: 'spark',
        metric: 'totalDoneTasks',
        target: 1,
        unitAr: 'مهمة',
        unitEn: 'task',
        title: txt(l, 'الخطوة الأولى', 'First Step'),
        desc: txt(l, 'أتمم أول مهمة تعليمية لك على المنصة', 'Complete your first learning task on the platform')
      },
      {
        id: 'dedicated-10',
        kind: 'milestone',
        tier: 'silver',
        icon: 'award',
        metric: 'totalDoneTasks',
        target: 10,
        unitAr: 'مهام',
        unitEn: 'tasks',
        title: txt(l, 'متعلم مثابر', 'Dedicated Learner'),
        desc: txt(l, 'أتمم 10 مهام تعليمية بنجاح', 'Complete 10 learning tasks successfully')
      },
      {
        id: 'scholar-25',
        kind: 'milestone',
        tier: 'gold',
        icon: 'trophy',
        metric: 'totalDoneTasks',
        target: 25,
        unitAr: 'مهام',
        unitEn: 'tasks',
        title: txt(l, 'باحث متميز', 'Master Scholar'),
        desc: txt(l, 'أتمم 25 مهمة تعليمية عبر دوراتك', 'Complete 25 learning tasks across your courses')
      },
      {
        id: 'course-1',
        kind: 'milestone',
        tier: 'gold',
        icon: 'medal',
        metric: 'completedCoursesCount',
        target: 1,
        unitAr: 'دورة',
        unitEn: 'course',
        title: txt(l, 'خريج أول دورة', 'Course Finisher'),
        desc: txt(l, 'أكمل 100% من مهام دورة كاملة', 'Complete 100% of tasks in one full course')
      },
      {
        id: 'courses-3',
        kind: 'milestone',
        tier: 'platinum',
        icon: 'trophy',
        metric: 'completedCoursesCount',
        target: 3,
        unitAr: 'دورات',
        unitEn: 'courses',
        title: txt(l, 'بطل المنهج', 'Curriculum Champion'),
        desc: txt(l, 'أكمل 3 دورات دراسية بنسبة 100%', 'Complete 3 full courses at 100%')
      },
      {
        id: 'streak-3',
        kind: 'milestone',
        tier: 'bronze',
        icon: 'spark',
        metric: 'streakDays',
        target: 3,
        unitAr: 'أيام',
        unitEn: 'days',
        title: txt(l, 'انطلاقة منتظمة', '3-Day Streak'),
        desc: txt(l, 'حافظ على نشاطك الدراسي 3 أيام متتالية', 'Keep your study activity for 3 consecutive days')
      },
      {
        id: 'streak-7',
        kind: 'milestone',
        tier: 'gold',
        icon: 'award',
        metric: 'streakDays',
        target: 7,
        unitAr: 'أيام',
        unitEn: 'days',
        title: txt(l, 'أسبوع التزام', '7-Day Streak'),
        desc: txt(l, 'واصل التعلم لمدة 7 أيام متتالية', 'Keep learning for 7 consecutive days')
      },
      {
        id: 'study-60',
        kind: 'milestone',
        tier: 'silver',
        icon: 'clock',
        metric: 'studyMinutes',
        target: 60,
        unitAr: 'دقيقة',
        unitEn: 'min',
        title: txt(l, 'ساعة تركيز', 'Focused Hour'),
        desc: txt(l, 'أكمل 60 دقيقة مذاكرة بمؤقت البومودورو', 'Log 60 minutes with the Pomodoro study timer')
      },
      {
        id: 'reviewer-1',
        kind: 'milestone',
        tier: 'silver',
        icon: 'star',
        metric: 'reviewCount',
        target: 1,
        unitAr: 'مراجعة',
        unitEn: 'review',
        title: txt(l, 'صوت الطالب', 'Course Reviewer'),
        desc: txt(l, 'قيّم دورة أتممتها واكتب مراجعتك الأولى', 'Rate a completed course and submit your first review')
      }
    ];
  }

  function resolveCourseDoneCount(course, doneByCourse, validTaskIdsByCourse) {
    const cid = course && course.id;
    if (!cid) return 0;
    const rawSet = doneByCourse && doneByCourse[cid];
    if (!rawSet) return 0;
    const list = Array.isArray(rawSet) ? rawSet : Array.from(rawSet);
    const validIds = validTaskIdsByCourse && validTaskIdsByCourse[cid];
    if (validIds) {
      const validSet = validIds instanceof Set ? validIds : new Set(validIds);
      let count = 0;
      const seen = new Set();
      for (const id of list) {
        if (validSet.has(id) && !seen.has(id)) {
          seen.add(id);
          count++;
        }
      }
      return count;
    }
    return new Set(list).size;
  }

  function evaluateStudentBadges(input) {
    const cfg = input || {};
    const lang = cfg.lang === 'en' ? 'en' : 'ar';
    const courses = Array.isArray(cfg.courses) ? cfg.courses.filter((c) => c && c.id) : [];
    const doneByCourse = cfg.doneByCourse || {};
    const validIdsByCourse = cfg.validTaskIdsByCourse || {};
    const totalTasksByCourse = cfg.totalTasksByCourse || {};
    const unlockedMap = cfg.unlockedMap && typeof cfg.unlockedMap === 'object' ? cfg.unlockedMap : {};

    const courseProgressList = [];
    let completedCoursesCount = 0;
    let derivedDoneTasks = 0;

    for (const c of courses) {
      const rawTotal = totalTasksByCourse[c.id] !== undefined ? totalTasksByCourse[c.id] : c.taskCount;
      const total = Math.max(0, Number(rawTotal) || 0);
      const rawDone = resolveCourseDoneCount(c, doneByCourse, validIdsByCourse);
      const done = total > 0 ? Math.min(rawDone, total) : rawDone;
      derivedDoneTasks += rawDone;
      const completed = total > 0 && done >= total;
      if (completed) completedCoursesCount++;
      const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
      courseProgressList.push({
        course: c,
        done,
        total,
        completed,
        percent
      });
    }

    const totalDoneTasks = Math.max(Number(cfg.totalDoneTasks) || 0, derivedDoneTasks);
    const streakDays = Number.isFinite(Number(cfg.streakDays))
      ? Math.max(0, Number(cfg.streakDays))
      : computeStreakDays(cfg.daysMap, cfg.now);
    const studyMinutes = Number.isFinite(Number(cfg.studyMinutes))
      ? Math.max(0, Number(cfg.studyMinutes))
      : computeStudyMinutes(cfg.studyMap);
    const reviewCount = Math.max(0, Number(cfg.reviewCount) || 0);

    const metrics = {
      totalDoneTasks,
      completedCoursesCount,
      streakDays,
      studyMinutes,
      reviewCount
    };

    const milestones = getMilestoneDefinitions(lang).map((def) => {
      const current = metrics[def.metric] || 0;
      const earned = current >= def.target;
      const progressPercent = def.target > 0 ? Math.min(100, Math.round((current / def.target) * 100)) : 0;
      const clampedCurrent = Math.min(current, def.target);
      const unit = lang === 'en' ? def.unitEn : def.unitAr;
      return {
        id: def.id,
        kind: 'milestone',
        tier: def.tier,
        icon: def.icon,
        title: def.title,
        desc: def.desc,
        earned,
        unlockedAt: earned ? (Number(unlockedMap[def.id]) || null) : null,
        current: clampedCurrent,
        actualCurrent: current,
        target: def.target,
        progressPercent,
        progressText: `${clampedCurrent} / ${def.target} ${unit}`
      };
    });

    const courseBadges = courseProgressList.map((cp) => {
      const c = cp.course;
      const id = 'course:' + c.id;
      const cTitle = lang === 'en' ? (c.titleEn || c.title || c.id) : (c.title || c.titleEn || c.id);
      const customTitle = lang === 'en' ? (c.badgeTitleEn || c.badgeTitle) : (c.badgeTitle || c.badgeTitleEn);
      const title = customTitle || txt(lang, `إتقان ${cTitle}`, `${cTitle} Mastery`);
      const desc = cp.total > 0
        ? txt(lang, `أكمل جميع مهام دورة ${cTitle} (${cp.total} مهمة)`, `Complete all ${cp.total} tasks in ${cTitle}`)
        : txt(lang, `أكمل جميع مهام دورة ${cTitle}`, `Complete all tasks in ${cTitle}`);
      const unit = lang === 'en' ? 'tasks' : 'مهام';
      return {
        id,
        kind: 'course',
        courseId: c.id,
        courseTitle: cTitle,
        tier: 'gold',
        icon: 'medal',
        title,
        desc,
        earned: cp.completed,
        unlockedAt: cp.completed ? (Number(unlockedMap[id]) || null) : null,
        current: cp.done,
        actualCurrent: cp.done,
        target: cp.total,
        progressPercent: cp.percent,
        progressText: cp.total > 0 ? `${cp.done} / ${cp.total} ${unit}` : txt(lang, 'قريبًا', 'Pending tasks')
      };
    });

    const allBadges = [...courseBadges, ...milestones];
    allBadges.sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? -1 : 1;
      if (a.earned && b.earned) {
        const ta = a.unlockedAt || 0;
        const tb = b.unlockedAt || 0;
        if (ta !== tb) return tb - ta;
      }
      if (a.progressPercent !== b.progressPercent) return b.progressPercent - a.progressPercent;
      if (a.kind !== b.kind) return a.kind === 'course' ? -1 : 1;
      return String(a.id).localeCompare(String(b.id));
    });

    const earnedCount = allBadges.filter((b) => b.earned).length;
    const totalCount = allBadges.length;
    const completionPercent = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

    return {
      badges: allBadges,
      earnedCount,
      totalCount,
      completionPercent,
      metrics
    };
  }

  function filterBadges(badges, filter) {
    const list = Array.isArray(badges) ? badges : [];
    const f = String(filter || 'all');
    if (f === 'earned') return list.filter((b) => b && b.earned);
    if (f === 'locked' || f === 'progress') return list.filter((b) => b && !b.earned);
    if (f === 'course') return list.filter((b) => b && b.kind === 'course');
    if (f === 'milestone') return list.filter((b) => b && b.kind === 'milestone');
    return list.filter(Boolean);
  }

  function detectNewlyUnlockedBadges(badges, previousUnlockedMap, nowMs) {
    const list = Array.isArray(badges) ? badges : [];
    const prev = previousUnlockedMap && typeof previousUnlockedMap === 'object' ? { ...previousUnlockedMap } : {};
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    const newlyUnlocked = [];
    const nextUnlockedMap = { ...prev };

    for (const b of list) {
      if (!b || !b.id) continue;
      if (b.earned) {
        if (!nextUnlockedMap[b.id]) {
          nextUnlockedMap[b.id] = now;
          newlyUnlocked.push({ ...b, unlockedAt: now });
        }
      }
    }

    return {
      newlyUnlocked,
      nextUnlockedMap
    };
  }

  return {
    computeStreakDays,
    computeStudyMinutes,
    getMilestoneDefinitions,
    evaluateStudentBadges,
    filterBadges,
    detectNewlyUnlockedBadges
  };
}));
