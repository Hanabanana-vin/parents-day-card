document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const instructionText = document.getElementById('instructionText');
    const messageText = document.getElementById('messageText');
    const video = document.getElementById('bloomVideo');
    const hintOverlay = document.getElementById('hintOverlay');
    const replayBtn = document.getElementById('replayBtn');
    const fadeEls = Array.from(messageText.querySelectorAll('[data-fade-from]'));

    let lastBlowAt = 0;
    let currentHint = '';

    let audioContext;
    let analyser;
    let microphone;
    let dataArray;
    let animationId;

    let lastTime = 0;
    let videoDuration = 0;
    let isBloomed = false;

    // 튜닝
    const THRESHOLD = 22;
    const MIN_RATE = 0.6;
    const MAX_RATE = 3.0;
    const REWIND_SPEED = 0.45;

    const showFirstFrame = () => { try { video.currentTime = 0.01; } catch (e) {} };
    if (video.readyState >= 2) showFirstFrame();
    else video.addEventListener('loadeddata', showFirstFrame, { once: true });

    video.addEventListener('loadedmetadata', () => {
        videoDuration = video.duration || 0;
    });

    video.addEventListener('ended', () => onFullyBloomed());

    startBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                },
                video: false
            });

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;

            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            dataArray = new Uint8Array(analyser.frequencyBinCount);

            startBtn.classList.add('hidden');
            const p = document.querySelector('.instruction-text p');
            if (p) p.innerHTML = "화면 가까이 대고 <strong>'후~'</strong> 길게 불어주세요 🌬️";

            video.muted = true;
            video.pause();
            try { video.currentTime = 0.01; } catch (e) {}

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
        // 거의 만개에 도달하면 힌트 숨김
        if (ratio >= 0.95) { setHint(''); return; }

        const idleMs = now - lastBlowAt;

        if (isBlowing) {
            // 부는 중 — 진행도에 따라 응원 메세지
            if (ratio < 0.35) setHint('힘차게 불어 꽃을 피어주세요! 🌬️');
            else if (ratio < 0.75) setHint('조금만 더 불어주세요!');
            else setHint('거의 다 됐어요! 🌷');
        } else if (ratio > 0.05 && idleMs > 500) {
            // 진행 중에 멈춤
            setHint('더 불어주세요! 🌬️');
        } else if (ratio <= 0.05) {
            // 시작 직후 아직 안 분 상태
            setHint('');
        }
    }

    function updateMessageOpacity(ratio) {
        // 안내 문구는 영상이 시작되면 빠르게 사라짐
        const hideStart = 0.05, hideEnd = 0.30;
        const instOp = 1 - clamp((ratio - hideStart) / (hideEnd - hideStart), 0, 1);
        instructionText.style.opacity = instOp;

        // 각 메세지 요소는 자기 구간에 따라 페이드인
        fadeEls.forEach(el => {
            const from = parseFloat(el.dataset.fadeFrom);
            const to = parseFloat(el.dataset.fadeTo);
            const t = clamp((ratio - from) / (to - from), 0, 1);
            el.style.opacity = t;
        });
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function tick(now) {
        if (isBloomed) return;
        if (!lastTime) lastTime = now;
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;

        const isBlowing = avg > THRESHOLD;
        if (isBlowing) {
            lastBlowAt = now;
            const strength = Math.min(1, (avg - THRESHOLD) / 60);
            video.playbackRate = MIN_RATE + strength * (MAX_RATE - MIN_RATE);
            if (video.paused) {
                const pp = video.play();
                if (pp && pp.catch) pp.catch(() => {});
            }
        } else {
            if (!video.paused) video.pause();
            const next = Math.max(0.01, video.currentTime - REWIND_SPEED * dt);
            try { video.currentTime = next; } catch (e) {}
        }

        // 영상 진행도(0~1) → 메세지 페이드 동기화
        const ratio = videoDuration > 0 ? video.currentTime / videoDuration : 0;
        updateMessageOpacity(ratio);
        updateHint(ratio, isBlowing, now);

        if (videoDuration > 0 && video.currentTime >= videoDuration - 0.05) {
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

        video.pause();
        if (videoDuration > 0) {
            try { video.currentTime = videoDuration - 0.05; } catch (e) {}
        }

        // 안내 완전 사라지고 메세지는 모두 보이도록 고정
        instructionText.style.opacity = 0;
        instructionText.classList.add('hidden');
        setHint('');
        fadeEls.forEach(el => { el.style.opacity = 1; });

        setTimeout(createConfetti, 250);
        // 다시 해보기 버튼은 메세지가 다 뜨고 나서 등장
        setTimeout(() => replayBtn.classList.add('show'), 1400);
    }

    function resetAll() {
        // 상태 초기화
        isBloomed = false;
        lastTime = 0;
        lastBlowAt = 0;
        currentHint = '';

        // UI 초기화
        replayBtn.classList.remove('show');
        fadeEls.forEach(el => { el.style.opacity = 0; });
        setHint('');
        instructionText.classList.remove('hidden');
        instructionText.style.opacity = 1;
        startBtn.classList.remove('hidden');
        const p = document.querySelector('.instruction-text p');
        if (p) p.innerHTML = "소리내어 <strong>'후~'</strong> 불어주세요 🌬️";

        // 영상 초기화
        try { video.pause(); } catch (e) {}
        try { video.currentTime = 0.01; } catch (e) {}
        video.playbackRate = 1;
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
