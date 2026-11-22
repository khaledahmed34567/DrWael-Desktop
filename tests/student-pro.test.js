'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
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
} = require('../app/student-pro');

test('evaluateProAccess grants 1-year free Pro to all students while strictly excluding paid courses', () => {
  const student = { id: 'u1', role: 'student', vip: false, vipUntil: 0, createdAt: PRO_FREE_LAUNCH_MS - 30 * 864e5 };
  const status = evaluateProAccess(student, {}, PRO_FREE_LAUNCH_MS + 10 * 864e5);

  assert.equal(status.active, true);
  assert.equal(status.freeYearActive, true);
  assert.equal(status.paid, false);
  assert.equal(status.includesCourses, false);
  assert.equal(status.source, 'free-year');
  assert.equal(status.freeUntil, PRO_FREE_LAUNCH_MS + ONE_YEAR_MS);
  assert.equal(status.daysRemaining, 355);

  // New student created after launch receives 1 full year from their registration timestamp
  const joinAt = PRO_FREE_LAUNCH_MS + 60 * 864e5;
  const newStudent = { id: 'u2', role: 'student', vip: false, vipUntil: 0, createdAt: joinAt };
  const newStatus = evaluateProAccess(newStudent, {}, joinAt + 5 * 864e5);
  assert.equal(newStatus.active, true);
  assert.equal(newStatus.freeUntil, joinAt + ONE_YEAR_MS);
  assert.equal(newStatus.includesCourses, false);

  // Expired after 1 year
  const expiredStatus = evaluateProAccess(student, {}, PRO_FREE_LAUNCH_MS + ONE_YEAR_MS + 1000);
  assert.equal(expiredStatus.active, false);
  assert.equal(expiredStatus.freeYearActive, false);
  assert.equal(expiredStatus.includesCourses, false);

  // Paid course access NEVER unlocked by free Pro or paid Pro alone
  const paidCourse = { id: 'c_anat', price: 350 };
  const freeCourse = { id: 'c_intro', price: 0 };
  assert.equal(hasCourseAccess(paidCourse, {}, { ...student, vip: true, vipUntil: Date.now() + 9e9 }), false);
  assert.equal(hasCourseAccess(paidCourse, { c_anat: 1 }, student), true);
  assert.equal(hasCourseAccess(freeCourse, {}, student), true);
  assert.equal(hasCourseAccess(paidCourse, {}, { id: 'adm1', role: 'admin' }), true);
});

test('flashcards, GPA calculator, IV fluid rate calculator, and study planner work accurately', () => {
  const cards = getDefaultFlashcards('ar');
  assert.ok(cards.length >= 8);
  assert.ok(getProFeaturesList('ar').length >= 4);

  let prog = {};
  prog = recordFlashcardReview(prog, cards[0].id, 'mastered', 1000);
  prog = recordFlashcardReview(prog, cards[1].id, 'review', 2000);
  const fcStats = computeFlashcardStats(cards, prog);
  assert.equal(fcStats.mastered, 1);
  assert.equal(fcStats.needsReview, 1);
  assert.equal(fcStats.unseen, cards.length - 2);

  const gpa = calculateGPA([
    { name: 'Anatomy', credits: 3, gradePoints: 4.0 },
    { name: 'Physiology', credits: 3, gradePoints: 3.0 }
  ], 'en');
  assert.equal(gpa.gpa, 3.5);
  assert.equal(gpa.gpaText, '3.50');
  assert.equal(gpa.totalCredits, 6);
  assert.equal(gpa.label, 'Excellent');

  // 10 kg dog, 5% dehydration, 50 mL/kg/day maint -> 500 + 500 = 1000 mL/24h = 41.7 mL/hr
  const fluids = calculateFluidRate({ weightKg: 10, dehydrationPct: 5, maintenanceMlKgDay: 50, ongoingLossMl: 0, dropFactor: 20 });
  assert.equal(fluids.ok, true);
  assert.equal(fluids.maintenance24h, 500);
  assert.equal(fluids.deficit24h, 500);
  assert.equal(fluids.total24h, 1000);
  assert.equal(fluids.mlPerHour, 41.7);
  assert.equal(fluids.dropsPerMin, 13.9);

  const invalidFluids = calculateFluidRate({ weightKg: 0 });
  assert.equal(invalidFluids.ok, false);

  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const todayStr = new Date(now).toDateString();
  const yestStr = new Date(now - 864e5).toDateString();
  const plan = computePlannerSummary(
    [{ id: '1', done: true }, { id: '2', done: false }],
    { [todayStr]: 45, [yestStr]: 30 },
    60,
    now
  );
  assert.equal(plan.doneTasks, 1);
  assert.equal(plan.pendingTasks, 1);
  assert.equal(plan.todayMinutes, 45);
  assert.equal(plan.weekMinutes, 75);
  assert.equal(plan.dailyPercent, 75);
  assert.equal(plan.goalMet, false);
});

const {examDaysLeft, searchStudyNotes, exportStudyNotes} = require('../app/student-pro');
test('exam countdown validates calendar dates and uses whole local calendar days', () => {
  const now=new Date(2026,10,22,23,59).getTime();
  assert.equal(examDaysLeft('2026-11-23',now),1);
  assert.equal(examDaysLeft('2026-11-22',now),0);
  assert.equal(examDaysLeft('2026-11-20',now),-2);
  assert.equal(examDaysLeft('2026-02-30',now),null);
  assert.equal(examDaysLeft('2026-13-01',now),null);
  assert.equal(examDaysLeft('bad',now),null);
  assert.equal(examDaysLeft('2028-02-29',new Date(2028,1,28).getTime()),1);
});
test('notes search supports Arabic diacritics, English case and empty searches without mutation', () => {
  const notes=[{title:'مُراجعة',body:'تشريح'},{title:'Anatomy',body:'Revision notes'}];
  assert.equal(searchStudyNotes(notes,'مراجعة').length,1);
  assert.equal(searchStudyNotes(notes,'REVISION').length,1);
  assert.equal(searchStudyNotes(notes,'absent').length,0);
  assert.equal(searchStudyNotes(notes,'').length,2);
  assert.equal(notes.length,2);
  assert.equal(exportStudyNotes(notes),'مُراجعة\nتشريح\n\n--------------------\n\nAnatomy\nRevision notes');
  assert.equal(exportStudyNotes([]),'');
});
test('desktop updates no longer fetch repository installers and Store tiles avoid black edges', () => {
  const fs=require('node:fs'),path=require('node:path');
  const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
  assert.ok(!main.includes('electron-updater'));
  assert.ok(!main.includes('releases/latest'));
  assert.ok(main.includes('ms-windows-store://pdp/?ProductId=9NCK2L097D7M'));
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/store-build.yml'),'utf8');
  assert.ok(!workflow.includes('[System.Drawing.Color]::Black'));
  assert.ok(workflow.includes('[System.Drawing.Color]::White'));
  const prepare = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'prepare-store.js'), 'utf8');
  assert.ok(prepare.includes('#FFFFFF'));
  assert.ok(workflow.includes('node scripts/prepare-store.js'));
});
