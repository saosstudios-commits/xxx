/* Shared SeePay presentation behavior. Business data and forms are handled by live-app.js. */
'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  const onScroll = () => { if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 8); };
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  const sidebar = document.querySelector('#sidebar');
  const sidebarOpen = document.querySelector('[data-sidebar-open]');
  const sidebarClose = document.querySelector('[data-sidebar-close]');
  const setSidebarOpen = (open) => {
    if (!sidebar) return;
    sidebar.classList.toggle('is-open', open);
    if (sidebarClose) sidebarClose.classList.toggle('is-open', open);
    if (sidebarOpen) {
      sidebarOpen.setAttribute('aria-expanded', String(open));
      sidebarOpen.setAttribute('aria-controls', 'sidebar');
    }
    if (window.matchMedia('(max-width: 960px)').matches) {
      document.body.style.overflow = open ? 'hidden' : '';
    }
  };
  if (sidebar && sidebarOpen) sidebarOpen.addEventListener('click', () => {
    setSidebarOpen(!sidebar.classList.contains('is-open'));
  });
  if (sidebarClose) sidebarClose.addEventListener('click', () => setSidebarOpen(false));
  if (sidebar) sidebar.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 960px)').matches) setSidebarOpen(false);
  }));

  const burger = document.querySelector('[data-menu-open]');
  const menu = document.querySelector('#mobile-menu');
  const close = document.querySelector('[data-menu-close]');
  const closeMenu = () => {
    const returnFocus = !!(menu && menu.contains(document.activeElement));
    if (menu) menu.classList.remove('is-open');
    document.body.style.overflow = '';
    if (burger) burger.setAttribute('aria-expanded', 'false');
    if (returnFocus && burger) burger.focus();
  };
  if (burger && menu) {
    burger.setAttribute('aria-controls', 'mobile-menu');
    burger.addEventListener('click', () => {
      menu.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      burger.setAttribute('aria-expanded', 'true');
      if (close) close.focus();
    });
  }
  if (close) close.addEventListener('click', closeMenu);
  if (menu) {
    menu.addEventListener('click', e => { if (e.target === menu) closeMenu(); });
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); setSidebarOpen(false); } });

  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('[data-nav]').forEach(a => {
    const target = (a.getAttribute('href') || '').split('/').pop();
    if (target === here) a.classList.add('is-active');
  });
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
  const reveals = [...document.querySelectorAll('.reveal')];
  if ('IntersectionObserver' in window && reveals.length) {
    const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .12 });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add('in'));

  document.querySelectorAll('[data-pw-toggle]').forEach(btn => btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.pwToggle); if (!input) return;
    const reveal = input.type === 'password'; input.type = reveal ? 'text' : 'password';
    btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password'); input.focus();
  }));
  if (window.SEE_PAY_LIVE && typeof window.SEE_PAY_LIVE.initPage === 'function') {
    window.SEE_PAY_LIVE.initPage(document.body.dataset.page || '');
  } else {
    const host = document.createElement('div'); host.className = 'form-notice form-notice--err is-visible'; host.textContent = 'The SeePay application script did not load. Check the deployment files and refresh.'; document.body.prepend(host);
  }
});
