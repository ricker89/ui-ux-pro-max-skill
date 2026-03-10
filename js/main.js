/* =========================================================
   HAPPY CLIENTELE — main.js
   Handles: Navbar scroll, mobile nav, AOS init, FAQ accordion,
            stat counter animation, bar chart, exit-intent popup,
            chat widget, scroll CTA nudge
========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ── 1. AOS (Animate On Scroll) Init ─────────────────── */
  AOS.init({
    once: true,
    offset: 80,
    duration: 700,
    easing: 'ease-out-cubic',
  });

  /* ── 2. Navbar: scroll detection + mobile toggle ──────── */
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }, { passive: true });

  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    hamburger.classList.toggle('active');
  });

  // Close mobile nav when a link is clicked
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      hamburger.classList.remove('active');
    });
  });

  /* ── 3. FAQ Accordion ─────────────────────────────────── */
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const btn    = item.querySelector('.faq-q');
    const answer = item.querySelector('.faq-a');

    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all others
      faqItems.forEach(i => {
        i.classList.remove('open');
        i.querySelector('.faq-a').classList.remove('open');
        i.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });

      // Toggle current
      if (!isOpen) {
        item.classList.add('open');
        answer.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ── 4. Stat Counter Animation ────────────────────────── */
  function animateCounter(el) {
    const target   = parseInt(el.dataset.count, 10);
    const duration = 2000;
    const start    = performance.now();

    function step(now) {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out
      const ease     = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(ease * target);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const statNumbers  = document.querySelectorAll('.stat-number');
  let   statsTriggered = false;

  function checkStatsVisibility() {
    if (statsTriggered) return;
    const statsSection = document.querySelector('.stats-section');
    if (!statsSection) return;
    const rect = statsSection.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.85) {
      statsTriggered = true;
      statNumbers.forEach(el => animateCounter(el));
    }
  }

  window.addEventListener('scroll', checkStatsVisibility, { passive: true });
  checkStatsVisibility(); // check immediately in case already visible

  /* ── 5. Bar Chart Animation ───────────────────────────── */
  const growthChart = document.querySelector('.chart-bars');
  let   chartTriggered = false;

  function checkChartVisibility() {
    if (chartTriggered || !growthChart) return;
    const rect = growthChart.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) {
      chartTriggered = true;
      growthChart.classList.add('bars-animated');
    }
  }

  window.addEventListener('scroll', checkChartVisibility, { passive: true });
  checkChartVisibility();

  /* ── 6. Smooth Scroll for all anchor links ────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const id = anchor.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        const navH   = navbar.offsetHeight;
        const top    = target.getBoundingClientRect().top + window.scrollY - navH - 16;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* ── 7. Phone Mock Button Interaction ─────────────────── */
  const happyBtn   = document.querySelector('.happy-btn');
  const concernBtn = document.querySelector('.concern-btn');
  const msgBubble  = document.querySelector('.msg-bubble');

  if (happyBtn && concernBtn && msgBubble) {
    happyBtn.addEventListener('click', () => {
      msgBubble.innerHTML = `
        <p>🎉 Awesome! Would you mind leaving us a Google Review? It only takes 30 seconds!</p>
        <div class="msg-btns">
          <button class="msg-btn happy-btn" style="background:#4285F4;color:#fff;border-color:#4285F4;">
            <span style="color:#fff">G</span> Leave a Review
          </button>
        </div>`;
      // reset after 3s
      setTimeout(resetMsgBubble, 3500);
    });

    concernBtn.addEventListener('click', () => {
      msgBubble.innerHTML = `
        <p>💬 We're sorry to hear that! Please share your feedback privately — we'll make it right.</p>
        <div class="msg-btns">
          <button class="msg-btn concern-btn">Share Feedback →</button>
        </div>`;
      setTimeout(resetMsgBubble, 3500);
    });

    function resetMsgBubble() {
      msgBubble.innerHTML = `
        <p>Hi! How was your experience at <strong>Brew Haven</strong> today?</p>
        <div class="msg-btns">
          <button class="msg-btn happy-btn">😊 Great!</button>
          <button class="msg-btn concern-btn">💬 Had a concern</button>
        </div>`;
      bindMsgBtns();
    }

    function bindMsgBtns() {
      document.querySelector('.happy-btn')?.addEventListener('click', () => {
        msgBubble.innerHTML = `
          <p>🎉 Awesome! Would you mind leaving us a Google Review? It only takes 30 seconds!</p>
          <div class="msg-btns">
            <button class="msg-btn happy-btn" style="background:#4285F4;color:#fff;border-color:#4285F4;">Leave a Review</button>
          </div>`;
        setTimeout(resetMsgBubble, 3500);
      });
      document.querySelector('.concern-btn')?.addEventListener('click', () => {
        msgBubble.innerHTML = `
          <p>💬 We're sorry to hear that! Please share your feedback privately — we'll make it right.</p>
          <div class="msg-btns">
            <button class="msg-btn concern-btn">Share Feedback →</button>
          </div>`;
        setTimeout(resetMsgBubble, 3500);
      });
    }
  }

  /* ── 8. Exit-Intent Popup ─────────────────────────────── */
  const popupOverlay = document.getElementById('popupOverlay');
  const popupClose   = document.getElementById('popupClose');
  const popupForm    = document.getElementById('popupForm');

  let popupShown     = false;
  let timeoutId;

  function showPopup() {
    if (popupShown) return;
    popupShown = true;
    popupOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function hidePopup() {
    popupOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Exit intent on desktop (mouse leaves viewport top)
  document.addEventListener('mouseleave', e => {
    if (e.clientY < 10) showPopup();
  });

  // Fallback timer: show after 45s
  timeoutId = setTimeout(showPopup, 45000);

  // Show on mobile after 60s scroll engagement
  let mobileScrolled = false;
  window.addEventListener('scroll', () => {
    if (mobileScrolled) return;
    if (window.scrollY > window.innerHeight * 0.6) {
      mobileScrolled = true;
      setTimeout(showPopup, 8000);
    }
  }, { passive: true });

  popupClose.addEventListener('click', hidePopup);

  popupOverlay.addEventListener('click', e => {
    if (e.target === popupOverlay) hidePopup();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hidePopup();
  });

  if (popupForm) {
    popupForm.addEventListener('submit', e => {
      e.preventDefault();
      const email = popupForm.querySelector('input[type="email"]').value;
      popupForm.innerHTML = `
        <div style="text-align:center;padding:20px 0;">
          <div style="font-size:3rem;margin-bottom:12px;">✅</div>
          <h4 style="font-size:1.1rem;margin-bottom:8px;">Guide On Its Way!</h4>
          <p style="color:#666;font-size:.9rem;">Check your inbox at <strong>${email}</strong></p>
        </div>`;
      setTimeout(hidePopup, 3000);
    });
  }

  /* ── 9. Chat Widget ────────────────────────────────────── */
  const chatToggle   = document.getElementById('chatToggle');
  const chatBox      = document.getElementById('chatBox');
  const chatClose    = document.getElementById('chatClose');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput    = document.getElementById('chatInput');
  const chatSend     = document.getElementById('chatSend');
  const chatBadge    = chatToggle?.querySelector('.chat-badge');
  const openIcon     = chatToggle?.querySelector('.chat-open-icon');
  const closeIcon    = chatToggle?.querySelector('.chat-close-icon');
  const qrBtns       = document.querySelectorAll('.qr-btn');

  // Auto-responses map
  const autoReplies = {
    'how does the review funnel work?': 'Great question! Our review funnel sends customers a quick satisfaction check after their transaction. Happy customers are guided to leave a Google review in 2 clicks. Concerned customers go to a private feedback form only you see. Simple and powerful! 🚀',
    "what's the pricing?": 'It\'s simple! One-time setup fee of $497 (we handle everything), then just $79/month with no contracts. Most clients see 8–12 new customers monthly from better rankings — it pays for itself fast! 💰',
    'which pos systems do you integrate with?': 'We work with Square, Clover, Toast, Lightspeed, Shopify POS, and virtually any system that stores customer emails or phone numbers. Email platforms like Mailchimp and Klaviyo too! 🔌',
  };

  function appendMessage(text, type) {
    const div = document.createElement('div');
    div.className = `chat-msg ${type}`;
    const p = document.createElement('p');
    p.textContent = text;
    div.appendChild(p);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function agentReply(userMsg) {
    const key = userMsg.toLowerCase().trim();
    const reply = autoReplies[key] || 
      "Thanks for your message! 😊 One of our team members will get back to you shortly. Or feel free to grab our free guide above — it answers most questions!";
    
    setTimeout(() => {
      // Typing indicator
      const typing = document.createElement('div');
      typing.className = 'chat-msg agent';
      typing.innerHTML = '<p style="color:#999;font-style:italic;">Typing…</p>';
      chatMessages.appendChild(typing);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      setTimeout(() => {
        chatMessages.removeChild(typing);
        appendMessage(reply, 'agent');
      }, 1000 + Math.random() * 500);
    }, 400);
  }

  function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    appendMessage(msg, 'user');
    chatInput.value = '';
    agentReply(msg);
  }

  chatToggle?.addEventListener('click', () => {
    const isOpen = chatBox.classList.toggle('open');
    if (isOpen) {
      openIcon.style.display = 'none';
      closeIcon.style.display = 'block';
      if (chatBadge) chatBadge.style.display = 'none';
    } else {
      openIcon.style.display = 'block';
      closeIcon.style.display = 'none';
    }
  });

  chatClose?.addEventListener('click', () => {
    chatBox.classList.remove('open');
    openIcon.style.display = 'block';
    closeIcon.style.display = 'none';
  });

  chatSend?.addEventListener('click', sendMessage);

  chatInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });

  qrBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const reply = btn.dataset.reply;
      appendMessage(reply, 'user');
      agentReply(reply);
    });
  });

  // Auto-open chat after 20s with a nudge
  setTimeout(() => {
    if (!chatBox.classList.contains('open')) {
      chatBox.classList.add('open');
      openIcon.style.display = 'none';
      closeIcon.style.display = 'block';
      if (chatBadge) chatBadge.style.display = 'none';
      appendMessage('👋 Still have questions? I\'m here to help! Ask me anything about HappyClientele.', 'agent');
    }
  }, 20000);

  /* ── 10. Funnel Diagram — animated step-by-step reveal ── */
  const funnelDiagram = document.querySelector('.funnel-diagram');
  let funnelAnimated = false;

  function checkFunnelVisibility() {
    if (funnelAnimated || !funnelDiagram) return;
    const rect = funnelDiagram.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.85) {
      funnelAnimated = true;
      animateFunnelArrows();
    }
  }

  function animateFunnelArrows() {
    // Pulse the check node
    const checkNode = document.querySelector('.check-node');
    if (checkNode) {
      checkNode.style.borderColor = '#FDB813';
      checkNode.style.boxShadow  = '0 0 0 4px rgba(253,184,19,.2)';
    }

    // Sequentially highlight paths
    setTimeout(() => {
      const googleNode = document.querySelector('.google-node');
      if (googleNode) {
        googleNode.style.borderColor = '#4285F4';
        googleNode.style.boxShadow  = '0 0 0 4px rgba(66,133,244,.15)';
      }
    }, 600);

    setTimeout(() => {
      const privateNode = document.querySelector('.private-node');
      if (privateNode) {
        privateNode.style.borderColor = '#888';
        privateNode.style.boxShadow  = '0 0 0 4px rgba(0,0,0,.08)';
      }
    }, 900);

    setTimeout(() => {
      const happyResult = document.querySelector('.result-happy');
      if (happyResult) {
        happyResult.style.borderColor = '#34A853';
        happyResult.style.boxShadow  = '0 0 0 4px rgba(52,168,83,.15)';
      }
    }, 1200);
  }

  window.addEventListener('scroll', checkFunnelVisibility, { passive: true });
  checkFunnelVisibility();

  /* ── 11. Sticky CTA Bar (small, bottom) on mobile ──────── */
  let stickyCta = null;

  function buildStickyCta() {
    stickyCta = document.createElement('div');
    stickyCta.id = 'sticky-cta';
    stickyCta.innerHTML = `
      <span>HappyClientele — Start Today</span>
      <a href="#final-cta" class="btn btn-yellow btn-sm">Get Started →</a>
    `;
    stickyCta.style.cssText = `
      position: fixed; bottom: 0; left: 0; right: 0;
      background: var(--black); color: var(--white);
      padding: 12px 24px;
      display: flex; align-items: center; justify-content: space-between;
      z-index: 7000; transform: translateY(100%); transition: transform .4s ease;
      box-shadow: 0 -4px 24px rgba(0,0,0,.3);
      font-size: .88rem; font-weight: 500;
    `;
    document.body.appendChild(stickyCta);
  }

  function checkStickyCtaVisibility() {
    if (!stickyCta) return;
    const hero    = document.querySelector('.hero');
    const finalCta= document.querySelector('.final-cta');
    if (!hero || !finalCta) return;

    const heroBottom    = hero.getBoundingClientRect().bottom;
    const finalCtaTop   = finalCta.getBoundingClientRect().top;

    if (heroBottom < 0 && finalCtaTop > window.innerHeight) {
      stickyCta.style.transform = 'translateY(0)';
    } else {
      stickyCta.style.transform = 'translateY(100%)';
    }
  }

  if (window.innerWidth <= 768) {
    buildStickyCta();
    window.addEventListener('scroll', checkStickyCtaVisibility, { passive: true });
  }

  /* ── 12. Highlight active nav link on scroll ──────────── */
  const sections = document.querySelectorAll('section[id]');

  function updateActiveNav() {
    const scrollPos = window.scrollY + navbar.offsetHeight + 80;
    sections.forEach(section => {
      const top    = section.offsetTop;
      const height = section.offsetHeight;
      const link   = document.querySelector(`.nav-links a[href="#${section.id}"]`);
      if (link) {
        if (scrollPos >= top && scrollPos < top + height) {
          link.style.color = '#FDB813';
        } else {
          link.style.color = '';
        }
      }
    });
  }

  window.addEventListener('scroll', updateActiveNav, { passive: true });

  /* ── 13. Hamburger X animation ─────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .hamburger.active span:nth-child(1) {
      transform: rotate(45deg) translate(5px, 5px);
    }
    .hamburger.active span:nth-child(2) { opacity: 0; }
    .hamburger.active span:nth-child(3) {
      transform: rotate(-45deg) translate(5px, -5px);
    }
    .hamburger span { transition: all .3s ease; }
  `;
  document.head.appendChild(style);

  /* ── 14. Parallax on hero shapes ─────────────────────────*/
  const shape1 = document.querySelector('.shape-1');
  const shape2 = document.querySelector('.shape-2');

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (shape1) shape1.style.transform = `translateY(${y * 0.15}px)`;
    if (shape2) shape2.style.transform = `translateY(${y * -0.1}px)`;
  }, { passive: true });

  /* ── 15. Review cards stagger delay on load ──────────────*/
  const reviewCards = document.querySelectorAll('.review-card');
  reviewCards.forEach((card, i) => {
    card.style.animationDelay = `${i * 1.3}s`;
  });

  /* ── 16. "Scroll to top" on logo click ──────────────────── */
  document.querySelectorAll('.logo').forEach(logo => {
    logo.addEventListener('click', e => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  console.log('🌟 HappyClientele loaded successfully!');
});
