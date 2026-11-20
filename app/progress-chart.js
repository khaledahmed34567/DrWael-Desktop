(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DWProgressChart = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function txt(lang, ar, en) {
    return lang === 'en' ? en : ar;
  }

  function safeHttps(url) {
    const s = String(url || '').trim();
    return /^https:\/\//i.test(s) ? s : '';
  }

  function truncateLabel(str, maxLen) {
    const chars = Array.from(String(str || '').trim());
    const limit = Number.isFinite(Number(maxLen)) && maxLen > 3 ? Number(maxLen) : 18;
    if (chars.length <= limit) return chars.join('');
    return chars.slice(0, limit - 1).join('').trimEnd() + '…';
  }

  function countDoneForCourse(doneEntry, validEntry) {
    if (doneEntry instanceof Set) {
      if (validEntry instanceof Set) {
        let count = 0;
        for (const id of doneEntry) {
          if (validEntry.has(id)) count++;
        }
        return count;
      }
      if (Array.isArray(validEntry)) {
        const vset = new Set(validEntry);
        let count = 0;
        for (const id of doneEntry) {
          if (vset.has(id)) count++;
        }
        return count;
      }
      return doneEntry.size;
    }
    if (Array.isArray(doneEntry)) {
      const uniq = new Set(doneEntry);
      return countDoneForCourse(uniq, validEntry);
    }
    const n = Number(doneEntry);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function buildStudentProgressData(input) {
    const opts = input && typeof input === 'object' ? input : {};
    const lang = opts.lang === 'en' ? 'en' : 'ar';
    const courses = Array.isArray(opts.courses) ? opts.courses : [];
    const doneByCourse = opts.doneByCourse && typeof opts.doneByCourse === 'object' ? opts.doneByCourse : {};
    const validByCourse = opts.validTaskIdsByCourse && typeof opts.validTaskIdsByCourse === 'object' ? opts.validTaskIdsByCourse : {};
    const totalByCourse = opts.totalTasksByCourse && typeof opts.totalTasksByCourse === 'object' ? opts.totalTasksByCourse : {};
    const daysMap = opts.daysMap && typeof opts.daysMap === 'object' ? opts.daysMap : {};
    const nowMs = Number.isFinite(Number(opts.now)) ? Number(opts.now) : Date.now();

    let totalTasks = 0;
    let totalDone = 0;
    let completedCourses = 0;

    const courseItems = courses.map((c, idx) => {
      const id = String((c && c.id) || ('course_' + idx));
      const title = lang === 'en'
        ? String((c && (c.titleEn || c.title)) || id)
        : String((c && (c.title || c.titleEn)) || id);
      const rawTotal = totalByCourse[id] !== undefined
        ? Number(totalByCourse[id])
        : (c && c.taskCount !== undefined ? Number(c.taskCount) : 0);
      const courseTotal = Number.isFinite(rawTotal) && rawTotal > 0 ? Math.floor(rawTotal) : 0;
      const rawDone = countDoneForCourse(doneByCourse[id], validByCourse[id]);
      const courseDone = courseTotal > 0 ? Math.min(rawDone, courseTotal) : 0;
      const remaining = Math.max(0, courseTotal - courseDone);
      const percent = courseTotal > 0 ? Math.round((courseDone / courseTotal) * 100) : 0;
      const status = courseTotal > 0 && courseDone >= courseTotal
        ? 'completed'
        : (courseDone > 0 ? 'in-progress' : 'not-started');

      if (status === 'completed') completedCourses++;
      totalTasks += courseTotal;
      totalDone += courseDone;

      return {
        id,
        title,
        shortTitle: truncateLabel(title, 18),
        totalTasks: courseTotal,
        doneTasks: courseDone,
        remainingTasks: remaining,
        percent,
        status,
        statusLabel: status === 'completed'
          ? txt(lang, 'مكتملة', 'Completed')
          : (status === 'in-progress' ? txt(lang, 'قيد التقدم', 'In progress') : txt(lang, 'لم تبدأ', 'Not started'))
      };
    });

    const overallPercent = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
    const avgCoursePercent = courseItems.length > 0
      ? Math.round(courseItems.reduce((sum, item) => sum + item.percent, 0) / courseItems.length)
      : 0;

    const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';
    const weekly = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(nowMs - i * 86400000);
      const dateKey = d.toDateString();
      const rawCount = Number(daysMap[dateKey]);
      const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0;
      let label = '';
      let fullDate = '';
      try {
        label = d.toLocaleDateString(locale, { weekday: 'short' });
        fullDate = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
      } catch (e) {
        label = dateKey.slice(0, 3);
        fullDate = dateKey;
      }
      weekly.push({
        index: 6 - i,
        dateKey,
        label,
        fullDate,
        count
      });
    }

    const weeklyTotal = weekly.reduce((sum, w) => sum + w.count, 0);
    const weeklyMax = Math.max(1, ...weekly.map((w) => w.count));

    return {
      enrolledCount: courseItems.length,
      completedCourses,
      totalTasks,
      totalDone,
      remainingTasks: Math.max(0, totalTasks - totalDone),
      overallPercent,
      avgCoursePercent,
      courseItems,
      weekly,
      weeklyTotal,
      weeklyMax
    };
  }

  function parseVersionParts(v) {
    const clean = String(v || '').trim().replace(/^v/i, '');
    if (!clean) return null;
    const core = clean.split(/[-+]/)[0];
    if (!/^\d+(?:\.\d+)*$/.test(core)) return null;
    return core.split('.').map((n) => parseInt(n, 10));
  }

  function compareVersions(a, b) {
    const pa = parseVersionParts(a);
    const pb = parseVersionParts(b);
    if (!pa && !pb) return 0;
    if (!pa) return -1;
    if (!pb) return 1;
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  function formatAsset(a) {
    if (!a || typeof a !== 'object') return null;
    const url = safeHttps(a.browser_download_url || a.url);
    const size = Number(a.size) || 0;
    return {
      name: String(a.name || ''),
      url,
      size,
      sizeLabel: size > 0 ? (size / 1048576).toFixed(1) + ' MB' : ''
    };
  }

  function normalizeReleaseInfo(raw, kind) {
    if (!raw || typeof raw !== 'object') return null;
    const tagName = String(raw.tag_name || raw.tagName || '').trim();
    const version = tagName.replace(/^v/i, '');
    if (!version) return null;
    const rawAssets = Array.isArray(raw.assets) ? raw.assets : [];
    const assets = rawAssets.map(formatAsset).filter(Boolean);
    const rawNotes = String(raw.body || raw.notes || '');
    const force = /\[force\]/i.test(rawNotes);
    const notes = rawNotes.replace(/\[force\]/ig, '').trim();

    const findExt = (re) => assets.find((x) => re.test(x.name)) || null;
    const picked = kind === 'android'
      ? { apk: findExt(/\.apk$/i) }
      : {
          win: findExt(/\.exe$/i),
          mac: findExt(/\.dmg$/i),
          macZip: findExt(/-mac\.zip$|\.zip$/i),
          linuxApp: findExt(/\.AppImage$/i),
          linuxDeb: findExt(/\.deb$/i)
        };

    return {
      kind: kind === 'android' ? 'android' : 'desktop',
      tagName,
      version,
      title: String(raw.name || tagName).trim(),
      publishedAt: raw.published_at || raw.publishedAt || '',
      htmlUrl: safeHttps(raw.html_url || raw.htmlUrl),
      notes: notes.slice(0, 1200),
      force,
      assets,
      picked
    };
  }

  function detectClientPlatform(userAgent, nativePlatform) {
    const np = String(nativePlatform || '').toLowerCase();
    if (np === 'win32') return 'win';
    if (np === 'darwin') return 'mac';
    if (np === 'linux') return 'linux';
    const ua = String(userAgent || '').toLowerCase();
    if (/android/.test(ua)) return 'android';
    if (/iphone|ipad|ipod|macintosh|mac os x/.test(ua)) return 'mac';
    if (/windows/.test(ua)) return 'win';
    if (/linux|x11/.test(ua)) return 'linux';
    return 'android';
  }

  function evaluateAppUpdate(input) {
    const opts = input && typeof input === 'object' ? input : {};
    const lang = opts.lang === 'en' ? 'en' : 'ar';
    const isNative = !!opts.isNative;
    const isDesktop = !!opts.isDesktop;
    const currentVer = String(opts.currentVer || '').trim();
    const currentWebVer = String(opts.currentWebVer || '').trim();
    const seenVersion = String(opts.seenVersion || '').trim();
    const platform = String(opts.platform || 'android');
    const remote = opts.remoteConfig && typeof opts.remoteConfig === 'object' ? opts.remoteConfig : {};
    const desktopRel = opts.desktopRelease || null;
    const androidRel = opts.androidRelease || null;

    if (isNative && isDesktop) {
      const remoteVer = String(remote.desktopVer || '').replace(/^v/i, '');
      const ghVer = desktopRel && desktopRel.version ? desktopRel.version : '';
      const latestVersion = compareVersions(remoteVer, ghVer) >= 0 ? remoteVer : ghVer;
      const hasUpdate = !!(latestVersion && currentVer && compareVersions(latestVersion, currentVer) > 0);
      if (!hasUpdate) {
        return {
          hasUpdate: false,
          shouldNotify: false,
          shouldBanner: false,
          channel: 'desktop',
          currentVersion: currentVer || '1.0.0',
          latestVersion: latestVersion || currentVer || ''
        };
      }
      const force = !!(remote.forceUpdate || (desktopRel && desktopRel.force));
      const dismissed = !!(!force && seenVersion && compareVersions(seenVersion, latestVersion) >= 0);
      return {
        hasUpdate: true,
        shouldNotify: true,
        shouldBanner: !dismissed,
        channel: 'desktop',
        currentVersion: currentVer,
        latestVersion,
        force,
        releaseUrl: safeHttps(remote.desktopUrl) || (desktopRel && desktopRel.htmlUrl) || 'https://github.com/khaledahmed34567/DrWael-Desktop/releases/latest',
        downloadUrl: '',
        notes: String(remote.updateNotes || (desktopRel && desktopRel.notes) || ''),
        title: txt(lang, 'يتوفر تحديث جديد لتطبيق سطح المكتب', 'New desktop app update available'),
        body: txt(
          lang,
          'الإصدار ' + latestVersion + ' متاح الآن (نسختك الحالية ' + currentVer + '). حدّث التطبيق للحصول على أحدث المزايا.',
          'Version ' + latestVersion + ' is ready (your version: ' + currentVer + '). Update now for the latest improvements.'
        ),
        ctaLabel: txt(lang, 'تحديث الآن', 'Update now')
      };
    }

    if (isNative && !isDesktop) {
      const remoteVer = String(remote.androidVer || '').replace(/^v/i, '');
      const ghVer = androidRel && androidRel.version ? androidRel.version : '';
      const latestVersion = compareVersions(remoteVer, ghVer) >= 0 ? remoteVer : ghVer;
      const hasUpdate = !!(latestVersion && currentVer && compareVersions(latestVersion, currentVer) > 0);
      if (!hasUpdate) {
        return {
          hasUpdate: false,
          shouldNotify: false,
          shouldBanner: false,
          channel: 'android',
          currentVersion: currentVer || '1.0.0',
          latestVersion: latestVersion || currentVer || ''
        };
      }
      const force = !!(remote.forceUpdate || (androidRel && androidRel.force));
      const dismissed = !!(!force && seenVersion && compareVersions(seenVersion, latestVersion) >= 0);
      const apkUrl = (androidRel && androidRel.picked && androidRel.picked.apk && androidRel.picked.apk.url) ||
        'https://github.com/khaledahmed34567/DrWael-Androidapp/releases/latest/download/DrWael.apk';
      return {
        hasUpdate: true,
        shouldNotify: true,
        shouldBanner: !dismissed,
        channel: 'android',
        currentVersion: currentVer,
        latestVersion,
        force,
        releaseUrl: safeHttps(remote.androidUrl) || (androidRel && androidRel.htmlUrl) || 'https://github.com/khaledahmed34567/DrWael-Androidapp/releases/latest',
        downloadUrl: apkUrl,
        notes: String(remote.updateNotes || (androidRel && androidRel.notes) || ''),
        title: txt(lang, 'يتوفر تحديث جديد لتطبيق د. وائل', 'New Dr. Wael app update available'),
        body: txt(
          lang,
          'الإصدار ' + latestVersion + ' متاح الآن لتحسين الأداء والحماية.',
          'Version ' + latestVersion + ' is available with the latest improvements and protection.'
        ),
        ctaLabel: txt(lang, 'تحميل التحديث', 'Download update')
      };
    }

    // Web client: check remote web version first, then native app release notifications
    const remoteWebVer = String(remote.webVer || '').replace(/^v/i, '');
    if (remoteWebVer && currentWebVer && compareVersions(remoteWebVer, currentWebVer) > 0) {
      const force = !!remote.forceUpdate;
      const dismissed = !!(!force && seenVersion && compareVersions(seenVersion, remoteWebVer) >= 0);
      return {
        hasUpdate: true,
        shouldNotify: !dismissed,
        shouldBanner: !dismissed,
        channel: 'web',
        currentVersion: currentWebVer,
        latestVersion: remoteWebVer,
        force,
        releaseUrl: '',
        downloadUrl: '',
        notes: String(remote.updateNotes || ''),
        title: txt(lang, 'يتوفر تحديث جديد للمنصة', 'New platform update available'),
        body: String(remote.updateNotes || '').trim() || txt(
          lang,
          'تم نشر إصدار جديد من الموقع (' + remoteWebVer + '). حدّث الصفحة أو افتح التحميلات.',
          'A new website version (' + remoteWebVer + ') is live. Refresh or check downloads.'
        ),
        ctaLabel: txt(lang, 'تحديث الصفحة', 'Refresh page')
      };
    }

    const preferDesktop = platform === 'win' || platform === 'mac' || platform === 'linux';
    const rel = preferDesktop ? (desktopRel || androidRel) : (androidRel || desktopRel);
    if (!rel || !rel.version) {
      return {
        hasUpdate: false,
        shouldNotify: false,
        shouldBanner: false,
        channel: 'web',
        currentVersion: currentWebVer,
        latestVersion: ''
      };
    }
    const relKey = rel.kind + ':' + rel.version;
    const dismissed = !rel.force && (seenVersion === relKey || seenVersion === rel.version);
    return {
      hasUpdate: true,
      shouldNotify: !dismissed,
      shouldBanner: !dismissed,
      channel: rel.kind,
      dismissKey: relKey,
      currentVersion: currentWebVer,
      latestVersion: rel.version,
      force: !!rel.force,
      releaseUrl: rel.htmlUrl || '',
      downloadUrl: '',
      notes: rel.notes || '',
      title: rel.kind === 'desktop'
        ? txt(lang, 'إصدار جديد من تطبيق سطح المكتب v' + rel.version, 'Desktop app update v' + rel.version + ' available')
        : txt(lang, 'إصدار جديد من تطبيق الأندرويد v' + rel.version, 'Android app update v' + rel.version + ' available'),
      body: txt(
        lang,
        'يتوفر الآن الإصدار ' + rel.version + ' للتحميل والتثبيت. اضغط لعرض روابط التحميل الرسمية وما الجديد.',
        'Release ' + rel.version + ' is now available to download. Open Downloads to view direct links and release notes.'
      ),
      ctaLabel: txt(lang, 'روابط التحميل والتحديث', 'Download & release notes')
    };
  }

  return {
    buildStudentProgressData,
    compareVersions,
    normalizeReleaseInfo,
    detectClientPlatform,
    evaluateAppUpdate
  };
}));
