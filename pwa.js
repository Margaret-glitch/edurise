if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((reg) => {
                window.__swRegistration = reg;
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                window.dispatchEvent(new CustomEvent('swUpdateAvailable', { detail: reg }));
                            }
                        });
                    }
                });
            })
            .catch(err => console.log('SW registration failed:', err));
    });
}

let deferredPrompt = null;

function injectPWAModal() {
    if (document.getElementById('installModal')) return;

    const modalWrapper = document.createElement('div');
    modalWrapper.innerHTML = `
      <div 
        id="installModal"
        aria-color="#4e352d"
        role="dialog"
        aria-labelledby="modalTitle"
        aria-describedby="modalDesc"
        class="install-app-modal hidden-prompt bg-[#181824] border border-slate-800 rounded-3xl overflow-hidden flex flex-col"
      >
        <div class="w-full h-32 bg-slate-900 overflow-hidden flex items-center justify-center relative">
          <img 
            src="https://cdn.phototourl.com/free/2026-09-09-69cae587-1b1c-4e6b-9960-617a3fcd8b50.png" 
            alt="App Preview Header"
            class="w-full h-full object-cover object-center pointer-events-none select-none"
            onerror="this.src='https://placehold.co/600x300/181824/22c55e?text=Install+App'"
          />
        </div>

        <div class="p-6 text-center flex flex-col items-center">
          <h3 id="modalTitle" class="text-xl font-bold text-white mb-2 tracking-tight">
            Install EduRise
          </h3>

          <p id="modalDesc" class="text-xs text-slate-400 leading-relaxed mb-6 px-1">
            Supercharge your experience with quick desktop access, offline capabilities, instant push notifications, and seamless performance!
          </p>

          <div class="w-full space-y-2">
            <button 
              id="installBtn"
              type="button" 
              class="install-btn-accent w-full py-3 px-4 rounded-xl text-sm font-semibold text-white transition duration-200"
            >
              Install App
            </button>

            <button 
              id="cancelBtn"
              type="button" 
              class="w-full py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalWrapper.firstElementChild);

    applyAriaColor();
    setupEventListeners();
}

function applyAriaColor() {
    const modal = document.getElementById('installModal');
    if (!modal) return;
    const themeColor = modal.getAttribute('aria-color') || '#4e352d';
    modal.style.setProperty('--theme-accent', themeColor);
}

function setupEventListeners() {
    const installBtn = document.getElementById('installBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const modal = document.getElementById('installModal');

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) {
                if (modal) modal.classList.add('hidden-prompt');
                return;
            }
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                if (modal) modal.classList.add('hidden-prompt');
            }
            deferredPrompt = null;
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (modal) modal.classList.add('hidden-prompt');
        });
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const modal = document.getElementById('installModal');
    if (modal) {
        modal.classList.remove('hidden-prompt');
    }
});

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', injectPWAModal);
} else {
    injectPWAModal();
}
