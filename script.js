document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const instructionText = document.getElementById('instructionText');
    const messageText = document.getElementById('messageText');
    const flowerWrapper = document.getElementById('flowerWrapper');
    const audioFeedback = document.getElementById('audioFeedback');
    const audioBar = document.getElementById('audioBar');

    let audioContext;
    let analyser;
    let microphone;
    let isBloomed = false;
    let animationId;

    // 마이크 접근 요청 및 오디오 컨텍스트 설정
    startBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            
            // UI 변경
            startBtn.classList.add('hidden');
            audioFeedback.classList.remove('hidden');
            document.querySelector('.instruction-text p').innerHTML = "화면 가까이 대고<br><strong>'후~'</strong> 불어보세요! 🌬️";
            
            // 상태 체크 시작
            checkAudioLevel();
            
        } catch (err) {
            console.error('마이크 접근 오류:', err);
            alert('마이크 접근이 거부되었거나 지원하지 않는 기기입니다. 마이크 권한을 허용해주세요!');
        }
    });

    function checkAudioLevel() {
        if (isBloomed) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        // 주파수 데이터 가져오기
        analyser.getByteFrequencyData(dataArray);
        
        // 볼륨 평균 계산
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        let average = sum / bufferLength;

        // UI 게이지 업데이트
        const percentage = Math.min(100, (average / 120) * 100); 
        audioBar.style.width = percentage + '%';

        // 볼륨 임계값 (입으로 부는 소리는 저주파 대역이 강하며 볼륨이 크게 잡힘)
        // 100 정도면 마이크 가까이서 불었을 때 충분히 넘어가는 수치
        if (average > 100) {
            triggerBlossom();
            return;
        }

        animationId = requestAnimationFrame(checkAudioLevel);
    }

    function triggerBlossom() {
        isBloomed = true;
        cancelAnimationFrame(animationId);
        
        // 마이크 스트림 종료
        if (microphone && microphone.mediaStream) {
            microphone.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
        }

        // 애니메이션 및 UI 변경
        flowerWrapper.classList.add('is-bloomed');
        instructionText.classList.add('hidden');
        audioFeedback.classList.add('hidden');
        
        // 잠깐 딜레이 후 메세지 표시
        setTimeout(() => {
            messageText.classList.remove('hidden');
            createConfetti();
        }, 800);
    }

    function createConfetti() {
        const colors = ['#e53e3e', '#fc8181', '#f6e05e', '#fed7d7'];
        for(let i = 0; i < 40; i++) {
            const confetti = document.createElement('div');
            confetti.style.position = 'absolute';
            confetti.style.width = Math.random() * 8 + 5 + 'px';
            confetti.style.height = Math.random() * 8 + 5 + 'px';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.top = '-20px';
            
            // 모양 다양화 (동그라미, 네모)
            if (Math.random() > 0.5) confetti.style.borderRadius = '50%';
            
            confetti.style.zIndex = '1';
            confetti.style.animation = `fall ${Math.random() * 3 + 2}s linear forwards`;
            
            document.body.appendChild(confetti);
            
            // 애니메이션 끝나면 DOM에서 제거
            setTimeout(() => {
                confetti.remove();
            }, 5000);
        }
    }
});
