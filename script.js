document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const instructionText = document.getElementById('instructionText');
    const messageText = document.getElementById('messageText');
    const flowerImg = document.getElementById('flowerImg');
    const hintOverlay = document.getElementById('hintOverlay');
    const replayBtn = document.getElementById('replayBtn');
    const fadeEls = Array.from(messageText.querySelectorAll('[data-fade-from]'));

    // 이미지 시퀀스 — 카카오톡 인앱 브라우저 등 비디오 안 되는 환경 대응
    const FRAME_COUNT = 80;
    const framePath = (i) => `frames/f${String(i + 1).padStart(3, '0')}.jpg`;
    const frames = [];
    let framesLoaded = 0;
    let isReady = false;

    let audioContext;
    let analyser;
    let microphone;
    let dataArray;
    let animationId;

    let lastTime = 0;
    let lastBlowAt = 0;
    let currentHint = '';
    let progress = 0;       // 0(봉오리) ~ 1(만개)
    let lastFrameIdx = -1;
    let isBloomed = false;

    // 튜닝
    const THRESHOLD = 5;         // 수음 민감도 (낮을수록 민감)
    const STRENGTH_DIV = 18;     // 강도 정규화 분모 (작을수록 약한 입김도 max)
    const ADVANCE_SPEED = 0.6;
    const REWIND_SPEED = 0.28;
    const COMPLETE_AT = 0.985;

    // ── 프레임 미리 로딩 ──────────────────────────────────────
    function preloadFrames() {
        for (let i = 0; i < FRAME_COUNT; i++) {
            const img = new Image();
            img.src = framePath(i);
            img.decoding = 'async';
            img.onload = () => onFrameLoaded(i);
            img.onerror = () => onFrameLoaded(i, true);
            frames.push(img);
        }
    }

    function onFrameLoaded(i, errored) {
        framesLoaded++;
        if (i === 0 && !errored) {
            // 첫 프레임 표시 (이미 src 설정돼 있지만 한번 더 보장)
            flowerImg.src = frames[0].src;
        }
        if (framesLoaded >= FRAME_COUNT) {
            isReady = true;
            startBtn.disabled = false;
            startBtn.textContent = '마이크 허용하고 시작하기';
        } else if (framesLoaded % 10 === 0) {
            const pct = Math.round((framesLoaded / FRAME_COUNT) * 100);
            startBtn.textContent = `준비중... ${pct}%`;
        }
    }

    function setFrame(p) {
        const idx = Math.max(0, Math.min(FRAME_COUNT - 1, Math.floor(p * (FRAME_COUNT - 1))));
        if (idx === lastFrameIdx) return;
        lastFrameIdx = idx;
        flowerImg.src = frames[idx].src;
    }

    preloadFrames();

    // ── 마이크 처리 ──────────────────────────────────────────
    startBtn.addEventListener('click', async () => {
        if (!isReady || startBtn.disabled) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: true   // 약한 입김도 증폭되도록 켬
                },
                video: false
            });

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
                try { await audioContext.resume(); } catch (e) {}
            }
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.4;

            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            dataArray = new Uint8Array(analyser.frequencyBinCount);

            startBtn.classList.add('hidden');
            const p = document.querySelector('.instruction-text p');
            if (p) p.innerHTML = "마이크를 가까이 대고 <strong>'후~'</strong> 길게 불어주세요 🌬️";

            lastTime = 0;
            animationId = requestAnimationFrame(tick);

        } catch (err) {
            console.error('마이크 접근 오류:', err);
            alert('마이크 접근이 거부되었거나 지원하지 않는 기기입니다. 마이크 권한을 허용해주세요!');
        }
    });

    function setHint(text) {
        if (text === currentHint) return;
        currentHint = text;
        if (!text) {
            hintOverlay.classList.remove('show');
        } else {
            hintOverlay.textContent = text;
            hintOverlay.classList.add('show');
        }
    }

    function updateHint(ratio, isBlowing, now) {
        if (ratio >= 0.95) { setHint(''); return; }
        const idleMs = now - lastBlowAt;
        if (isBlowing) {
            if (ratio < 0.35) setHint('힘차게 불어 꽃을 피어주세요! 🌬️');
            else if (ratio < 0.75) setHint('조금만 더 불어주세요!');
            else setHint('거의 다 됐어요! 🌷');
        } else if (ratio > 0.05 && idleMs > 500) {
            setHint('더 불어주세요! 🌬️');
        } else if (ratio <= 0.05) {
            setHint('');
        }
    }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function updateMessageOpacity(ratio) {
        const hideStart = 0.05, hideEnd = 0.30;
        const instOp = 1 - clamp((ratio - hideStart) / (hideEnd - hideStart), 0, 1);
        instructionText.style.opacity = instOp;
        fadeEls.forEach(el => {
            const from = parseFloat(el.dataset.fadeFrom);
            const to = parseFloat(el.dataset.fadeTo);
            const t = clamp((ratio - from) / (to - from), 0, 1);
            el.style.opacity = t;
        });
    }

    function tick(now) {
        if (isBloomed) return;
        if (!lastTime) lastTime = now;
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        analyser.getByteFrequencyData(dataArray);
        // 입김은 저주파 광대역 노이즈로 잡힘 — 저주파 대역만 평균내면 노이즈/대화 잡음 영향이 줄고 민감도가 올라감
        const lowEnd = Math.floor(dataArray.length * 0.20); // 0~약 4.6kHz
        let sumLow = 0;
        for (let i = 1; i < lowEnd; i++) sumLow += dataArray[i];
        const avg = sumLow / (lowEnd - 1);

        const isBlowing = avg > THRESHOLD;
        if (isBlowing) {
            lastBlowAt = now;
            const strength = Math.min(1, (avg - THRESHOLD) / STRENGTH_DIV);
            progress += strength * ADVANCE_SPEED * dt;
        } else {
            progress -= REWIND_SPEED * dt;
        }
        progress = Math.max(0, Math.min(1, progress));

        setFrame(progress);
        updateMessageOpacity(progress);
        updateHint(progress, isBlowing, now);

        if (progress >= COMPLETE_AT) {
            onFullyBloomed();
            return;
        }

        animationId = requestAnimationFrame(tick);
    }

    function onFullyBloomed() {
        if (isBloomed) return;
        isBloomed = true;
        cancelAnimationFrame(animationId);

        if (microphone && microphone.mediaStream) {
            microphone.mediaStream.getTracks().forEach(t => t.stop());
        }
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
        }

        // 마지막 프레임 고정
        setFrame(1);

        instructionText.style.opacity = 0;
        instructionText.classList.add('hidden');
        setHint('');
        fadeEls.forEach(el => { el.style.opacity = 1; });

        setTimeout(createConfetti, 250);
        setTimeout(() => replayBtn.classList.add('show'), 1400);
    }

    function resetAll() {
        isBloomed = false;
        lastTime = 0;
        lastBlowAt = 0;
        currentHint = '';
        progress = 0;
        lastFrameIdx = -1;

        replayBtn.classList.remove('show');
        fadeEls.forEach(el => { el.style.opacity = 0; });
        setHint('');
        instructionText.classList.remove('hidden');
        instructionText.style.opacity = 1;
        startBtn.classList.remove('hidden');
        const p = document.querySelector('.instruction-text p');
        if (p) p.innerHTML = "소리내어 <strong>'후~'</strong> 불어주세요 🌬️";

        setFrame(0);
    }

    replayBtn.addEventListener('click', resetAll);

    function createConfetti() {
        const colors = ['#e53e3e', '#fc8181', '#f6e05e', '#fed7d7'];
        for (let i = 0; i < 40; i++) {
            const confetti = document.createElement('div');
            confetti.style.position = 'absolute';
            confetti.style.width = Math.random() * 8 + 5 + 'px';
            confetti.style.height = Math.random() * 8 + 5 + 'px';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.top = '-20px';
            if (Math.random() > 0.5) confetti.style.borderRadius = '50%';
            confetti.style.zIndex = '1';
            confetti.style.animation = `fall ${Math.random() * 3 + 2}s linear forwards`;
            document.body.appendChild(confetti);
            setTimeout(() => confetti.remove(), 5000);
        }
    }
});
