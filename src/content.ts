function injectFloatingButton() {
  console.log('injectFloatingButton');
  if (document.getElementById('animal-crossing-gpt-float-btn')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'animal-crossing-gpt-float-btn';
  wrapper.setAttribute('role', 'button');
  wrapper.setAttribute('aria-label', 'Animal Crossing GPT');
  wrapper.style.position = 'fixed';
  wrapper.style.bottom = '24px';
  wrapper.style.right = '24px';
  wrapper.style.background = '#fff';
  wrapper.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
  wrapper.style.borderRadius = '9999px';
  wrapper.style.padding = '10px 16px';
  wrapper.style.fontSize = '14px';
  wrapper.style.fontWeight = '500';
  wrapper.style.cursor = 'pointer';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.color = '#000';
  wrapper.style.zIndex = '999999';
  wrapper.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  wrapper.style.userSelect = 'none';

  wrapper.textContent = '🧠 GPT';

  wrapper.addEventListener('mouseenter', () => {
    wrapper.style.opacity = '0.85';
    wrapper.style.transform = 'scale(1.05)';
  });
  wrapper.addEventListener('mouseleave', () => {
    wrapper.style.opacity = '1';
    wrapper.style.transform = 'scale(1)';
  });

  wrapper.addEventListener('click', () => {
    console.log('[Animal Crossing GPT] Floating button clicked');
  });

  document.body.appendChild(wrapper);
}

injectFloatingButton();
