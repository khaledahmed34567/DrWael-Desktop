'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sb = require('../app/student-badges.js');

test('evaluateStudentBadges awards course-specific badge only when 100% of non-empty tasks are completed', () => {
  const courses = [
    { id: 'anat', title: 'التشريح البيطري', titleEn: 'Veterinary Anatomy', taskCount: 2 },
    { id: 'phys', title: 'الفسيولوجي', titleEn: 'Physiology', taskCount: 3 },
    { id: 'empty', title: 'مقرر تمهيدي', titleEn: 'Intro Course', taskCount: 0 }
  ];

  const evalRes = sb.evaluateStudentBadges({
    lang: 'en',
    courses,
    totalDoneTasks: 3,
    totalTasksByCourse: { anat: 2, phys: 3, empty: 0 },
    validTaskIdsByCourse: {
      anat: new Set(['t1', 't2']),
      phys: new Set(['p1', 'p2', 'p3'])
    },
    doneByCourse: {
      anat: new Set(['t1', 't2']),
      phys: new Set(['p1'])
    },
    unlockedMap: { 'course:anat': 1700000000000 }
  });

  const anatBadge = evalRes.badges.find((b) => b.id === 'course:anat');
  const physBadge = evalRes.badges.find((b) => b.id === 'course:phys');
  const emptyBadge = evalRes.badges.find((b) => b.id === 'course:empty');

  assert.equal(anatBadge.earned, true);
  assert.equal(anatBadge.progressPercent, 100);
  assert.equal(anatBadge.unlockedAt, 1700000000000);
  assert.equal(anatBadge.title, 'Veterinary Anatomy Mastery');

  assert.equal(physBadge.earned, false);
  assert.equal(physBadge.current, 1);
  assert.equal(physBadge.target, 3);
  assert.equal(physBadge.progressPercent, 33);

  assert.equal(emptyBadge.earned, false);
  assert.equal(emptyBadge.progressPercent, 0);

  // Course finisher milestone should also unlock because 1 course is 100% done
  const finisher = evalRes.badges.find((b) => b.id === 'course-1');
  assert.equal(finisher.earned, true);
  assert.equal(evalRes.metrics.completedCoursesCount, 1);
});

test('evaluateStudentBadges unlocks learning milestones for tasks, streak, study minutes, and reviews', () => {
  const now = new Date('2026-05-10T12:00:00Z').getTime();
  const daysMap = {
    [new Date(now).toDateString()]: 2,
    [new Date(now - 86400000).toDateString()]: 1,
    [new Date(now - 2 * 86400000).toDateString()]: 3
  };

  const res = sb.evaluateStudentBadges({
    lang: 'ar',
    courses: [],
    totalDoneTasks: 12,
    daysMap,
    now,
    studyMap: {
      'Sun May 10 2026': 40,
      'Sat May 09 2026': 25
    },
    reviewCount: 1
  });

  assert.equal(res.metrics.streakDays, 3);
  assert.equal(res.metrics.studyMinutes, 65);
  assert.equal(res.badges.find((b) => b.id === 'first-step').earned, true);
  assert.equal(res.badges.find((b) => b.id === 'dedicated-10').earned, true);
  assert.equal(res.badges.find((b) => b.id === 'scholar-25').earned, false);
  assert.equal(res.badges.find((b) => b.id === 'streak-3').earned, true);
  assert.equal(res.badges.find((b) => b.id === 'streak-7').earned, false);
  assert.equal(res.badges.find((b) => b.id === 'study-60').earned, true);
  assert.equal(res.badges.find((b) => b.id === 'reviewer-1').earned, true);
});

test('computeStreakDays allows today to be zero if yesterday started an active streak', () => {
  const now = new Date('2026-05-10T12:00:00Z').getTime();
  const daysMap = {
    [new Date(now - 1 * 86400000).toDateString()]: 1,
    [new Date(now - 2 * 86400000).toDateString()]: 2,
    [new Date(now - 3 * 86400000).toDateString()]: 1
  };
  assert.equal(sb.computeStreakDays(daysMap, now), 3);
});

test('filterBadges and detectNewlyUnlockedBadges filter accurately and deduplicate persisted unlocks', () => {
  const res = sb.evaluateStudentBadges({
    lang: 'en',
    courses: [{ id: 'c1', titleEn: 'Pharmacology', taskCount: 2 }],
    totalDoneTasks: 2,
    totalTasksByCourse: { c1: 2 },
    doneByCourse: { c1: new Set(['k1', 'k2']) }
  });

  const earned = sb.filterBadges(res.badges, 'earned');
  const locked = sb.filterBadges(res.badges, 'progress');
  const coursesOnly = sb.filterBadges(res.badges, 'course');

  assert.ok(earned.length >= 2);
  assert.ok(earned.every((b) => b.earned));
  assert.ok(locked.every((b) => !b.earned));
  assert.equal(coursesOnly.length, 1);

  const firstDetect = sb.detectNewlyUnlockedBadges(res.badges, { 'first-step': 1000 }, 5000);
  assert.equal(firstDetect.nextUnlockedMap['first-step'], 1000);
  assert.equal(firstDetect.newlyUnlocked.some((b) => b.id === 'first-step'), false);
  assert.equal(firstDetect.newlyUnlocked.some((b) => b.id === 'course:c1'), true);
  assert.equal(firstDetect.nextUnlockedMap['course:c1'], 5000);

  const secondDetect = sb.detectNewlyUnlockedBadges(res.badges, firstDetect.nextUnlockedMap, 9000);
  assert.equal(secondDetect.newlyUnlocked.length, 0);
});
