'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ca = require('../app/course-alerts.js');

test('buildCourseDetails uses explicit instructor, lecture count, and summary when present', () => {
  const detailsAr = ca.buildCourseDetails(
    {
      id: 'c1',
      title: 'تشريح بيطري',
      titleEn: 'Veterinary Anatomy',
      instructor: 'د. أحمد وائل',
      summary: 'شرح شامل لتشريح الحيوانات الأليفة مع تطبيقات عملية.'
    },
    [{ id: 'l1', title: 'المقدمة' }, { id: 'l2', title: 'الجهاز الهيكلي' }],
    [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    'ar'
  );
  assert.equal(detailsAr.instructor, 'د. أحمد وائل');
  assert.equal(detailsAr.lectureCount, 2);
  assert.equal(detailsAr.lectureCountText, 'محاضرتان');
  assert.equal(detailsAr.taskCount, 3);
  assert.equal(detailsAr.summary, 'شرح شامل لتشريح الحيوانات الأليفة مع تطبيقات عملية.');

  const detailsEn = ca.buildCourseDetails(
    {
      id: 'c1',
      title: 'تشريح بيطري',
      titleEn: 'Veterinary Anatomy',
      instructor: 'Dr. Wael',
      summaryEn: 'Comprehensive veterinary anatomy overview.'
    },
    [{ id: 'l1' }],
    [],
    'en'
  );
  assert.equal(detailsEn.instructor, 'Dr. Wael');
  assert.equal(detailsEn.lectureCountText, '1 Lecture');
  assert.equal(detailsEn.summary, 'Comprehensive veterinary anatomy overview.');
});

test('buildCourseDetails falls back gracefully when instructor/summary are missing', () => {
  const d = ca.buildCourseDetails(
    { id: 'c2', title: 'فسيولوجيا الحيوان' },
    [{ id: 'l1', title: 'وظائف الدم' }, { id: 'l2', title: 'الجهاز الدوري' }, { id: 'l3', title: 'التنفس' }],
    [{ id: 't1' }],
    'ar'
  );
  assert.ok(d.instructor.includes('د. وائل'));
  assert.equal(d.lectureCountText, '3 محاضرات');
  assert.ok(d.summary.includes('فسيولوجيا الحيوان'));
  assert.ok(d.summary.includes('وظائف الدم'));
});

test('getEnrolledCourses includes subscribed courses and free curriculum courses only', () => {
  const courses = [
    { id: 'free1', price: 0, year: 1, term: 1 },
    { id: 'paidSub', price: 200, year: 1, term: 1 },
    { id: 'paidUnsub', price: 200, year: 1, term: 1 },
    { id: 'otherYearFree', price: 0, year: 2, term: 1 },
    { id: 'extraSub', price: 150, year: 2, term: 2 }
  ];
  const subs = { paidSub: 1, extraSub: 1 };
  const profile = { year: 1, term: 1, extra: [], role: 'student' };
  const enrolled = ca.getEnrolledCourses(courses, subs, profile).map((c) => c.id);
  assert.deepEqual(enrolled, ['free1', 'paidSub', 'extraSub']);
});

test('parseDeadlineMs handles numbers, seconds, ISO strings, and Firestore timestamps', () => {
  assert.equal(ca.parseDeadlineMs(1700000000), 1700000000000);
  assert.equal(ca.parseDeadlineMs(1700000000000), 1700000000000);
  assert.equal(ca.parseDeadlineMs({ toMillis: () => 1710000000000 }), 1710000000000);
  assert.equal(ca.parseDeadlineMs({ seconds: 1710000000 }), 1710000000000);
  assert.equal(ca.parseDeadlineMs('2026-05-01T12:00:00Z'), Date.parse('2026-05-01T12:00:00Z'));
  assert.equal(ca.parseDeadlineMs('invalid'), null);
});

test('findApproachingTaskAlerts emits 24h and 1h alerts once and skips completed or overdue tasks', () => {
  const now = 1_700_000_000_000;
  const tasks = [
    { id: 't_done', courseId: 'c1', title: 'Completed', dueAt: now + 30 * 60000 },
    { id: 't_overdue', courseId: 'c1', title: 'Overdue', dueAt: now - 10000 },
    { id: 't_far', courseId: 'c1', title: 'Far', dueAt: now + 48 * 3600000 },
    { id: 't_soon', courseId: 'c1', title: 'Quiz 1', dueAt: now + 5 * 3600000 },
    { id: 't_urgent', courseId: 'c1', title: 'Final Lab', deadline: now + 20 * 60000 }
  ];
  const progressMap = { t_done: { done: true } };
  const coursesById = { c1: { id: 'c1', title: 'التشريح', titleEn: 'Anatomy' } };

  const res1 = ca.findApproachingTaskAlerts({
    tasks,
    progressMap,
    coursesById,
    sentKeys: {},
    now,
    lang: 'ar'
  });

  assert.equal(res1.alerts.length, 2);
  assert.equal(res1.alerts[0].taskId, 't_soon');
  assert.equal(res1.alerts[0].stage, '24h');
  assert.ok(res1.alerts[0].body.includes('Quiz 1'));
  assert.equal(res1.alerts[1].taskId, 't_urgent');
  assert.equal(res1.alerts[1].stage, '1h');

  // Re-running at same timestamp must NOT duplicate
  const res2 = ca.findApproachingTaskAlerts({
    tasks,
    progressMap,
    coursesById,
    sentKeys: res1.sentKeys,
    now: now + 60000,
    lang: 'ar'
  });
  assert.equal(res2.alerts.length, 0);

  // Moving t_soon to < 1h remaining fires 1h urgent alert once
  const res3 = ca.findApproachingTaskAlerts({
    tasks,
    progressMap,
    coursesById,
    sentKeys: res2.sentKeys,
    now: now + 4.5 * 3600000,
    lang: 'ar'
  });
  assert.equal(res3.alerts.length, 1);
  assert.equal(res3.alerts[0].taskId, 't_soon');
  assert.equal(res3.alerts[0].stage, '1h');
});

test('detectNewLectures seeds baseline silently and alerts only on newly added lectures', () => {
  const course = { id: 'c1', title: 'طب الباطنة', titleEn: 'Internal Medicine' };
  const initialLectures = [
    { id: 'l1', title: 'المحاضرة الأولى' },
    { id: 'l2', title: 'المحاضرة الثانية' }
  ];
  const now = 1_700_000_000_000;

  // Initial seed: no alerts
  const r1 = ca.detectNewLectures({
    course,
    lectures: initialLectures,
    seenByCourse: {},
    sentKeys: {},
    now,
    lang: 'ar'
  });
  assert.equal(r1.alerts.length, 0);
  assert.deepEqual(r1.seenByCourse.c1.ids, ['l1', 'l2']);

  // New lecture added later: triggers 1 alert
  const r2 = ca.detectNewLectures({
    course,
    lectures: [...initialLectures, { id: 'l3', title: 'أمراض الجهاز التنفسي' }],
    seenByCourse: r1.seenByCourse,
    sentKeys: r1.sentKeys,
    now: now + 60000,
    lang: 'ar'
  });
  assert.equal(r2.alerts.length, 1);
  assert.equal(r2.alerts[0].kind, 'lecture');
  assert.equal(r2.alerts[0].lectureId, 'l3');
  assert.ok(r2.alerts[0].body.includes('أمراض الجهاز التنفسي'));
  assert.ok(r2.alerts[0].body.includes('طب الباطنة'));

  // Subsequent check with same lectures triggers 0 alerts
  const r3 = ca.detectNewLectures({
    course,
    lectures: [...initialLectures, { id: 'l3', title: 'أمراض الجهاز التنفسي' }],
    seenByCourse: r2.seenByCourse,
    sentKeys: r2.sentKeys,
    now: now + 120000,
    lang: 'ar'
  });
  assert.equal(r3.alerts.length, 0);
});
