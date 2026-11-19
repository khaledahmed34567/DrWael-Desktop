(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DWCourseFeatures = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function txt(lang, ar, en) {
    return lang === 'en' ? en : ar;
  }

  function isCourseCompleted(tasks, progressMap) {
    const list = Array.isArray(tasks) ? tasks.filter((k) => k && k.id) : [];
    const prog = progressMap || {};
    const totalCount = list.length;
    if (totalCount === 0) {
      return { completed: false, doneCount: 0, totalCount: 0, percent: 0 };
    }
    let doneCount = 0;
    for (const k of list) {
      if (prog[k.id] && prog[k.id].done) doneCount++;
    }
    const percent = Math.round((doneCount / totalCount) * 100);
    return {
      completed: doneCount >= totalCount,
      doneCount,
      totalCount,
      percent
    };
  }

  function validateReviewInput(rating, comment, lang) {
    const l = lang === 'en' ? 'en' : 'ar';
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return {
        ok: false,
        rating: 0,
        comment: '',
        error: txt(l, 'اختر تقييمًا من 1 إلى 5 نجوم.', 'Please select a star rating from 1 to 5.')
      };
    }
    const clean = String(comment || '').trim();
    if (clean.length < 3) {
      return {
        ok: false,
        rating: r,
        comment: clean,
        error: txt(l, 'اكتب مراجعة قصيرة لا تقل عن 3 أحرف.', 'Please write a short review of at least 3 characters.')
      };
    }
    if (clean.length > 400) {
      return {
        ok: false,
        rating: r,
        comment: clean.slice(0, 400),
        error: txt(l, 'المراجعة يجب ألا تتجاوز 400 حرف.', 'Review must be 400 characters or fewer.')
      };
    }
    return {
      ok: true,
      rating: r,
      comment: clean,
      error: ''
    };
  }

  function computeReviewStats(reviews) {
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const valid = [];
    if (Array.isArray(reviews)) {
      for (const item of reviews) {
        if (!item) continue;
        const r = Math.round(Number(item.rating));
        if (!Number.isFinite(r) || r < 1 || r > 5) continue;
        breakdown[r]++;
        valid.push({
          ...item,
          rating: r,
          comment: String(item.comment || '').trim(),
          ts: Number(item.updatedAt || item.createdAt || 0) || 0
        });
      }
    }
    valid.sort((a, b) => b.ts - a.ts);
    const count = valid.length;
    const sum = valid.reduce((acc, x) => acc + x.rating, 0);
    const average = count ? Math.round((sum / count) * 10) / 10 : 0;
    return {
      count,
      average,
      averageText: average.toFixed(1),
      breakdown,
      sorted: valid
    };
  }

  function upsertReviewList(reviews, nextReview) {
    const list = Array.isArray(reviews) ? reviews.slice() : [];
    if (!nextReview) return computeReviewListSort(list);
    const idx = list.findIndex((x) => {
      if (!x) return false;
      if (nextReview.id && x.id === nextReview.id) return true;
      if (nextReview.uid && nextReview.courseId && x.uid === nextReview.uid && x.courseId === nextReview.courseId) return true;
      return false;
    });
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...nextReview };
    } else {
      list.unshift(nextReview);
    }
    return computeReviewListSort(list);
  }

  function computeReviewListSort(list) {
    return list
      .filter(Boolean)
      .slice()
      .sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) || 0) - (Number(a.updatedAt || a.createdAt || 0) || 0));
  }

  function getSupportFaqs(lang) {
    const l = lang === 'en' ? 'en' : 'ar';
    return [
      {
        id: 'faq-billing-activate',
        cat: 'billing',
        q: txt(
          l,
          'كيف أشترك في دورة مدفوعة ومتى يتم تفعيلها؟',
          'How do I subscribe to a paid course and when is it activated?'
        ),
        a: txt(
          l,
          'من صفحة الدورة أو قسم الاشتراكات يمكنك التحويل عبر إنستا باي ورفع صورة الإيصال، أو الدفع الفوري من رصيد المحفظة. تراجع الإدارة طلبات إنستا باي وتفعّل الدورة خلال وقت قصير، مع إصدار فاتورة قابلة للتحميل لمدة 72 ساعة.',
          'From the course page or Subscriptions section, transfer via InstaPay and upload your receipt, or pay instantly from your wallet balance. Admins review InstaPay requests shortly and activate access with a downloadable invoice valid for 72 hours.'
        )
      },
      {
        id: 'faq-locked-tasks',
        cat: 'courses',
        q: txt(
          l,
          'لماذا تبدو بعض المهام أو الاختبارات مقفولة داخل الدورة؟',
          'Why are some tasks or quizzes locked inside a course?'
        ),
        a: txt(
          l,
          'تُفتح المهام بالترتيب التعليمي خطوة بخطوة لضمان استيعاب المنهج؛ بمجرد إتمام المهمة الحالية أو اجتياز الاختبار تُفتح المهمة التالية تلقائيًا ويتحدث شريط التقدم.',
          'Tasks unlock sequentially to guide your study flow. As soon as you complete the current task or pass its quiz, the next task unlocks automatically and your progress bar updates.'
        )
      },
      {
        id: 'faq-course-reviews',
        cat: 'courses',
        q: txt(
          l,
          'متى يمكنني إضافة تقييم ومراجعة للدورة؟',
          'When can I submit a star rating and review for a course?'
        ),
        a: txt(
          l,
          'يتاح نموذج التقييم والمراجعة في صفحة تفاصيل الدورة بمجرد إكمال 100% من مهام الدورة. يمكنك اختيار عدد النجوم وكتابة رأيك القصير وتعديله في أي وقت.',
          'The rating and review form unlocks on the course details page as soon as you reach 100% completion across all course tasks. You can choose a star rating, add a short review, and update it anytime.'
        )
      },
      {
        id: 'faq-alerts-deadlines',
        cat: 'courses',
        q: txt(
          l,
          'كيف تعمل تنبيهات مواعيد التسليم والمحاضرات الجديدة؟',
          'How do task deadline alerts and new lecture notifications work?'
        ),
        a: txt(
          l,
          'يرسل التطبيق تنبيهات محلية تلقائية قبل موعد تسليم المهمة بـ 24 ساعة ثم قبل ساعة واحدة، كما ينبهك فور توفر محاضرة جديدة في الدورات المشترك بها. يمكنك تخصيصها من الإعدادات.',
          'The app automatically triggers local alerts 24 hours and 1 hour before upcoming task deadlines, plus instant alerts whenever a new lecture is published in your enrolled courses. You can manage preferences in Settings.'
        )
      },
      {
        id: 'faq-screen-shield',
        cat: 'account',
        q: txt(
          l,
          'لماذا تظهر شاشة الحماية أو يختفي المحتوى أحيانًا؟',
          'Why does the content protection shield or blur appear sometimes?'
        ),
        a: txt(
          l,
          'تعمل حماية المحتوى تلقائيًا لمنع التقاط لقطات الشاشة أو تسجيل الفيديو أو فتح أدوات المطور عند فقدان التركيز عن النافذة. عد إلى نافذة التطبيق أو أغلق برامج التسجيل ليعود العرض فورًا.',
          'Content protection activates automatically to block screenshots, screen recording, and developer tools when the window loses focus. Return focus to the app window or close capture tools to resume immediately.'
        )
      },
      {
        id: 'faq-media-offline',
        cat: 'technical',
        q: txt(
          l,
          'ماذا أفعل إذا تعذر تحميل ملف PDF أو تشغيل محاضرة فيديو؟',
          'What should I do if a PDF file or lecture video fails to load?'
        ),
        a: txt(
          l,
          'تأكد من استقرار الاتصال بالإنترنت وأعد فتح المهمة، أو استخدم وضع التحميل بدون إنترنت في تطبيق سطح المكتب والأندرويد. إذا استمرت المشكلة، افتح تذكرة دعم مع إرفاق لقطة توضيحية.',
          'Verify your internet connection and reopen the task, or use offline downloads in the desktop/Android app. If the issue persists, open a support ticket with a screenshot so the team can assist.'
        )
      }
    ];
  }

  function filterFaqs(faqs, query, category) {
    const list = Array.isArray(faqs) ? faqs : [];
    const cat = String(category || 'all').trim();
    const q = String(query || '').trim().toLowerCase();
    return list.filter((item) => {
      if (!item) return false;
      if (cat && cat !== 'all' && item.cat !== cat) return false;
      if (!q) return true;
      return (
        String(item.q || '').toLowerCase().includes(q) ||
        String(item.a || '').toLowerCase().includes(q)
      );
    });
  }

  return {
    isCourseCompleted,
    validateReviewInput,
    computeReviewStats,
    upsertReviewList,
    getSupportFaqs,
    filterFaqs
  };
}));
