'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cf = require('../app/course-features.js');

test('isCourseCompleted detects completion strictly when all tasks are done and non-empty', () => {
  assert.deepEqual(cf.isCourseCompleted([], {}), {
    completed: false,
    doneCount: 0,
    totalCount: 0,
    percent: 0
  });

  const tasks = [{ id: 't1' }, { id: 't2' }];
  assert.deepEqual(cf.isCourseCompleted(tasks, { t1: { done: true } }), {
    completed: false,
    doneCount: 1,
    totalCount: 2,
    percent: 50
  });

  assert.deepEqual(
    cf.isCourseCompleted(tasks, { t1: { done: true }, t2: { done: true } }),
    {
      completed: true,
      doneCount: 2,
      totalCount: 2,
      percent: 100
    }
  );
});

test('validateReviewInput enforces valid star rating 1..5 and short review length bounds', () => {
  assert.equal(cf.validateReviewInput(0, 'Great course!', 'en').ok, false);
  assert.equal(cf.validateReviewInput(6, 'Great course!', 'en').ok, false);
  assert.equal(cf.validateReviewInput(4, 'ok', 'en').ok, false);
  assert.equal(cf.validateReviewInput(4, 'a'.repeat(401), 'en').ok, false);

  const okRes = cf.validateReviewInput(5, '  شرح ممتاز ومرتب جدًا  ', 'ar');
  assert.equal(okRes.ok, true);
  assert.equal(okRes.rating, 5);
  assert.equal(okRes.comment, 'شرح ممتاز ومرتب جدًا');
});

test('computeReviewStats and upsertReviewList compute average, breakdown, and deduplicate by user+course', () => {
  const r1 = { id: 'u1_c1', uid: 'u1', courseId: 'c1', rating: 5, comment: 'Excellent', createdAt: 100 };
  const r2 = { id: 'u2_c1', uid: 'u2', courseId: 'c1', rating: 4, comment: 'Helpful', createdAt: 200 };

  let list = cf.upsertReviewList([], r1);
  list = cf.upsertReviewList(list, r2);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'u2_c1');

  // Updating u1's review replaces existing entry instead of duplicating
  list = cf.upsertReviewList(list, { id: 'u1_c1', uid: 'u1', courseId: 'c1', rating: 3, comment: 'Updated', updatedAt: 300 });
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'u1_c1');

  const stats = cf.computeReviewStats(list);
  assert.equal(stats.count, 2);
  assert.equal(stats.average, 3.5);
  assert.equal(stats.averageText, '3.5');
  assert.equal(stats.breakdown[4], 1);
  assert.equal(stats.breakdown[3], 1);
});

test('getSupportFaqs and filterFaqs return localized items and filter by category & query', () => {
  const arFaqs = cf.getSupportFaqs('ar');
  const enFaqs = cf.getSupportFaqs('en');
  assert.ok(arFaqs.length >= 5);
  assert.equal(arFaqs.length, enFaqs.length);

  const billingOnly = cf.filterFaqs(enFaqs, '', 'billing');
  assert.ok(billingOnly.length >= 1);
  assert.ok(billingOnly.every((x) => x.cat === 'billing'));

  const searchRes = cf.filterFaqs(enFaqs, 'protection shield', 'all');
  assert.equal(searchRes.length, 1);
  assert.equal(searchRes[0].id, 'faq-screen-shield');
});
