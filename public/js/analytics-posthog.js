// public/js/analytics-posthog.js
(() => {
  const cfg = window.__POSTHOG_CONFIG__ || {};
  const token = String(cfg.key || '').trim();
  const apiHost = String(cfg.host || '').trim().replace(/\/$/, '');
  if (!token || !apiHost || !/^https:\/\//i.test(apiHost)) return;

  function loadPostHog(t, e) {
    let o, n, p, r;
    if (e.__SV || (window.posthog && window.posthog.__loaded)) return;
    window.posthog = e;
    e._i = [];
    e.init = function(i, s, a) {
      function g(target, method) {
        const parts = method.split('.');
        if (parts.length === 2) {
          target = target[parts[0]];
          method = parts[1];
        }
        target[method] = function() {
          target.push([method].concat(Array.prototype.slice.call(arguments, 0)));
        };
      }
      if (!p) {
        p = t.createElement('script');
        p.type = 'text/javascript';
        p.crossOrigin = 'anonymous';
        p.async = true;
        p.src = s.api_host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
        p.onerror = function() { p = null; };
        r = t.getElementsByTagName('script')[0];
        r.parentNode.insertBefore(p, r);
      }
      let u = e;
      if (a !== undefined) u = e[a] = [];
      else a = 'posthog';
      u.people = u.people || [];
      Object.defineProperty(u, 'toString', {
        configurable: true, enumerable: false, writable: true,
        value: function(asPerson) {
          let name = 'posthog';
          if (a !== 'posthog') name += '.' + a;
          if (!asPerson) name += ' (stub)';
          return name;
        }
      });
      o = 'init capture register register_once unregister getFeatureFlag isFeatureEnabled reloadFeatureFlags onFeatureFlags reset get_distinct_id get_session_id set_config opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing'.split(' ');
      for (n = 0; n < o.length; n++) g(u, o[n]);
      e._i.push([i, s, a]);
    };
    e.__SV = 1;
  }

  loadPostHog(document, window.posthog || []);

  window.posthog.init(token, {
    api_host: apiHost,
    defaults: '2026-05-30',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: 'identified_only',
    persistence: 'localStorage+cookie'
  });

  const normalizePath = (value) => {
    const raw = String(value || '/').split('?')[0].split('#')[0];
    return raw
      .split('/')
      .map((segment) => {
        if (/^\d+$/.test(segment)) return ':id';
        if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id';
        return segment;
      })
      .join('/') || '/';
  };

  const moduleFromPath = (value) => {
    const parts = normalizePath(value).split('/').filter(Boolean);
    return parts[0] || 'inicio';
  };

  const baseProps = () => ({
    path: normalizePath(window.location.pathname),
    module: moduleFromPath(window.location.pathname),
    role: String(cfg.role || 'ANONIMO').toUpperCase(),
    viewport: window.matchMedia('(max-width: 760px)').matches ? 'mobile'
      : window.matchMedia('(max-width: 1100px)').matches ? 'tablet'
      : 'desktop'
  });

  window.posthog.capture('cg_page_view', baseProps());

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('.sidebar a.nav-item[href]');
    if (nav) {
      const href = nav.getAttribute('href') || '';
      window.posthog.capture('cg_sidebar_navigation', {
        ...baseProps(),
        target_path: normalizePath(href),
        target_module: moduleFromPath(href),
        nav_label: String(nav.dataset.navLabel || '').slice(0, 80)
      });
      return;
    }

    const tracked = event.target.closest('[data-analytics-event]');
    if (!tracked) return;
    const eventName = String(tracked.dataset.analyticsEvent || '').trim();
    if (!/^[a-z0-9_:-]{3,80}$/i.test(eventName)) return;

    window.posthog.capture(eventName, {
      ...baseProps(),
      component: String(tracked.dataset.analyticsComponent || '').slice(0, 80),
      action: String(tracked.dataset.analyticsAction || '').slice(0, 80)
    });
  });

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form && String(form.getAttribute('action') || '').includes('/auth/logout')) {
      try { window.posthog.reset(); } catch (_e) {}
    }
  });
})();
