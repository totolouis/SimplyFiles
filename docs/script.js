// ===== Scroll-based nav styling =====
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('nav--scrolled', window.scrollY > 20);
}, { passive: true });

// ===== Mobile burger menu =====
const burger = document.getElementById('burger');
const links = document.querySelector('.nav__links');
burger.addEventListener('click', () => {
  links.classList.toggle('is-open');
  const spans = burger.querySelectorAll('span');
  if (links.classList.contains('is-open')) {
    spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
    spans[1].style.opacity = '0';
    spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
  } else {
    spans[0].style.transform = '';
    spans[1].style.opacity = '';
    spans[2].style.transform = '';
  }
});

// Close menu on link click
links.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    links.classList.remove('is-open');
    burger.querySelectorAll('span').forEach(s => {
      s.style.transform = '';
      s.style.opacity = '';
    });
  });
});

// ===== Scroll reveal animations =====
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Observe section headers
document.querySelectorAll('.section__header, .showcase__content, .deploy__terminal, .cta__content, .mobile__phones, .filesystem__diagram').forEach(el => {
  el.classList.add('animate-in');
  observer.observe(el);
});

// Observe feature cards with stagger
document.querySelectorAll('.feature-card').forEach((card, i) => {
  card.style.transitionDelay = `${i * 0.08}s`;
  observer.observe(card);
});

// Observe shortcut keys with stagger
document.querySelectorAll('.shortcut').forEach((s, i) => {
  s.style.transitionDelay = `${i * 0.05}s`;
  observer.observe(s);
});

// ===== Hero entrance animation =====
window.addEventListener('DOMContentLoaded', () => {
  const badge = document.querySelector('.hero__badge');
  const title = document.querySelector('.hero__title');
  const subtitle = document.querySelector('.hero__subtitle');
  const actions = document.querySelector('.hero__actions');
  const preview = document.querySelector('.hero__preview');

  const els = [badge, title, subtitle, actions, preview];
  els.forEach((el, i) => {
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(25px)';
    el.style.transition = `opacity 0.7s ease ${i * 0.12}s, transform 0.7s ease ${i * 0.12}s`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    });
  });
});

// ===== Smooth scroll for anchor links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
