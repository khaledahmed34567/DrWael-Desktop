'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const chartMod = require('../app/progress-chart');

describe('DWProgressChart.buildStudentProgressData', () => {
  it('computes per-course completion rates, totals, and weekly series accurately', () => {
    const now = new Date('2026-04-10T12:00:00Z').getTime();
    const todayKey = new Date(now).toDateString();
    const yestKey = new Date(now - 86400000).toDateString();

    const courses = [
      { id: 'c1', title: 'التشريح البيطري المتقدم', titleEn: 'Veterinary Anatomy', taskCount: 4 },
      { id: 'c2', title: 'الفسيولوجي', titleEn: 'Physiology' },
      { id: 'c3', title: 'الكيمياء الحيوية', titleEn: 'Biochemistry' }
    ];

    const res = chartMod.buildStudentProgressData({
      lang: 'en',
      now,
      courses,
      totalTasksByCourse: { c1: 4, c2: 5, c3: 0 },
      validTaskIdsByCourse: {
        c1: new Set(['t1', 't2', 't3', 't4']),
        c2: new Set(['p1', 'p2', 'p3', 'p4', 'p5'])
      },
      doneByCourse: {
        c1: new Set(['t1', 't2', 't3', 't4', 'stale_deleted']),
        c2: new Set(['p1', 'p2']),
        c3: new Set()
      },
      daysMap: {
        [todayKey]: 3,
        [yestKey]: 2
      }
    });

    assert.equal(res.enrolledCount, 3);
    assert.equal(res.completedCourses, 1);
    assert.equal(res.totalTasks, 9);
    assert.equal(res.totalDone, 6);
    assert.equal(res.remainingTasks, 3);
    assert.equal(res.overallPercent, 67);
    assert.equal(res.courseItems[0].percent, 100);
    assert.equal(res.courseItems[0].status, 'completed');
    assert.equal(res.courseItems[1].doneTasks, 2);
    assert.equal(res.courseItems[1].remainingTasks, 3);
    assert.equal(res.courseItems[1].percent, 40);
    assert.equal(res.courseItems[1].status, 'in-progress');
    assert.equal(res.courseItems[2].percent, 0);
    assert.equal(res.courseItems[2].status, 'not-started');
    assert.equal(res.weekly.length, 7);
    assert.equal(res.weeklyTotal, 5);
    assert.equal(res.weeklyMax, 3);
    assert.equal(res.weekly[6].count, 3);
    assert.equal(res.weekly[5].count, 2);
  });

  it('handles empty course lists without division by zero', () => {
    const res = chartMod.buildStudentProgressData({ lang: 'ar', courses: [] });
    assert.equal(res.enrolledCount, 0);
    assert.equal(res.totalTasks, 0);
    assert.equal(res.totalDone, 0);
    assert.equal(res.overallPercent, 0);
    assert.equal(res.weekly.length, 7);
    assert.equal(res.weeklyMax, 1);
  });
});

describe('DWProgressChart version & update evaluation', () => {
  it('compares semantic version strings properly', () => {
    assert.equal(chartMod.compareVersions('v1.0.12', '1.0.5'), 1);
    assert.equal(chartMod.compareVersions('1.0.5', 'v1.0.12'), -1);
    assert.equal(chartMod.compareVersions('2.1.0', '2.1'), 0);
    assert.equal(chartMod.compareVersions('1.2.0', '1.2.0'), 0);
  });

  it('normalizes GitHub release metadata and filters non-https URLs', () => {
    const rel = chartMod.normalizeReleaseInfo({
      tag_name: 'v1.0.14',
      published_at: '2026-04-09T10:00:00Z',
      html_url: 'https://github.com/khaledahmed34567/DrWael-Desktop/releases/tag/v1.0.14',
      body: 'Improved D3 charts [force]',
      assets: [
        { name: 'DrWael-Setup.exe', size: 83886080, browser_download_url: 'https://github.com/khaledahmed34567/DrWael-Desktop/releases/download/v1.0.14/DrWael-Setup.exe' },
        { name: 'DrWael-mac.dmg', size: 94371840, browser_download_url: 'http://insecure.example/mac.dmg' },
        { name: 'DrWael-linux.AppImage', size: 88080384, browser_download_url: 'https://github.com/khaledahmed34567/DrWael-Desktop/releases/download/v1.0.14/DrWael-linux.AppImage' }
      ]
    }, 'desktop');

    assert.equal(rel.version, '1.0.14');
    assert.equal(rel.force, true);
    assert.equal(rel.notes, 'Improved D3 charts');
    assert.equal(rel.picked.win.sizeLabel, '80.0 MB');
    assert.equal(rel.picked.mac.url, '');
    assert.ok(rel.picked.linuxApp.url.startsWith('https://'));
  });

  it('evaluates desktop update notifications when GitHub release is newer than installed version', () => {
    const desktopRelease = chartMod.normalizeReleaseInfo({
      tag_name: 'v1.0.14',
      html_url: 'https://github.com/khaledahmed34567/DrWael-Desktop/releases/tag/v1.0.14',
      body: 'New security shield & progress charts'
    }, 'desktop');

    const upd = chartMod.evaluateAppUpdate({
      isNative: true,
      isDesktop: true,
      currentVer: '1.0.9',
      desktopRelease,
      seenVersion: '1.0.9',
      lang: 'ar'
    });

    assert.equal(upd.hasUpdate, true);
    assert.equal(upd.shouldNotify, true);
    assert.equal(upd.shouldBanner, true);
    assert.equal(upd.channel, 'desktop');
    assert.equal(upd.latestVersion, '1.0.14');
  });

  it('respects dismissed release notifications on web unless forced', () => {
    const androidRelease = chartMod.normalizeReleaseInfo({
      tag_name: 'v2.4.0',
      html_url: 'https://github.com/khaledahmed34567/DrWael-Androidapp/releases/tag/v2.4.0',
      assets: [{ name: 'DrWael.apk', size: 12582912, browser_download_url: 'https://github.com/khaledahmed34567/DrWael-Androidapp/releases/latest/download/DrWael.apk' }]
    }, 'android');

    const first = chartMod.evaluateAppUpdate({
      isNative: false,
      currentWebVer: '2.1.0',
      androidRelease,
      platform: 'android',
      seenVersion: '',
      lang: 'en'
    });
    assert.equal(first.hasUpdate, true);
    assert.equal(first.shouldBanner, true);

    const dismissed = chartMod.evaluateAppUpdate({
      isNative: false,
      currentWebVer: '2.1.0',
      androidRelease,
      platform: 'android',
      seenVersion: first.dismissKey,
      lang: 'en'
    });
    assert.equal(dismissed.hasUpdate, true);
    assert.equal(dismissed.shouldBanner, false);
  });
});
