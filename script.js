// WebPhone Application JavaScript
class WebPhone {
    constructor() {
        this.currentNumber = '';
        this.callActive = false;
        this.callTimer = null;
        this.callStartTime = null;
        this.muted = false;
        this.speakerOn = false;
        this.recording = false;
        this.contacts = this.loadContacts();
        this.callHistory = this.loadCallHistory();
        this.voicemails = this.loadVoicemails();
        this.settings = this.loadSettings();
        this.userStatus = 'online';
        this.messages = this.loadMessages();
        this.blfMonitors = this.loadBlfMonitors();
        this.conversations = this.loadConversations();
        this.currentConversation = null;
        this.currentTheme = this.settings.theme || 'default';
        this.selectedVoicemail = null;
        this.currentAudio = null;
        
        this.init();
    }

    // PWA Functions
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered successfully:', registration);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New version available
                            this.showUpdateNotification();
                        }
                    });
                });
                
                return registration;
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    showUpdateNotification() {
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = `
            <div class="update-content">
                <i class="fas fa-download"></i>
                <span>New version available!</span>
                <button onclick="this.parentElement.parentElement.remove()">Later</button>
                <button onclick="webPhone.updateApp()">Update Now</button>
            </div>
        `;
        document.body.appendChild(notification);
    }

    async updateApp() {
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
            window.location.reload();
        }
    }

    storeOfflineMessage(messageData) {
        const offlineMessages = JSON.parse(localStorage.getItem('offline_messages') || '[]');
        offlineMessages.push({
            ...messageData,
            timestamp: Date.now(),
            id: `offline_${Date.now()}`
        });
        localStorage.setItem('offline_messages', JSON.stringify(offlineMessages));
    }

    async syncOfflineMessages() {
        const offlineMessages = JSON.parse(localStorage.getItem('offline_messages') || '[]');
        if (offlineMessages.length === 0) return;

        const syncedMessages = [];
        
        for (const message of offlineMessages) {
            try {
                await this.sendRingLogixMessage(message);
                syncedMessages.push(message.id);
            } catch (error) {
                console.error('Failed to sync offline message:', error);
            }
        }
        
        // Remove synced messages
        const remaining = offlineMessages.filter(msg => !syncedMessages.includes(msg.id));
        localStorage.setItem('offline_messages', JSON.stringify(remaining));
        
        if (syncedMessages.length > 0) {
            this.showCallStatus(`Synced ${syncedMessages.length} offline messages`);
        }
    }

    handleURLActions() {
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');
        
        switch (action) {
            case 'new-call':
                this.switchTab('keypad');
                break;
            case 'messages':
                this.switchTab('messages');
                break;
            case 'contacts':
                this.switchTab('contacts');
                break;
            case 'call':
                const number = urlParams.get('number');
                if (number) {
                    document.getElementById('phoneDisplay').value = number;
                    this.switchTab('keypad');
                }
                break;
            case 'sms':
                const smsNumber = urlParams.get('number');
                if (smsNumber) {
                    document.getElementById('messageTo').value = smsNumber;
                    this.switchTab('messages');
                }
                break;
            case 'share':
                this.handleShare(urlParams);
                break;
        }
    }

    handleShare(urlParams) {
        const text = urlParams.get('text') || '';
        const url = urlParams.get('url') || '';
        const title = urlParams.get('title') || '';
        
        const shareContent = [title, text, url].filter(Boolean).join(' ');
        
        if (shareContent) {
            this.switchTab('messages');
            document.getElementById('messageText').value = shareContent;
            this.showCallStatus('Content ready to share via message');
        }
    }

    async requestNotificationPermission() {
        if ('Notification' in navigator && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                this.showCallStatus('Notifications enabled');
            }
        }
    }

    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            this.showCallStatus('Back online - syncing data');
            this.syncOfflineMessages();
        });
        
        window.addEventListener('offline', () => {
            this.showCallStatus('Offline - messages will sync when online');
        });
    }

    async installPWA() {
        let deferredPrompt;
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            // Show install button
            const installBtn = document.createElement('button');
            installBtn.className = 'install-pwa-btn';
            installBtn.innerHTML = '<i class="fas fa-download"></i> Install App';
            installBtn.onclick = async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        this.showCallStatus('App installed successfully');
                    }
                    deferredPrompt = null;
                    installBtn.remove();
                }
            };
            document.body.appendChild(installBtn);
        });
    }

    init() {
        // Initialize PWA features
        this.registerServiceWorker();
        this.handleURLActions();
        this.requestNotificationPermission();
        this.setupNetworkMonitoring();
        this.installPWA();
        
        // Initialize app
        this.bindEvents();
        this.renderContacts();
        this.renderCallHistory();
        this.renderVoicemails();
        this.loadAudioDevices();
        this.setupKeyboardShortcuts();
        this.renderMessages();
        this.renderBlfMonitors();
        this.updateUserStatusDisplay();
        this.loadSettingsTab();
        this.startPeriodicSync();
        this.updateMessageBadge();
        
        // Auto-sync messages on startup if API is configured
        if (this.settings.ringlogixToken && this.settings.ringlogixUser && this.settings.ringlogixDomain) {
            setTimeout(() => {
                this.syncMessagesFromRingLogix();
            }, 2000);
        }
    }

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.switchTab(e));
        });

        // Keypad
        document.querySelectorAll('.key').forEach(key => {
            key.addEventListener('click', (e) => this.handleKeypadPress(e));
        });

        const messageBtn = document.getElementById('messageBtn');
        if (messageBtn) {
            messageBtn.addEventListener('click', () => this.messageFromKeypad());
        }

        const deleteBtn = document.getElementById('deleteBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteDigit());
        }

        document.querySelectorAll('.key-mini').forEach(key => {
            key.addEventListener('click', (e) => this.handleDTMF(e));
        });

        // Call controls
        document.getElementById('callBtn').addEventListener('click', () => this.makeCall());
        document.getElementById('hangupBtn').addEventListener('click', () => this.hangupCall());
        document.getElementById('playVoicemailBtn')?.addEventListener('click', () => this.playSelectedVoicemail());
        document.getElementById('deleteVoicemailBtn')?.addEventListener('click', () => this.deleteSelectedVoicemail());
        document.getElementById('exportVoicemailBtn')?.addEventListener('click', () => this.exportVoicemail());

        // In-call controls
        document.getElementById('muteBtn').addEventListener('click', () => this.toggleMute());
        document.getElementById('speakerBtn').addEventListener('click', () => this.toggleSpeaker());
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('keypadToggleBtn').addEventListener('click', () => this.toggleInCallKeypad());

        // Phone input
        document.getElementById('phoneNumber').addEventListener('input', (e) => {
            this.currentNumber = e.target.value;
        });

        // Header controls
        document.getElementById('minimizeBtn').addEventListener('click', () => this.minimizeApp());
        document.getElementById('maximizeBtn').addEventListener('click', () => this.maximizeApp());
        document.getElementById('closeBtn').addEventListener('click', () => this.closeApp());

        // Chat interface
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendChatMessage();
                }
            });
        }

        const chatSendBtn = document.getElementById('chatSendBtn');
        if (chatSendBtn) {
            chatSendBtn.addEventListener('click', () => this.sendChatMessage());
        }

        const newMessageBtn = document.getElementById('newMessageBtn');
        if (newMessageBtn) {
            newMessageBtn.addEventListener('click', () => this.openNewMessageModal());
        }

        // Message modal
        document.getElementById('closeMessageBtn').addEventListener('click', () => this.closeMessageModal());
        document.getElementById('cancelMessageBtn').addEventListener('click', () => this.closeMessageModal());
        document.getElementById('sendMessageBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('modalSendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('modalAttachBtn').addEventListener('click', () => this.selectFile());
        document.getElementById('modalEmojiBtn').addEventListener('click', () => this.toggleEmojiPicker());

        // Settings tab controls
        document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
        document.getElementById('resetSettingsBtn')?.addEventListener('click', () => this.resetSettings());
        document.getElementById('exportSettingsBtn')?.addEventListener('click', () => this.exportSettings());
        
        // Settings navigation
        document.querySelectorAll('.settings-nav .nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.switchSettingsCategory(e.currentTarget.dataset.category));
        });
        
        // Settings search
        document.getElementById('settingsSearch')?.addEventListener('input', (e) => this.searchSettings(e.target.value));
        
        // Password visibility toggles
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', (e) => this.togglePasswordVisibility(e.currentTarget.dataset.target));
        });
        
        // Range sliders
        document.querySelectorAll('.range-slider').forEach(slider => {
            slider.addEventListener('input', (e) => this.updateRangeValue(e.target));
        });
        
        // Color inputs
        document.querySelectorAll('.color-input input[type="color"]').forEach(colorInput => {
            colorInput.addEventListener('input', (e) => this.updateColorHex(e.target));
        });
        
        document.querySelectorAll('.color-hex').forEach(hexInput => {
            hexInput.addEventListener('input', (e) => this.updateColorPicker(e.target));
        });
        
        // Avatar preview
        document.getElementById('profileAvatar')?.addEventListener('input', (e) => this.updateAvatarPreview(e.target.value));
        
        // Audio test
        document.getElementById('testMicrophoneBtn')?.addEventListener('click', () => this.testMicrophone());
        
        // Theme controls
        document.getElementById('themeSelection').addEventListener('change', (e) => this.handleThemeChange(e));
        document.getElementById('primaryColor').addEventListener('input', (e) => this.updateCustomTheme('primary', e.target.value));
        document.getElementById('secondaryColor').addEventListener('input', (e) => this.updateCustomTheme('secondary', e.target.value));
        document.getElementById('accentColor').addEventListener('input', (e) => this.updateCustomTheme('accent', e.target.value));
        document.getElementById('backgroundColor').addEventListener('input', (e) => this.updateCustomTheme('background', e.target.value));
        document.getElementById('compactMode').addEventListener('change', (e) => this.toggleCompactMode(e.target.checked));
        document.getElementById('animationsEnabled').addEventListener('change', (e) => this.toggleAnimations(e.target.checked));
        document.getElementById('fontSize').addEventListener('change', (e) => this.updateFontSize(e.target.value));
        
        // Profile controls
        document.getElementById('profileName').addEventListener('input', (e) => this.updateProfile('name', e.target.value));
        document.getElementById('profileTitle').addEventListener('input', (e) => this.updateProfile('title', e.target.value));
        document.getElementById('profileEmail').addEventListener('input', (e) => this.updateProfile('email', e.target.value));
        document.getElementById('profileAvatar').addEventListener('input', (e) => this.updateProfile('avatar', e.target.value));
        document.getElementById('profileStatus').addEventListener('input', (e) => this.updateProfile('status', e.target.value));

        // Contacts
        document.getElementById('addContactBtn').addEventListener('click', () => this.openAddContact());
        document.getElementById('contactSearch').addEventListener('input', (e) => this.searchContacts(e.target.value));
        
        // Contact list event delegation for dynamic buttons
        document.getElementById('contactsList').addEventListener('click', (e) => {
            if (e.target.classList.contains('call-contact-btn')) {
                const number = e.target.dataset.number;
                const name = e.target.dataset.name;
                this.callContact(number, name);
            } else if (e.target.classList.contains('message-contact-btn')) {
                const number = e.target.dataset.number;
                const name = e.target.dataset.name;
                this.messageContact(number, name);
            } else if (e.target.classList.contains('edit-contact-btn')) {
                const id = e.target.dataset.id;
                this.editContact(id);
            } else if (e.target.classList.contains('delete-contact-btn')) {
                const id = e.target.dataset.id;
                this.deleteContact(id);
            }
        });

        // History
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearCallHistory());
        document.getElementById('exportHistoryBtn')?.addEventListener('click', () => this.exportCallHistory());

        // Status management
        document.getElementById('statusBtn').addEventListener('click', () => this.toggleStatusMenu());
        document.querySelectorAll('.status-option').forEach(option => {
            option.addEventListener('click', (e) => this.changeUserStatus(e.currentTarget.dataset.status));
        });

        // Status tab quick buttons
        document.querySelectorAll('.status-quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.changeUserStatus(e.currentTarget.dataset.status));
        });

        // Voicemail settings
        
        // File selection
        document.getElementById('selectFileBtn')?.addEventListener('click', () => {
            document.getElementById('fileAttachment').click();
        });
        
        document.getElementById('fileAttachment')?.addEventListener('change', (e) => this.updateFileName(e.target.files[0]));
        
        // Character counter
        document.getElementById('messageText')?.addEventListener('input', (e) => this.updateCharCount(e.target.value));
        
        // Contact suggestions
        document.getElementById('messageTo')?.addEventListener('input', (e) => this.showContactSuggestions(e.target.value));
        document.getElementById('messageTo')?.addEventListener('blur', () => setTimeout(() => this.hideContactSuggestions(), 200));

        // BLF
        document.getElementById('addBlfBtn').addEventListener('click', () => this.openAddBlf());
        document.getElementById('refreshBlfBtn').addEventListener('click', () => this.refreshBlfStatus());
        
        // BLF list event delegation
        document.getElementById('blfList').addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-blf-btn')) {
                const id = e.target.dataset.id;
                this.deleteBlfMonitor(id);
            } else if (e.target.classList.contains('blf-status-indicator')) {
                const id = e.target.dataset.id;
                this.toggleBlfMonitoring(id);
            }
        });
        document.getElementById('cancelBlfBtn').addEventListener('click', () => this.closeBlfModal());
        document.getElementById('saveBlfBtn').addEventListener('click', () => this.saveBlfMonitor());

        // Window controls
        window.addEventListener('beforeunload', () => this.cleanup());

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.status-dropdown')) {
                document.getElementById('statusMenu').classList.remove('show');
            }
        });
    }

    switchTab(e) {
        let tabName;
        
        // Handle both event objects and direct tab name strings
        if (typeof e === 'string') {
            tabName = e;
        } else if (e && e.currentTarget && e.currentTarget.dataset.tab) {
            tabName = e.currentTarget.dataset.tab;
        } else {
            console.error('Invalid tab switch request:', e);
            return;
        }
        
        console.log('Switching to tab:', tabName);
        
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        const targetNavItem = document.querySelector(`[data-tab="${tabName}"]`);
        if (targetNavItem) {
            targetNavItem.classList.add('active');
            console.log('Navigation item found and activated:', targetNavItem);
        } else {
            console.error('Navigation item not found for tab:', tabName);
        }
        
        // Update content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        const targetTab = document.getElementById(`${tabName}-tab`);
        if (targetTab) {
            targetTab.classList.add('active');
            console.log('Tab content found and activated:', targetTab);
        } else {
            console.error('Tab content not found for tab:', tabName);
        }
        
        // Load content based on tab
        switch(tabName) {
            case 'keypad':
                this.loadKeypadTab();
                break;
            case 'messages':
                this.renderMessages();
                break;
            case 'contacts':
                this.renderContacts();
                break;
            case 'settings':
                this.loadSettingsTab();
                break;
        }
    }

    handleKeypadPress(e) {
        const value = e.currentTarget.dataset.value;
        this.addDigit(value);
        this.playTone(value);
    }

    messageFromKeypad() {
        const phoneNumber = document.getElementById('phoneDisplay').value.trim();
        
        if (!phoneNumber) {
            alert('Please enter a phone number');
            return;
        }

        // Switch to messages tab and populate the recipient field
        this.switchTab('messages');
        
        // Wait for tab to switch then populate the message field
        setTimeout(() => {
            const messageTo = document.getElementById('messageTo');
            if (messageTo) {
                messageTo.value = phoneNumber;
                messageTo.focus();
            }
            
            // Open new message modal
            this.openNewMessageModal();
        }, 300);
    }

    loadKeypadTab() {
        // Clear phone display when switching to keypad
        const phoneDisplay = document.getElementById('phoneDisplay');
        if (phoneDisplay) {
            phoneDisplay.value = '';
        }
    }

    addDigit(digit) {
        const phoneDisplay = document.getElementById('phoneDisplay');
        if (phoneDisplay) {
            phoneDisplay.value += digit;
        }
    }

    deleteDigit() {
        const phoneDisplay = document.getElementById('phoneDisplay');
        if (phoneDisplay) {
            phoneDisplay.value = phoneDisplay.value.slice(0, -1);
        }
    }

    playTone(digit) {
        // Create audio context for DTMF tones
        var audioContext = new (window.AudioContext || window.webkitAudioContext)();
        var frequencies = {
            '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
            '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
            '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
            '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
        };

        if (frequencies[digit]) {
            var oscillator1 = audioContext.createOscillator();
            var oscillator2 = audioContext.createOscillator();
            var gainNode = audioContext.createGain();

            oscillator1.frequency.value = frequencies[digit][0];
            oscillator2.frequency.value = frequencies[digit][1];

            oscillator1.connect(gainNode);
            oscillator2.connect(gainNode);
            gainNode.connect(audioContext.destination);

            gainNode.gain.value = 0.1;

            oscillator1.start();
            oscillator2.start();

            setTimeout(function() {
            this.showCallStatus('Please enter a phone number');
            return;
        }

        try {
            this.showCallStatus('Connecting...');
            
            // Simulate call connection
            await this.simulateCallConnection();
            
            this.callActive = true;
            this.callStartTime = Date.now();
            this.startCallTimer();
            
            // Update UI
            document.getElementById('callBtn').style.display = 'none';
            document.getElementById('hangupBtn').style.display = 'flex';
            document.getElementById('callScreen').style.display = 'flex';
            document.getElementById('callNumber').textContent = this.formatPhoneNumber(this.currentNumber);
            
            this.showCallStatus('Call connected');
            
            // Add to call history
            this.addToCallHistory(this.currentNumber, 'outgoing', 'connected');
            
            // Start WebRTC connection (placeholder)
            this.initiateWebRTC();
            
        } catch (error) {
            this.showCallStatus('Call failed');
            console.error('Call error:', error);
        }
    }

    hangupCall() {
        if (!this.callActive) return;

        this.callActive = false;
        this.stopCallTimer();
        
        // Update UI
        document.getElementById('callBtn').style.display = 'flex';
        document.getElementById('hangupBtn').style.display = 'none';
        document.getElementById('callScreen').style.display = 'none';
        document.getElementById('inCallKeypad').style.display = 'none';
        
        // Reset call states
        this.muted = false;
        this.speakerOn = false;
        this.recording = false;
        document.getElementById('muteBtn').classList.remove('active');
        document.getElementById('speakerBtn').classList.remove('active');
        document.getElementById('recordBtn').classList.remove('active');
        
        this.showCallStatus('Call ended');
        
        // Update call history
        this.updateCallHistory(this.currentNumber, 'ended');
        
        // Clear number
        setTimeout(() => {
            this.currentNumber = '';
            document.getElementById('phoneNumber').value = '';
            this.showCallStatus('');
        }, 2000);
        
        // End WebRTC connection
        this.endWebRTC();
    }

    simulateCallConnection() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, 1500); // Simulate connection delay
        });
    }

    startCallTimer() {
        this.callTimer = setInterval(() => {
            const elapsed = Date.now() - this.callStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            document.getElementById('callTimer').textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    stopCallTimer() {
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        const btn = document.getElementById('muteBtn');
        btn.classList.toggle('active', this.muted);
        
        if (this.muted) {
            btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        } else {
            btn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
        
        // Apply to WebRTC audio track
        this.toggleAudioTrack(this.muted);
    }

    toggleSpeaker() {
        this.speakerOn = !this.speakerOn;
        const btn = document.getElementById('speakerBtn');
        btn.classList.toggle('active', this.speakerOn);
        
        // Apply speakerphone mode
        this.toggleSpeakerphone(this.speakerOn);
    }

    toggleRecording() {
        this.recording = !this.recording;
        const btn = document.getElementById('recordBtn');
        btn.classList.toggle('active', this.recording);
        
        if (this.recording) {
            this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    toggleInCallKeypad() {
        const keypad = document.getElementById('inCallKeypad');
        keypad.style.display = keypad.style.display === 'none' ? 'block' : 'none';
    }

    handleDTMF(e) {
        const tone = e.currentTarget.dataset.tone;
        this.playTone(tone);
        this.sendDTMF(tone);
    }

    formatPhoneNumber(number) {
        // Simple phone number formatting
        if (number.length === 10) {
            return `(${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`;
        } else if (number.length === 11 && number[0] === '1') {
            return `+${number[0]} (${number.slice(1, 4)}) ${number.slice(4, 7)}-${number.slice(7)}`;
        }
        return number;
    }

    showCallStatus(message) {
        document.getElementById('callStatus').textContent = message;
    }

    // Contact Management
    loadContacts() {
        const saved = localStorage.getItem('webphone_contacts');
        return saved ? JSON.parse(saved) : this.getDefaultContacts();
    }

    getDefaultContacts() {
        return [
            { id: 1, name: 'John Smith', phone: '5551234567', email: 'john@example.com' },
            { id: 2, name: 'Jane Doe', phone: '5559876543', email: 'jane@example.com' },
            { id: 3, name: 'Bob Johnson', phone: '5554567890', email: 'bob@example.com' }
        ];
    }

    saveContacts() {
        localStorage.setItem('webphone_contacts', JSON.stringify(this.contacts));
    }

    renderContacts() {
        const container = document.getElementById('contactsList');
        container.innerHTML = '';
        
        if (this.contacts.length === 0) {
            container.innerHTML = '<div class="empty-state">No contacts found. Add your first contact!</div>';
            return;
        }
        
        this.contacts.forEach(contact => {
            const item = document.createElement('div');
            item.className = 'contact-item';
            item.innerHTML = `
                <div class="contact-avatar">${contact.name.charAt(0).toUpperCase()}</div>
                <div class="contact-info">
                    <div class="contact-name">${contact.name}</div>
                    <div class="contact-phone">${contact.phone}</div>
                    ${contact.company ? `<div class="contact-company">${contact.company}</div>` : ''}
                </div>
                <div class="contact-actions">
                    <button class="call-contact-btn" data-number="${contact.phone}" data-name="${contact.name}" title="Call">
                        <i class="fas fa-phone"></i>
                    </button>
                    <button class="message-contact-btn" data-number="${contact.phone}" data-name="${contact.name}" title="Message">
                        <i class="fas fa-comment"></i>
                    </button>
                    <button class="edit-contact-btn" data-id="${contact.id}" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-contact-btn" data-id="${contact.id}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            container.appendChild(item);
        });
    }

    searchContacts(query) {
        const filtered = this.contacts.filter(contact => 
            contact.name.toLowerCase().includes(query.toLowerCase()) ||
            contact.phone.includes(query)
        );
        
        const container = document.getElementById('contactsList');
        container.innerHTML = '';
        
        filtered.forEach(contact => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div class="list-item-avatar">${contact.name.charAt(0).toUpperCase()}</div>
                <div class="list-item-info">
                    <div class="list-item-name">${contact.name}</div>
                    <div class="list-item-detail">${contact.phone}</div>
                </div>
                <div class="list-item-action">
                    <i class="fas fa-phone"></i>
                </div>
            `;
            
            item.addEventListener('click', () => {
                this.currentNumber = contact.phone;
                document.getElementById('phoneNumber').value = this.currentNumber;
                this.switchTab('keypad');
            });
            
            container.appendChild(item);
        });
    }

    openAddContact() {
        document.getElementById('addContactModal').style.display = 'flex';
    }

    closeAddContact() {
        document.getElementById('addContactModal').style.display = 'none';
        document.getElementById('contactName').value = '';
        document.getElementById('contactPhone').value = '';
        document.getElementById('contactEmail').value = '';
    }

    async saveContact() {
        const name = document.getElementById('contactName').value.trim();
        const phone = document.getElementById('contactPhone').value.trim();
        const email = document.getElementById('contactEmail').value.trim();
        const company = document.getElementById('contactCompany')?.value.trim() || '';
        const notes = document.getElementById('contactNotes')?.value.trim() || '';
        
        if (!name || !phone) {
            alert('Please fill in name and phone number');
            return;
        }

        try {
            // Split name into first and last name
            const nameParts = name.split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ');

            const contactData = {
                first_name: firstName,
                last_name: lastName,
                phone: phone,
                email: email,
                company: company,
                notes: notes
            };

            // Create contact via RingLogix API
            const result = await this.createRingLogixContact(contactData);

            if (result && result.success) {
                // Add to local contacts for immediate UI update
                const newContact = {
                    id: result.id || Date.now().toString(),
                    name,
                    phone,
                    email,
                    company,
                    notes,
                    createdAt: new Date().toISOString()
                };
                
                this.contacts.push(newContact);
                this.saveContacts();
                this.renderContacts();
                this.closeAddContact();
                this.showCallStatus(`Contact "${name}" added successfully`);
                
                // Sync contacts from API to get latest data
                setTimeout(() => {
                    this.syncContactsFromRingLogix();
                }, 1000);
            } else {
                throw new Error(result.message || 'Failed to save contact');
            }

        } catch (error) {
            console.error('Error saving contact:', error);
            alert(`Failed to save contact: ${error.message}`);
        }
    }

    editContact(id) {
        const contact = this.contacts.find(c => c.id === id);
        if (!contact) return;

        // Populate form with existing data
        document.getElementById('contactName').value = contact.name;
        document.getElementById('contactPhone').value = contact.phone;
        document.getElementById('contactEmail').value = contact.email || '';
        if (document.getElementById('contactCompany')) {
            document.getElementById('contactCompany').value = contact.company || '';
        }
        if (document.getElementById('contactNotes')) {
            document.getElementById('contactNotes').value = contact.notes || '';
        }

        // Change save button to update mode
        const saveBtn = document.getElementById('saveAddContactBtn');
        saveBtn.textContent = 'Update Contact';
        saveBtn.onclick = () => this.updateContact(id);

        document.getElementById('addContactModal').style.display = 'flex';
    }

        if (!name || !phone) {
            this.showMessageStatus('Name and phone are required', 'error');
            return;
        }

        try {
            // Split name into first and last name
            const nameParts = name.split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ');

            const contactData = {
                first_name: firstName,
                last_name: lastName,
                phone: phone,
                email: email,
                company: company,
                notes: notes
            };

            // Create contact via RingLogix API
            const result = await this.createRingLogixContact(contactData);

            if (result && result.success) {
                // Add to local contacts for immediate UI update
                const contact = {
                    id: result.id || Date.now(),
                    name: name,
                    phone: phone,
                    email: email,
                    company: company,
                    notes: notes
                };
    deleteContact(id) {
        const contact = this.contacts.find(c => c.id === id);
        if (!contact) return;

        if (confirm(`Are you sure you want to delete contact "${contact.name}"?`)) {
            this.contacts = this.contacts.filter(c => c.id !== id);
            this.saveContacts();
            this.renderContacts();
            this.showCallStatus(`Contact "${contact.name}" deleted`);
        }
    }

    callContact(number, name) {
        document.getElementById('phoneDisplay').value = number;
        this.switchTab('keypad');
        this.showCallStatus(`Calling ${name}...`);
        setTimeout(() => this.dialNumber(), 500);
    }

    messageContact(number, name) {
        document.getElementById('messageTo').value = number;
        this.switchTab('messages');
        this.showCallStatus(`Messaging ${name}...`);
    }

    // Call History
    loadCallHistory() {
        const saved = localStorage.getItem('webphone_history');
        return saved ? JSON.parse(saved) : [];
    }

    saveCallHistory() {
        localStorage.setItem('webphone_history', JSON.stringify(this.callHistory));
    }

    renderCallHistory() {
        const container = document.getElementById('historyList');
        container.innerHTML = '';
        
        this.callHistory.slice().reverse().forEach(call => {
            const item = document.createElement('div');
            item.className = 'list-item';
            
            const icon = call.type === 'incoming' ? 'fa-phone-alt' : 'fa-phone';
            const color = call.status === 'connected' ? '#4caf50' : '#f44336';
            
            item.innerHTML = `
                <div class="list-item-avatar" style="background: ${color}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="list-item-info">
                    <div class="list-item-name">${this.formatPhoneNumber(call.number)}</div>
                    <div class="list-item-detail">${call.type} • ${call.time} • ${call.duration || '0:00'}</div>
                </div>
                <div class="list-item-action">
                    <i class="fas fa-phone"></i>
                </div>
            `;
            
            item.addEventListener('click', () => {
                this.currentNumber = call.number;
                document.getElementById('phoneNumber').value = this.currentNumber;
                this.switchTab('keypad');
            });
            
            container.appendChild(item);
        });
    }

    addToCallHistory(number, type, status) {
        const call = {
            id: Date.now(),
            number,
            type,
            status,
            time: new Date().toLocaleString(),
            duration: null
        };
        
        this.callHistory.push(call);
        this.saveCallHistory();
        this.renderCallHistory();
    }

    updateCallHistory(number, status) {
        const call = this.callHistory.find(c => c.number === number && !c.duration);
        if (call) {
            call.status = status;
            if (this.callStartTime) {
                const elapsed = Date.now() - this.callStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                call.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
            this.saveCallHistory();
            this.renderCallHistory();
        }
    }

    clearCallHistory() {
        if (confirm('Are you sure you want to clear all call history?')) {
            this.callHistory = [];
            this.saveCallHistory();
            this.renderCallHistory();
            this.showCallStatus('Call history cleared');
        }
    }

    exportCallHistory() {
        if (this.callHistory.length === 0) {
            this.showCallStatus('No call history to export');
            return;
        }

        // Create CSV content
        const headers = ['Date', 'Time', 'From', 'To', 'Duration', 'Type', 'Status'];
        const csvContent = [
            headers.join(','),
            ...this.callHistory.map(call => [
                new Date(call.timestamp).toLocaleDateString(),
                new Date(call.timestamp).toLocaleTimeString(),
                call.from || 'Unknown',
                call.to || 'Unknown',
                call.duration || '0:00',
                call.type || 'Unknown',
                call.status || 'Unknown'
            ].join(','))
        ].join('\n');

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `call-history-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        this.showCallStatus('Call history exported');
    }

    // Voicemail
    loadVoicemails() {
        const saved = localStorage.getItem('webphone_voicemails');
        return saved ? JSON.parse(saved) : this.getDefaultVoicemails();
    }

    getDefaultVoicemails() {
        return [
            {
                id: 1,
                from: 'Unknown',
                number: '5551234567',
                date: '2024-01-15 14:30',
                duration: '0:45',
                new: true
            },
            {
                id: 2,
                from: 'Jane Doe',
                number: '5559876543',
                date: '2024-01-15 10:15',
                duration: '1:23',
                new: true
            },
            {
                id: 3,
                from: 'Bob Johnson',
                number: '5554567890',
                date: '2024-01-14 16:45',
                duration: '0:32',
                new: true
            }
        ];
    }

    saveVoicemails() {
        localStorage.setItem('webphone_voicemails', JSON.stringify(this.voicemails));
    }

    renderVoicemails() {
        const container = document.getElementById('voicemailList');
        container.innerHTML = '';
        
        const newCount = this.voicemails.filter(v => v.new).length;
        document.querySelector('.voicemail-count').textContent = `${newCount} new message${newCount !== 1 ? 's' : ''}`;
        
        this.voicemails.forEach(voicemail => {
            const item = document.createElement('div');
            item.className = 'list-item';
            if (voicemail.new) {
                item.style.borderLeft = '4px solid #4facfe';
            }
            
            item.innerHTML = `
                <div class="list-item-avatar">
                    <i class="fas fa-voicemail"></i>
                </div>
                <div class="list-item-info">
                    <div class="list-item-name">${voicemail.from}</div>
                    <div class="list-item-detail">${voicemail.number} • ${voicemail.date} • ${voicemail.duration}</div>
                </div>
                <div class="list-item-action">
                    <i class="fas fa-play"></i>
                </div>
            `;
            
            item.addEventListener('click', () => {
                this.playVoicemail(voicemail);
            });
            
            container.appendChild(item);
        });
    }

    playVoicemail(voicemail) {
        // Stop any currently playing audio
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        voicemail.new = false;
        this.selectedVoicemail = voicemail;
        this.saveVoicemails();
        this.renderVoicemails();
        
        // Create simulated audio for demo
        this.showCallStatus(`Playing voicemail from ${voicemail.from}...`);
        
        // Simulate audio playback with visual feedback
        this.simulateVoicemailPlayback(voicemail);
    }

    simulateVoicemailPlayback(voicemail) {
        let playbackTime = 0;
        const duration = 5; // 5 second simulation
        
        this.currentAudio = {
            pause: () => {
                this.showCallStatus('Voicemail paused');
            },
            playing: true
        };

        const playbackInterval = setInterval(() => {
            playbackTime++;
            if (playbackTime >= duration) {
                clearInterval(playbackInterval);
                this.currentAudio = null;
                this.showCallStatus('Voicemail playback finished');
                setTimeout(() => this.showCallStatus(''), 2000);
            } else {
                this.showCallStatus(`Playing voicemail... ${playbackTime}s/${duration}s`);
            }
        }, 1000);
    }

    playSelectedVoicemail() {
        if (this.selectedVoicemail) {
            this.playVoicemail(this.selectedVoicemail);
        } else {
            this.showCallStatus('No voicemail selected');
        }
    }

    deleteSelectedVoicemail() {
        if (this.selectedVoicemail) {
            if (confirm(`Delete voicemail from ${this.selectedVoicemail.from}?`)) {
                this.voicemails = this.voicemails.filter(v => v.id !== this.selectedVoicemail.id);
                this.selectedVoicemail = null;
                this.saveVoicemails();
                this.renderVoicemails();
                this.showCallStatus('Voicemail deleted');
            }
        } else {
            this.showCallStatus('No voicemail selected');
        }
    }

    exportVoicemail() {
        if (this.voicemails.length === 0) {
            this.showCallStatus('No voicemails to export');
            return;
        }

        // Create text export of voicemail info
        const voicemailData = this.voicemails.map(vm => ({
            Date: new Date(vm.timestamp).toLocaleString(),
            From: vm.from,
            Number: vm.number,
            Duration: vm.duration,
            'Transcription': vm.transcription || 'Not available'
        }));

        const textContent = voicemailData.map(vm => 
            Object.entries(vm).map(([key, value]) => `${key}: ${value}`).join('\n')
        ).join('\n\n---\n\n');

        const blob = new Blob([textContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `voicemails-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        this.showCallStatus('Voicemail data exported');
    }

    // Settings
    // Theme Management
    handleThemeChange(e) {
        const theme = e.target.value;
        this.applyTheme(theme);
        
        // Show/hide custom theme options
        const customOptions = document.getElementById('customThemeOptions');
        customOptions.style.display = theme === 'custom' ? 'block' : 'none';
        
        this.currentTheme = theme;
        this.settings.theme = theme;
        this.saveSettingsData();
    }
    
    applyTheme(theme) {
        // Remove all theme classes
        document.body.classList.remove('theme-dark', 'theme-green', 'theme-purple', 'theme-orange', 'theme-red', 'theme-teal');
        
        if (theme !== 'default' && theme !== 'custom') {
            document.body.classList.add(`theme-${theme}`);
        }
        
        if (theme === 'custom' && this.settings.customColors) {
            this.applyCustomColors(this.settings.customColors);
        }
    }
    
    updateCustomTheme(type, color) {
        if (!this.settings.customColors) {
            this.settings.customColors = {};
        }
        this.settings.customColors[type] = color;
        this.applyCustomColors(this.settings.customColors);
        this.saveSettingsData();
    }
    
    applyCustomColors(colors) {
        const root = document.documentElement;
        if (colors.primary) root.style.setProperty('--primary-color', colors.primary);
        if (colors.secondary) root.style.setProperty('--secondary-color', colors.secondary);
        if (colors.accent) root.style.setProperty('--accent-color', colors.accent);
        if (colors.background) root.style.setProperty('--background-color', colors.background);
    }
    
    toggleCompactMode(enabled) {
        if (enabled) {
            document.body.classList.add('compact-mode');
        } else {
            document.body.classList.remove('compact-mode');
        }
        this.settings.compactMode = enabled;
        this.saveSettingsData();
    }
    
    toggleAnimations(enabled) {
        if (!enabled) {
            document.body.classList.add('animations-disabled');
        } else {
            document.body.classList.remove('animations-disabled');
        }
        this.settings.animationsEnabled = enabled;
        this.saveSettingsData();
    }
    
    updateFontSize(size) {
        document.body.classList.remove('font-small', 'font-medium', 'font-large', 'font-extra-large');
        document.body.classList.add(`font-${size}`);
        this.settings.fontSize = size;
        this.saveSettingsData();
    }
    
    // Profile Management
    updateProfile(field, value) {
        if (!this.settings.profile) {
            this.settings.profile = {};
        }
        this.settings.profile[field] = value;
        
        // Update header in real-time
        if (field === 'name') {
            document.getElementById('headerUserName').textContent = value || 'User';
            this.updateHeaderAvatar(value);
        } else if (field === 'title') {
            document.getElementById('headerUserTitle').textContent = value || 'Available';
        } else if (field === 'avatar') {
            this.updateHeaderAvatarImage(value);
        }
        
        this.saveSettingsData();
    }
    
    updateHeaderAvatar(name) {
        const initial = document.getElementById('headerAvatarInitial');
        const img = document.getElementById('headerAvatarImg');
        
        if (name && name.trim()) {
            const names = name.trim().split(' ');
            const initials = names.map(n => n.charAt(0).toUpperCase()).join('').substring(0, 2);
            initial.textContent = initials || 'U';
        } else {
            initial.textContent = 'U';
        }
    }
    
    updateHeaderAvatarImage(url) {
        const img = document.getElementById('headerAvatarImg');
        const initial = document.getElementById('headerAvatarInitial');
        
        if (url && this.isValidUrl(url)) {
            img.src = url;
            img.style.display = 'block';
            initial.style.display = 'none';
            
            img.onerror = () => {
                img.style.display = 'none';
                initial.style.display = 'block';
            };
        } else {
            img.style.display = 'none';
            initial.style.display = 'block';
        }
    }
    
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    loadSettings() {
        const saved = localStorage.getItem('webphone_settings');
        return saved ? JSON.parse(saved) : {
            sipUsername: '',
            sipPassword: '',
            sipServer: '',
            microphone: 'default',
            speaker: 'default',
            headset: 'none',
            ringtone: 'default',
            autoAnswer: false,
            answerDelay: 2,
            forwardNumber: '',
            voicemailForward: false,
            dndAction: 'reject',
            blfRefresh: 5,
            blfNotifications: true,
            voicemailGreeting: 'default',
            voicemailMessage: 'Hello, you\'ve reached [Name]. I\'m currently unavailable, but please leave a message after the tone and I\'ll get back to you as soon as possible.',
            voicemailEmail: '',
            voicemailTranscription: false,
            // RingLogix API settings
            ringlogixToken: '097329c4bf8fa11b85a7a8a637f262dd',
            ringlogixUser: 'jrivera@upscevoip.com',
            ringlogixDomain: '280253',
            phoneNumber: '8454442343',
            // Theme settings
            theme: 'default',
            customColors: {},
            compactMode: false,
            animationsEnabled: true,
            fontSize: 'medium',
            // Profile settings
            profile: {
                name: 'John Doe',
                title: 'Available',
                email: '',
                avatar: '',
                status: 'Available for calls'
            }
        };
    }

    saveSettingsData() {
        localStorage.setItem('webphone_settings', JSON.stringify(this.settings));
    }

    loadSettingsTab() {
        // Load current settings into settings tab
        document.getElementById('sipUsername').value = this.settings.sipUsername || '';
        document.getElementById('sipPassword').value = this.settings.sipPassword || '';
        document.getElementById('sipServer').value = this.settings.sipServer || '';
        document.getElementById('microphoneSelect').value = this.settings.microphone || 'default';
        document.getElementById('speakerSelect').value = this.settings.speaker || 'default';
        document.getElementById('headsetSelect').value = this.settings.headset || 'none';
        document.getElementById('ringtoneSelect').value = this.settings.ringtone || 'default';
        document.getElementById('autoAnswer').checked = this.settings.autoAnswer || false;
        document.getElementById('answerDelay').value = this.settings.answerDelay || 2;
        document.getElementById('forwardNumber').value = this.settings.forwardNumber || '';
        document.getElementById('voicemailForward').checked = this.settings.voicemailForward || false;
        document.getElementById('dndAction').value = this.settings.dndAction || 'reject';
        
        // Load RingLogix API settings
        document.getElementById('ringlogixToken').value = this.settings.ringlogixToken || '';
        document.getElementById('ringlogixUser').value = this.settings.ringlogixUser || '';
        document.getElementById('ringlogixDomain').value = this.settings.ringlogixDomain || '';
        document.getElementById('phoneNumber').value = this.settings.phoneNumber || '';
        
        // Load profile settings
        const profile = this.settings.profile || {};
        document.getElementById('profileName').value = profile.name || '';
        document.getElementById('profileTitle').value = profile.title || '';
        document.getElementById('profileEmail').value = profile.email || '';
        document.getElementById('profileAvatar').value = profile.avatar || '';
        document.getElementById('profileStatus').value = profile.status || '';
        
        // Load theme settings
        document.getElementById('themeSelection').value = this.settings.theme || 'default';
        document.getElementById('compactMode').checked = this.settings.compactMode || false;
        document.getElementById('animationsEnabled').checked = this.settings.animationsEnabled !== false;
        document.getElementById('fontSize').value = this.settings.fontSize || 'medium';
        
        // Show/hide custom theme options
        const customOptions = document.getElementById('customThemeOptions');
        customOptions.style.display = this.settings.theme === 'custom' ? 'block' : 'none';
        
        // Load custom colors
        if (this.settings.customColors) {
            document.getElementById('primaryColor').value = this.settings.customColors.primary || '#0084ff';
            document.getElementById('secondaryColor').value = this.settings.customColors.secondary || '#0051d5';
            document.getElementById('accentColor').value = this.settings.customColors.accent || '#4facfe';
            document.getElementById('backgroundColor').value = this.settings.customColors.background || '#ffffff';
        }
        
        document.getElementById('blfRefresh').value = this.settings.blfRefresh || 5;
        document.getElementById('blfNotifications').checked = this.settings.blfNotifications || true;
        
        // Load voicemail settings
        document.getElementById('voicemailGreeting').value = this.settings.voicemailGreeting || 'default';
        document.getElementById('voicemailMessage').value = this.settings.voicemailMessage || 'Hello, you\'ve reached [Name]. I\'m currently unavailable, but please leave a message after the tone and I\'ll get back to you as soon as possible.';
        document.getElementById('voicemailEmail').value = this.settings.voicemailEmail || '';
        document.getElementById('voicemailTranscription').checked = this.settings.voicemailTranscription || false;
        
        // Load headset devices
        this.loadHeadsetDevices();
        
        // Update status display
        this.updateStatusTab();
        
        // Apply current theme
        this.applyTheme(this.settings.theme || 'default');
        
        // Update header with profile info
        this.updateHeaderProfile();
    }

    updateHeaderProfile() {
        const profile = this.settings.profile || {};
        
        // Update header user info
        document.getElementById('headerUserName').textContent = profile.name || 'User';
        document.getElementById('headerUserTitle').textContent = profile.status || 'Available';
        
        // Update avatar
        if (profile.avatar && this.isValidUrl(profile.avatar)) {
            this.updateHeaderAvatarImage(profile.avatar);
        } else {
            this.updateHeaderAvatar(profile.name);
        }
    }

    openSettings() {
        // This is no longer needed since settings is now a tab
        console.log('Settings accessed via tab');
    }

    closeSettings() {
        // This is no longer needed since settings is now a tab
        console.log('Settings tab closed');
    }

    saveSettings() {
        this.settings = {
            sipUsername: document.getElementById('sipUsername').value,
            sipPassword: document.getElementById('sipPassword').value,
            sipServer: document.getElementById('sipServer').value,
            microphone: document.getElementById('microphoneSelect').value,
            speaker: document.getElementById('speakerSelect').value,
            headset: document.getElementById('headsetSelect').value,
            ringtone: document.getElementById('ringtoneSelect').value,
            autoAnswer: document.getElementById('autoAnswer').checked,
            answerDelay: parseInt(document.getElementById('answerDelay').value),
            forwardNumber: document.getElementById('forwardNumber').value,
            voicemailForward: document.getElementById('voicemailForward').checked,
            dndAction: document.getElementById('dndAction').value,
            blfRefresh: parseInt(document.getElementById('blfRefresh').value),
            blfNotifications: document.getElementById('blfNotifications').checked,
            voicemailGreeting: document.getElementById('voicemailGreeting').value,
            voicemailMessage: document.getElementById('voicemailMessage').value,
            voicemailEmail: document.getElementById('voicemailEmail').value,
            voicemailTranscription: document.getElementById('voicemailTranscription').checked,
            // RingLogix API settings
            ringlogixToken: document.getElementById('ringlogixToken').value,
            ringlogixUser: document.getElementById('ringlogixUser').value,
            ringlogixDomain: document.getElementById('ringlogixDomain').value,
            phoneNumber: document.getElementById('phoneNumber').value,
            // Profile settings
            profile: {
                name: document.getElementById('profileName').value,
                title: document.getElementById('profileTitle').value,
                email: document.getElementById('profileEmail').value,
                avatar: document.getElementById('profileAvatar').value,
                status: document.getElementById('profileStatus').value
            },
            // Theme settings
            theme: document.getElementById('themeSelection').value,
            compactMode: document.getElementById('compactMode').checked,
            animationsEnabled: document.getElementById('animationsEnabled').checked,
            fontSize: document.getElementById('fontSize').value,
            customColors: this.settings.customColors || {}
        };
        
        // Save custom colors if custom theme is selected
        if (this.settings.theme === 'custom') {
            this.settings.customColors = {
                primary: document.getElementById('primaryColor').value,
                secondary: document.getElementById('secondaryColor').value,
                accent: document.getElementById('accentColor').value,
                background: document.getElementById('backgroundColor').value
            };
        }
        
        this.saveSettingsData();
        
        // Apply settings
        this.applyAudioSettings();
        this.applyAnsweringRules();
        
        // Apply theme and profile changes
        this.applyTheme(this.settings.theme);
        this.updateHeaderProfile();
        
        // Show confirmation
        this.showCallStatus('Settings saved successfully');
        setTimeout(() => this.showCallStatus(''), 2000);
    }

    async loadAudioDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            const microphoneSelect = document.getElementById('microphoneSelect');
            const speakerSelect = document.getElementById('speakerSelect');
            
            // Clear existing options
            microphoneSelect.innerHTML = '<option value="default">Default Microphone</option>';
            speakerSelect.innerHTML = '<option value="default">Default Speaker</option>';
            
            // Add audio input devices
            devices.filter(device => device.kind === 'audioinput').forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${microphoneSelect.options.length}`;
                microphoneSelect.appendChild(option);
            });
            
            // Add audio output devices
            devices.filter(device => device.kind === 'audiooutput').forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Speaker ${speakerSelect.options.length}`;
                speakerSelect.appendChild(option);
            });
            
        } catch (error) {
            console.error('Error loading audio devices:', error);
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Number keys for dialing
            if (e.key >= '0' && e.key <= '9' && !this.callActive) {
                this.addDigit(e.key);
                this.playTone(e.key);
            }
            
            // Backspace for delete
            if (e.key === 'Backspace' && !this.callActive) {
                this.deleteDigit();
            }
            
            // Enter for call
            if (e.key === 'Enter' && !this.callActive && this.currentNumber) {
                this.makeCall();
            }
            
            // Escape for hangup
            if (e.key === 'Escape' && this.callActive) {
                this.hangupCall();
            }
            
            // Ctrl+M for mute
            if (e.ctrlKey && e.key === 'm' && this.callActive) {
                e.preventDefault();
                this.toggleMute();
            }
            
            // Ctrl+S for speaker
            if (e.ctrlKey && e.key === 's' && this.callActive) {
                e.preventDefault();
                this.toggleSpeaker();
            }
        });
    }

    async loadHeadsetDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const headsetSelect = document.getElementById('headsetSelect');
            
            // Detect headset devices
            const headsets = devices.filter(device => 
                device.label && (
                    device.label.toLowerCase().includes('headset') ||
                    device.label.toLowerCase().includes('headphone') ||
                    device.label.toLowerCase().includes('bluetooth')
                )
            );
            
            if (headsets.length > 0) {
                // Add detected headsets
                headsets.forEach(headset => {
                    const option = document.createElement('option');
                    option.value = headset.deviceId;
                    option.textContent = headset.label;
                    headsetSelect.appendChild(option);
                });
            }
            
        } catch (error) {
            console.error('Error loading headset devices:', error);
        }
    }

    applyAudioSettings() {
        // Apply audio device settings
        console.log('Applied audio settings:', this.settings);
        
        // Apply headset settings
        if (this.settings.headset && this.settings.headset !== 'none') {
            console.log('Using headset:', this.settings.headset);
            // Configure audio to use headset
        }
        
        // Apply ringtone settings
        console.log('Ringtone set to:', this.settings.ringtone);
    }

    loadConversations() {
        const saved = localStorage.getItem('webphone_conversations');
        return saved ? JSON.parse(saved) : {};
    }

    saveConversations() {
        localStorage.setItem('webphone_conversations', JSON.stringify(this.conversations));
    }

    // WebRTC Functions (placeholders for actual implementation)
    async initiateWebRTC() {
        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true, 
                video: false 
            });
            
            // Create peer connection
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            });
            
            // Add audio track
            stream.getAudioTracks().forEach(track => {
                this.peerConnection.addTrack(track, stream);
            });
            
            this.localStream = stream;
            
            // Set up event handlers
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    // Send ICE candidate to signaling server
                    console.log('ICE candidate:', event.candidate);
                }
            };
            
            this.peerConnection.ontrack = (event) => {
                // Handle incoming audio track
                const audio = new Audio();
                audio.srcObject = event.streams[0];
                audio.play();
            };
            
            console.log('WebRTC connection initiated');
            
        } catch (error) {
            console.error('WebRTC initialization failed:', error);
            this.showCallStatus('Audio access denied');
        }
    }

    endWebRTC() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
    }

    toggleAudioTrack(muted) {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !muted;
            });
        }
    }

    toggleSpeakerphone(enabled) {
        // Implementation for speakerphone toggle
        console.log('Speakerphone:', enabled);
    }

    startRecording() {
        // Implementation for call recording
        console.log('Recording started');
    }

    stopRecording() {
        // Implementation for call recording
        console.log('Recording stopped');
    }

    sendDTMF(tone) {
        // Send DTMF tone via WebRTC
        if (this.peerConnection && this.peerConnection.getSenders) {
            const sender = this.peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'audio'
            );
            
            if (sender && sender.dtmf) {
                sender.dtmf.insertDTMF(tone);
            }
        }
    }

    // User Status Management
    toggleStatusMenu() {
        const menu = document.getElementById('statusMenu');
        menu.classList.toggle('show');
    }

    changeUserStatus(status) {
        this.userStatus = status;
        this.updateUserStatusDisplay();
        document.getElementById('statusMenu').classList.remove('show');
        
        // Apply answering rules based on status
        this.applyAnsweringRules();
        
        // Save status
        localStorage.setItem('webphone_status', status);
        
        // Update status tab if it's open
        this.updateStatusTab();
    }

    updateUserStatusDisplay() {
        // Update header status
        const headerStatusText = document.querySelector('.status-text');
        const headerStatusIndicator = document.querySelector('.status-indicator');
        
        headerStatusText.textContent = this.getStatusDisplayName(this.userStatus);
        headerStatusIndicator.className = `status-indicator ${this.userStatus}`;
    }

    getStatusDisplayName(status) {
        const statusNames = {
            'available': 'Available',
            'busy': 'Busy',
            'lunch': 'At Lunch',
            'away': 'Away',
            'meeting': 'In Meeting',
            'dnd': 'Do Not Disturb',
            'offline': 'Offline'
        };
        return statusNames[status] || 'Available';
    }

    updateStatusTab() {
        // Update status tab display
        const currentStatusDisplay = document.getElementById('currentStatusDisplay');
        if (currentStatusDisplay) {
            const statusIndicator = currentStatusDisplay.querySelector('.status-indicator');
            const statusText = currentStatusDisplay.querySelector('.status-text');
            
            statusIndicator.className = `status-indicator ${this.userStatus}`;
            statusText.textContent = this.getStatusDisplayName(this.userStatus);
        }
    }

    applyAnsweringRules() {
        const settings = this.settings;
        
        if (this.userStatus === 'dnd' || this.userStatus === 'meeting' || this.userStatus === 'lunch') {
            const dndAction = settings.dndAction || 'reject';
            
            switch (dndAction) {
                case 'voicemail':
                    // Send to voicemail
                    console.log('DND: Sending to voicemail');
                    break;
                case 'forward':
                    // Forward to configured number
                    if (settings.forwardNumber) {
                        console.log('DND: Forwarding to', settings.forwardNumber);
                    }
                    break;
                default:
                    // Reject call
                    console.log('DND: Rejecting call');
            }
        }
        
        if (settings.autoAnswer && this.userStatus === 'available') {
            console.log('Auto-answer enabled');
            // Implement auto-answer logic
        }
    }

    // Messaging System
    loadMessages() {
        const saved = localStorage.getItem('webphone_messages');
        return saved ? JSON.parse(saved) : this.getDefaultMessages();
    }

    getDefaultMessages() {
        return [
            {
                id: 1,
                contact: 'John Smith',
                number: '5551234567',
                lastMessage: 'Hey, are you available for a quick call?',
                time: '10:30 AM',
                unread: 2,
                avatar: 'J'
            },
            {
                id: 2,
                contact: 'Jane Doe',
                number: '5559876543',
                lastMessage: 'Thanks for the help earlier!',
                time: 'Yesterday',
                unread: 0,
                avatar: 'J'
            }
        ];
    }

    saveMessages() {
        localStorage.setItem('webphone_messages', JSON.stringify(this.messages));
    }

    renderMessages() {
        const container = document.getElementById('conversationList');
        container.innerHTML = '';
        
        if (this.messages.length === 0) {
            container.innerHTML = `
                <div class="chat-empty-state">
                    <i class="fas fa-comments"></i>
                    <h3>No conversations yet</h3>
                    <p>Start a new message to begin chatting</p>
                </div>
            `;
            return;
        }
        
        this.messages.forEach(conversation => {
            const lastMessage = conversation.messages[conversation.messages.length - 1];
            const unreadCount = conversation.messages.filter(m => !m.read && m.type === 'received').length;
            
            const conversationEl = document.createElement('div');
            conversationEl.className = 'conversation-item';
            conversationEl.innerHTML = `
                <div class="conversation-avatar">
                    ${conversation.name.charAt(0).toUpperCase()}
                </div>
                <div class="conversation-info">
                    <div class="conversation-name">${conversation.name}</div>
                    <div class="conversation-last-message">${lastMessage ? lastMessage.text : 'No messages'}</div>
                </div>
                <div class="conversation-meta">
                    <div class="conversation-time">${lastMessage ? this.formatTime(lastMessage.timestamp) : ''}</div>
                    ${unreadCount > 0 ? `<div class="conversation-badge">${unreadCount}</div>` : ''}
                </div>
            `;
            
            conversationEl.addEventListener('click', () => {
                this.openConversation(conversation);
            });
            
            container.appendChild(conversationEl);
        });
        
        this.updateMessageBadge();
    }

    openConversation(conversation) {
        this.currentConversation = conversation;
        
        // Mark all messages as read
        conversation.messages.forEach(message => {
            if (message.type === 'received') {
                message.read = true;
            }
        });
        
        // Update UI
        this.renderMessages();
        this.renderConversationMessages(conversation);
        
        // Update chat header
        document.getElementById('chatContactName').textContent = conversation.name;
        document.getElementById('chatContactStatus').textContent = 'Online';
        document.querySelector('.chat-avatar i').className = 'fas fa-user';
        
        // Clear welcome message
        const welcomeEl = document.querySelector('.chat-welcome');
        if (welcomeEl) {
            welcomeEl.style.display = 'none';
        }
        
        this.saveMessages();
    }

    renderConversationMessages(conversation) {
        const container = document.getElementById('chatMessages');
        container.innerHTML = '';
        
        if (!conversation || !conversation.messages || conversation.messages.length === 0) {
            container.innerHTML = `
                <div class="chat-empty">
                    <p>No messages in this conversation</p>
                </div>
            `;
            return;
        }
        
        conversation.messages.forEach(message => {
            const messageEl = document.createElement('div');
            messageEl.className = `message-bubble ${message.type}`;
            
            messageEl.innerHTML = `
                <div class="message-content">
                    ${message.text}
                    <div class="message-time">${this.formatTime(message.timestamp)}</div>
                </div>
            `;
            
            container.appendChild(messageEl);
        });
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    updateMessageBadge() {
        const unreadCount = this.messages.reduce((total, conversation) => {
            return total + conversation.messages.filter(m => !m.read && m.type === 'received').length;
        }, 0);
        const badge = document.getElementById('messageBadge');
        if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'block' : 'none';
        }
    }

    // Chat input handlers
    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        
        if (!text || !this.currentConversation) return;
        
        const message = {
            id: Date.now(),
            text: text,
            type: 'sent',
            timestamp: new Date().toISOString(),
            read: true
        };
        
        this.currentConversation.messages.push(message);
        this.currentConversation.time = 'Just now';
        this.currentConversation.lastMessage = text;
        
        input.value = '';
        this.renderConversationMessages(this.currentConversation);
        this.renderMessages();
        this.saveMessages();
        
        // Simulate received message after delay
        setTimeout(() => {
            this.simulateReceivedMessage(this.currentConversation);
        }, 2000);
    }

    simulateReceivedMessage(conversation) {
        const responses = [
            "Thanks for your message!",
            "I'll get back to you soon.",
            "Got it, thanks!",
            "Sounds good!",
            "I understand.",
            "No problem!",
            "Absolutely!",
            "Sure thing!",
            "You're welcome!"
        ];
        
        const message = {
            id: Date.now(),
            text: responses[Math.floor(Math.random() * responses.length)],
            type: 'received',
            timestamp: new Date().toISOString(),
            read: false
        };
        
        conversation.messages.push(message);
        conversation.time = 'Just now';
        conversation.lastMessage = message.text;
        
        if (this.currentConversation && this.currentConversation.id === conversation.id) {
            this.renderConversationMessages(conversation);
        }
        
        this.renderMessages();
        this.saveMessages();
        this.updateMessageBadge();
    }

    renderConversationMessages(conversation) {
        const container = document.getElementById('conversationMessages');
        container.innerHTML = '';
        
        const messages = conversation.messages || [
            {
                id: 'default',
                text: conversation.lastMessage,
                sent: false,
                time: conversation.time
            }
        ];
        
        messages.forEach((msg, index) => {
            const bubble = document.createElement('div');
            bubble.className = `message-bubble ${msg.sent ? 'sent' : 'received'}`;
            bubble.dataset.messageId = msg.id || `${conversation.id}-${index}`;
            
            bubble.innerHTML = `
                <div class="message-content">
                    <div class="message-text">${msg.text}</div>
                    <div class="message-time">${msg.time}</div>
                    ${msg.attachment ? `<div class="message-attachment"><i class="fas fa-paperclip"></i> ${msg.attachment}</div>` : ''}
                </div>
                <div class="message-actions">
                    <button class="message-menu-btn" onclick="webPhone.toggleMessageMenu('${msg.id || `${conversation.id}-${index}`}')" title="More options">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="message-menu" id="message-menu-${msg.id || `${conversation.id}-${index}`}">
                        <button class="message-action-btn" onclick="webPhone.saveMessage('${msg.id || `${conversation.id}-${index}`}')" title="Save message">
                            <i class="fas fa-save"></i> Save
                        </button>
                        <button class="message-action-btn" onclick="webPhone.archiveMessage('${msg.id || `${conversation.id}-${index}`}')" title="Archive message">
                            <i class="fas fa-archive"></i> Archive
                        </button>
                        <button class="message-action-btn delete" onclick="webPhone.deleteMessage('${msg.id || `${conversation.id}-${index}`}')" title="Delete message">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(bubble);
        });
        
        container.scrollTop = container.scrollHeight;
    }

    closeConversationModal() {
        document.getElementById('conversationModal').style.display = 'none';
        this.currentConversation = null;
    }

    // Message Actions
    toggleMessageMenu(messageId) {
        const menu = document.getElementById(`message-menu-${messageId}`);
        const allMenus = document.querySelectorAll('.message-menu');
        
        // Close all other menus
        allMenus.forEach(m => {
            if (m !== menu) {
                m.classList.remove('show');
            }
        });
        
        // Toggle current menu
        menu.classList.toggle('show');
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.message-actions')) {
                    menu.classList.remove('show');
                }
            }, { once: true });
        }, 100);
    }

    saveMessage(messageId) {
        const message = this.findMessageById(messageId);
        if (!message) return;

        // Create text content for saving
        const content = `Message from ${message.sent ? 'Me' : 'Other'}\nTime: ${message.time}\nContent: ${message.text}${message.attachment ? `\nAttachment: ${message.attachment}` : ''}`;
        
        // Create and download file
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `message-${messageId.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        this.showCallStatus('Message saved');
        this.closeAllMessageMenus();
    }

    archiveMessage(messageId) {
        const message = this.findMessageById(messageId);
        if (!message) return;

        // Get archived messages from storage
        const archivedMessages = JSON.parse(localStorage.getItem('webphone_archived_messages') || '[]');
        
        // Add to archive with metadata
        const archivedMessage = {
            ...message,
            archivedAt: new Date().toISOString(),
            conversationId: this.currentConversation?.id,
            conversationName: this.currentConversation?.contact
        };
        
        archivedMessages.push(archivedMessage);
        localStorage.setItem('webphone_archived_messages', JSON.stringify(archivedMessages));

        // Remove from current conversation
        this.removeMessageFromConversation(messageId);
        
        this.showCallStatus('Message archived');
        this.closeAllMessageMenus();
    }

    deleteMessage(messageId) {
        const message = this.findMessageById(messageId);
        if (!message) return;

        if (confirm('Are you sure you want to delete this message?')) {
            this.removeMessageFromConversation(messageId);
            this.showCallStatus('Message deleted');
            this.closeAllMessageMenus();
        }
    }

    findMessageById(messageId) {
        if (!this.currentConversation) return null;
        
        const messages = this.currentConversation.messages || [];
        const defaultMessage = {
            id: 'default',
            text: this.currentConversation.lastMessage,
            sent: false,
            time: this.currentConversation.time
        };
        
        const allMessages = messages.length > 0 ? messages : [defaultMessage];
        return allMessages.find(msg => (msg.id || `${this.currentConversation.id}-0`) === messageId);
    }

    removeMessageFromConversation(messageId) {
        if (!this.currentConversation) return;

        if (!this.currentConversation.messages || this.currentConversation.messages.length === 0) {
            // If it's the default message, just clear the conversation
            this.currentConversation.lastMessage = '';
            this.currentConversation.time = '';
        } else {
            // Remove from messages array
            this.currentConversation.messages = this.currentConversation.messages.filter(
                msg => (msg.id || `${this.currentConversation.id}-${this.currentConversation.messages.indexOf(msg)}`) !== messageId
            );
        }

        this.saveMessages();
        this.renderMessages();
        this.renderConversationMessages(this.currentConversation);
    }

    closeAllMessageMenus() {
        document.querySelectorAll('.message-menu').forEach(menu => {
            menu.classList.remove('show');
        });
    }

    // Modern Settings Functions
    switchSettingsCategory(category) {
        // Update navigation
        document.querySelectorAll('.settings-nav .nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
        
        // Update content
        document.querySelectorAll('.settings-category').forEach(cat => {
            cat.classList.remove('active');
        });
        document.getElementById(`${category}-settings`).classList.add('active');
        
        // Clear search
        document.getElementById('settingsSearch').value = '';
        this.searchSettings('');
    }

    searchSettings(query) {
        const lowerQuery = query.toLowerCase();
        const activeCategory = document.querySelector('.settings-nav .nav-item.active').dataset.category;
        const categoryElement = document.getElementById(`${activeCategory}-settings`);
        
        // Search through all setting cards
        categoryElement.querySelectorAll('.setting-card').forEach(card => {
            const cardText = card.textContent.toLowerCase();
            const cardHeader = card.querySelector('.setting-header h4').textContent.toLowerCase();
            
            if (query === '' || cardText.includes(lowerQuery) || cardHeader.includes(lowerQuery)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
        
        // Show no results message if needed
        const visibleCards = categoryElement.querySelectorAll('.setting-card[style="display: block"], .setting-card:not([style*="display: none"])');
        let noResultsMsg = categoryElement.querySelector('.no-results');
        
        if (visibleCards.length === 0 && query !== '') {
            if (!noResultsMsg) {
                noResultsMsg = document.createElement('div');
                noResultsMsg.className = 'no-results';
                noResultsMsg.innerHTML = `
                    <div class="no-results-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h4>No settings found</h4>
                    <p>Try searching with different keywords</p>
                `;
                categoryElement.querySelector('.settings-grid').appendChild(noResultsMsg);
            }
        } else if (noResultsMsg) {
            noResultsMsg.remove();
        }
    }

    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        const button = document.querySelector(`[data-target="${inputId}"]`);
        const icon = button.querySelector('i');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }

    updateRangeValue(slider) {
        const valueDisplay = slider.parentElement.querySelector('.range-value');
        const value = slider.value;
        const unit = slider.id.includes('Delay') || slider.id.includes('Refresh') ? 's' : '';
        valueDisplay.textContent = value + unit;
    }

    updateColorHex(colorInput) {
        const hexInput = colorInput.parentElement.querySelector('.color-hex');
        hexInput.value = colorInput.value.toUpperCase();
    }

    updateColorPicker(hexInput) {
        const colorInput = hexInput.parentElement.querySelector('input[type="color"]');
        if (/^#[0-9A-F]{6}$/i.test(hexInput.value)) {
            colorInput.value = hexInput.value;
        }
    }

    updateAvatarPreview(url) {
        const preview = document.getElementById('avatarPreview');
        if (url) {
            preview.innerHTML = `<img src="${url}" alt="Avatar" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'">`;
        } else {
            preview.innerHTML = '<i class="fas fa-user"></i>';
        }
    }

    async testMicrophone() {
        const button = document.getElementById('testMicrophoneBtn');
        const levelBar = document.getElementById('microphoneLevel').querySelector('.level-bar');
        
        try {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);
            
            analyser.fftSize = 256;
            microphone.connect(analyser);
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            const checkLevel = () => {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                const percentage = (average / 255) * 100;
                levelBar.style.width = percentage + '%';
                
                if (button.disabled && button.innerHTML.includes('Testing')) {
                    requestAnimationFrame(checkLevel);
                }
            };
            
            checkLevel();
            
            // Stop after 5 seconds
            setTimeout(() => {
                stream.getTracks().forEach(track => track.stop());
                audioContext.close();
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-microphone"></i> Test Microphone';
                levelBar.style.width = '0%';
                this.showCallStatus('Microphone test completed');
            }, 5000);
            
        } catch (error) {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-microphone"></i> Test Microphone';
            this.showCallStatus('Microphone access denied');
            console.error('Microphone test error:', error);
        }
    }

    resetSettings() {
        if (confirm('Are you sure you want to reset all settings to default values? This action cannot be undone.')) {
            // Clear localStorage
            localStorage.removeItem('webphone_settings');
            localStorage.removeItem('webphone_contacts');
            localStorage.removeItem('webphone_messages');
            localStorage.removeItem('webphone_call_history');
            localStorage.removeItem('webphone_voicemails');
            localStorage.removeItem('webphone_blf');
            
            // Reload page to reset everything
            window.location.reload();
        }
    }

    exportSettings() {
        const settings = {
            settings: this.settings,
            contacts: this.contacts,
            messages: this.messages,
            callHistory: this.callHistory,
            voicemails: this.voicemails,
            blfMonitors: this.blfMonitors,
            conversations: this.conversations,
            exportedAt: new Date().toISOString(),
            version: '1.0'
        };
        
        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `webphone-settings-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        this.showCallStatus('Settings exported successfully');
    }

    openMessageModal() {
        document.getElementById('messageModal').style.display = 'flex';
        this.populateExtensions();
        this.resetMessageForm();
    }

    closeMessageModal() {
        document.getElementById('messageModal').style.display = 'none';
        this.resetMessageForm();
    }

    resetMessageForm() {
        document.getElementById('messageTo').value = '';
        document.getElementById('messageText').value = '';
        document.getElementById('fileAttachment').value = '';
        document.getElementById('fileName').textContent = 'No file selected';
        document.getElementById('messageStatus').style.display = 'none';
        document.getElementById('sendingIndicator').style.display = 'none';
        this.updateCharCount(0);
        this.hideContactSuggestions();
    }

    switchMessageType(type) {
        const smsSection = document.getElementById('smsRecipient');
        const internalSection = document.getElementById('internalRecipient');
        
        if (type === 'sms') {
            smsSection.style.display = 'block';
            internalSection.style.display = 'none';
        } else {
            smsSection.style.display = 'none';
            internalSection.style.display = 'block';
        }
    }

    populateExtensions() {
        const extensionSelect = document.getElementById('extensionTo');
        extensionSelect.innerHTML = '<option value="">Select Extension</option>';
        
        // Add extensions from BLF monitors and contacts
        const extensions = new Set();
        
        // Add from BLF monitors
        this.blfMonitors.forEach(monitor => {
            if (monitor.type === 'extension') {
                extensions.add(monitor.extension);
            }
        });
        
        // Add from contacts
        this.contacts.forEach(contact => {
            if (contact.phone && /^\d+$/.test(contact.phone)) {
                extensions.add(contact.phone);
            }
        });
        
        // Add common extensions
        for (let i = 100; i <= 199; i++) {
            extensions.add(i.toString());
        }
        
        // Sort and add to select
        Array.from(extensions).sort().forEach(ext => {
            const option = document.createElement('option');
            option.value = ext;
            option.textContent = `Extension ${ext}`;
            extensionSelect.appendChild(option);
        });
    }

    showContactSuggestions(query) {
        const suggestionsDiv = document.getElementById('contactSuggestions');
        
        if (query.length < 2) {
            this.hideContactSuggestions();
            return;
        }
        
        const filteredContacts = this.contacts.filter(contact => 
            contact.name.toLowerCase().includes(query.toLowerCase()) ||
            contact.phone.includes(query)
        );
        
        if (filteredContacts.length === 0) {
            this.hideContactSuggestions();
            return;
        }
        
        suggestionsDiv.innerHTML = '';
        filteredContacts.forEach(contact => {
            const suggestion = document.createElement('div');
            suggestion.className = 'contact-suggestion';
            suggestion.innerHTML = `
                <strong>${contact.name}</strong> - ${contact.phone}
                ${contact.email ? `<br><small>${contact.email}</small>` : ''}
            `;
            suggestion.addEventListener('click', () => {
                document.getElementById('messageTo').value = contact.phone;
                this.hideContactSuggestions();
            });
            suggestionsDiv.appendChild(suggestion);
        });
        
        suggestionsDiv.classList.add('show');
    }

    hideContactSuggestions() {
        document.getElementById('contactSuggestions').classList.remove('show');
    }

    updateCharCount(text) {
        const charCount = text.length;
        const counter = document.getElementById('charCount');
        const counterContainer = counter.parentElement;
        
        counter.textContent = charCount;
        
        // Update counter color based on length
        counterContainer.classList.remove('warning', 'error');
        if (charCount > 160) {
            counterContainer.classList.add('error');
        } else if (charCount > 140) {
            counterContainer.classList.add('warning');
        }
    }

    updateFileName(file) {
        const fileNameSpan = document.getElementById('fileName');
        if (file) {
            fileNameSpan.textContent = file.name;
            fileNameSpan.style.fontStyle = 'normal';
            fileNameSpan.style.color = 'var(--text-color)';
        } else {
            fileNameSpan.textContent = 'No file selected';
            fileNameSpan.style.fontStyle = 'italic';
            fileNameSpan.style.color = 'var(--text-secondary)';
        }
    }

    async sendMessage() {
        const messageType = document.getElementById('messageType').value;
        const messageText = document.getElementById('messageText').value.trim();
        const fileAttachment = document.getElementById('fileAttachment').files[0];
        
        if (!messageText) {
            this.showMessageStatus('Please enter a message', 'error');
            return;
        }
        
        let recipient;
        if (messageType === 'sms') {
            recipient = document.getElementById('messageTo').value.trim();
            if (!recipient) {
                this.showMessageStatus('Please enter a phone number', 'error');
                return;
            }
        } else {
            recipient = document.getElementById('extensionTo').value;
            if (!recipient) {
                this.showMessageStatus('Please select an extension', 'error');
                return;
            }
        }
        
        // Show sending status
        this.showMessageStatus('Sending message...', 'sending');
        document.getElementById('sendingIndicator').style.display = 'inline-block';
        
        try {
            if (messageType === 'sms') {
                await this.sendSMSMessage(recipient, messageText, fileAttachment);
            } else {
                await this.sendInternalMessage(recipient, messageText, fileAttachment);
            }
            
            this.showMessageStatus('Message sent successfully', 'success');
            setTimeout(() => {
                this.closeMessageModal();
                this.showCallStatus('Message sent');
            }, 1500);
            
        } catch (error) {
            console.error('Send message error:', error);
            this.showMessageStatus('Failed to send message', 'error');
        } finally {
            document.getElementById('sendingIndicator').style.display = 'none';
        }
    }

    async sendSMSMessage(to, message, attachment) {
        // Simulate SMS sending via RingLogix API
        const messageData = {
            fromNum: this.settings.phoneNumber || '5551234567',
            destination: to,
            message: message,
            type: attachment ? 'mms' : 'sms'
        };
        
        if (attachment) {
            messageData.attachment = attachment.name;
            messageData.mime_type = attachment.type;
        }
        
        await this.sendRingLogixMessage(messageData);
        
        // Add to local messages
        this.addMessageToHistory(to, message, true, attachment);
    }

    async sendInternalMessage(extension, message, attachment) {
        // Simulate internal PBX message
        const internalMessage = {
            id: Date.now().toString(),
            from: this.settings.sipUsername || 'Current User',
            to: extension,
            message: message,
            timestamp: new Date().toISOString(),
            type: 'internal',
            attachment: attachment ? {
                name: attachment.name,
                type: attachment.type
            } : null
        };
        
        // Store internal message
        const internalMessages = JSON.parse(localStorage.getItem('webphone_internal_messages') || '[]');
        internalMessages.push(internalMessage);
        localStorage.setItem('webphone_internal_messages', JSON.stringify(internalMessages));
        
        // Simulate delivery confirmation
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Add to local history
        this.addMessageToHistory(`Extension ${extension}`, message, true, attachment, 'internal');
    }

    addMessageToHistory(to, message, sent, attachment, type = 'sms') {
        const existingConversation = this.messages.find(conv => 
            conv.number === to || conv.contact === to
        );
        
        if (existingConversation) {
            if (!existingConversation.messages) {
                existingConversation.messages = [];
            }
            
            existingConversation.messages.push({
                id: Date.now().toString(),
                text: message,
                sent: sent,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                attachment: attachment ? attachment.name : null,
                type: type
            });
            
            existingConversation.lastMessage = message;
            existingConversation.time = 'Just now';
        } else {
            const newConversation = {
                id: Date.now().toString(),
                contact: to,
                number: to,
                lastMessage: message,
                time: 'Just now',
                unread: 0,
                avatar: to.charAt(0).toUpperCase(),
                messages: [{
                    id: Date.now().toString(),
                    text: message,
                    sent: sent,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    attachment: attachment ? attachment.name : null,
                    type: type
                }]
            };
            
            this.messages.unshift(newConversation);
        }
        
        this.saveMessages();
        this.renderMessages();
    }

    showMessageStatus(message, type) {
        const statusDiv = document.getElementById('messageStatus');
        statusDiv.textContent = message;
        statusDiv.className = `message-status ${type}`;
        statusDiv.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        }
    }

    // RingLogix API Integration
    async readRingLogixMessages(params = {}) {
        try {
            const token = this.settings.ringlogixToken;
            if (!token) {
                throw new Error('RingLogix API token is not set.');
            }

            // Build query parameters
            const queryParams = new URLSearchParams();
            queryParams.append('object', 'message');
            queryParams.append('action', 'read');
            
            // Optional parameters
            if (this.settings.ringlogixDomain) {
                queryParams.append('domain', this.settings.ringlogixDomain);
            }
            if (this.settings.ringlogixUser) {
                queryParams.append('user', this.settings.ringlogixUser);
            }
            if (params.attendee_id) {
                queryParams.append('attendee_id', params.attendee_id);
            }
            if (params.session_id) {
                queryParams.append('session_id', params.session_id);
            }
            if (params.id) {
                queryParams.append('id', params.id);
            }
            if (params.start) {
                queryParams.append('start', params.start);
            }
            if (params.start_timestamp || params.startTimestamp) {
                queryParams.append('start_timestamp', params.start_timestamp || params.startTimestamp);
            }
            if (params.limit) {
                queryParams.append('limit', params.limit);
            }
            if (params.order) {
                queryParams.append('order', params.order);
            }

            const url = `https://api.ringlogix.com/pbx/v1/?${queryParams.toString()}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error reading RingLogix messages:', error);
            throw error;
        }
    }

    async deleteRingLogixMessage(messageId, sessionId = null) {
        try {
            const token = this.settings.ringlogixToken;
            if (!token) {
                throw new Error('RingLogix API token is not set.');
            }

            const formData = new FormData();
            formData.append('object', 'message');
            formData.append('action', 'delete');
            
            // Required parameters
            if (this.settings.ringlogixDomain) {
                formData.append('domain', this.settings.ringlogixDomain);
            }
            
            // Message ID or session ID
            if (messageId) {
                formData.append('id', messageId);
            }
            if (sessionId) {
                formData.append('session_id', sessionId);
            }

            const response = await fetch('https://api.ringlogix.com/pbx/v1/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error deleting RingLogix message:', error);
            throw error;
        }
    }

    async readRingLogixContacts(params = {}) {
        try {
            const token = this.settings.ringlogixToken;
            if (!token) {
                throw new Error('RingLogix API token is not set.');
            }

            // Build query parameters
            const queryParams = new URLSearchParams();
            queryParams.append('object', 'contact');
            queryParams.append('action', 'read');
            
            // Optional parameters
            if (this.settings.ringlogixDomain) {
                queryParams.append('domain', this.settings.ringlogixDomain);
            }
            if (this.settings.ringlogixUser) {
                queryParams.append('user', this.settings.ringlogixUser);
            }
            if (params.id) {
                queryParams.append('id', params.id);
            }
            if (params.search) {
                queryParams.append('search', params.search);
            }
            if (params.limit) {
                queryParams.append('limit', params.limit);
            }
            if (params.start) {
                queryParams.append('start', params.start);
            }

            const url = `https://api.ringlogix.com/pbx/v1/?${queryParams.toString()}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error reading RingLogix contacts:', error);
            throw error;
        }
    }

    async createRingLogixContact(contactData) {
        try {
            const token = this.settings.ringlogixToken;
            if (!token) {
                throw new Error('RingLogix API token is not set.');
            }

            const formData = new FormData();
            formData.append('object', 'contact');
            formData.append('action', 'create');
            
            // Optional parameters
            if (this.settings.ringlogixDomain) {
                formData.append('domain', this.settings.ringlogixDomain);
            }
            if (this.settings.ringlogixUser) {
                formData.append('user', this.settings.ringlogixUser);
            }
            
            // Contact data
            if (contactData.first_name) {
                formData.append('first_name', contactData.first_name);
            }
            if (contactData.last_name) {
                formData.append('last_name', contactData.last_name);
            }
            if (contactData.phone) {
                formData.append('phone', contactData.phone);
            }
            if (contactData.email) {
                formData.append('email', contactData.email);
            }
            if (contactData.company) {
                formData.append('company', contactData.company);
            }
            if (contactData.notes) {
                formData.append('notes', contactData.notes);
            }

            const response = await fetch('https://api.ringlogix.com/pbx/v1/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error creating RingLogix contact:', error);
            throw error;
        }
    }

    async updateRingLogixContact(contactId, contactData) {
        try {
            const token = this.settings.ringlogixToken;
            if (!token) {
                throw new Error('RingLogix API token is not set.');
            }

            const formData = new FormData();
            formData.append('object', 'contact');
            formData.append('action', 'update');
            
            // Required parameters
            if (this.settings.ringlogixDomain) {
                formData.append('domain', this.settings.ringlogixDomain);
            }
            formData.append('id', contactId);
            
            // Contact data
            if (contactData.first_name) {
                formData.append('first_name', contactData.first_name);
            }
            if (contactData.last_name) {
                formData.append('last_name', contactData.last_name);
            }
            if (contactData.phone) {
                formData.append('phone', contactData.phone);
            }
            if (contactData.email) {
                formData.append('email', contactData.email);
            }
            if (contactData.company) {
                formData.append('company', contactData.company);
            }
            if (contactData.notes) {
                formData.append('notes', contactData.notes);
            }

            const response = await fetch('https://api.ringlogix.com/pbx/v1/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating RingLogix contact:', error);
            throw error;
        }
    }

    async deleteRingLogixContact(contactId) {
        try {
            const token = this.settings.ringlogixToken;
            if (!token) {
                throw new Error('RingLogix API token is not set.');
            }

            const formData = new FormData();
            formData.append('object', 'contact');
            formData.append('action', 'delete');
            
            // Required parameters
            if (this.settings.ringlogixDomain) {
                formData.append('domain', this.settings.ringlogixDomain);
            }
            formData.append('id', contactId);

            const response = await fetch('https://api.ringlogix.com/pbx/v1/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error deleting RingLogix contact:', error);
            throw error;
        }
    }

    async readRingLogixMedia(params = {}) {
        try {
            const token = this.settings.ringlogixToken;
            if (!token) {
                throw new Error('RingLogix API token is not set.');
            }

            // Build query parameters
            const queryParams = new URLSearchParams();
            queryParams.append('object', 'message');
            queryParams.append('action', 'read_media');
            
            // Required parameters
            if (this.settings.ringlogixDomain) {
                queryParams.append('domain', this.settings.ringlogixDomain);
            }
            if (this.settings.ringlogixUser) {
                queryParams.append('user', this.settings.ringlogixUser);
            }
            
            // Optional parameters
            if (params.id) {
                queryParams.append('id', params.id);
            }
            if (params.time) {
                queryParams.append('time', params.time);
            }
            if (params.auth) {
                queryParams.append('auth', params.auth);
            }

            const url = `https://api.ringlogix.com/pbx/v1/?${queryParams.toString()}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error reading RingLogix media:', error);
            throw error;
        }
    }

    async syncContactsFromRingLogix() {
        try {
            this.showCallStatus('Syncing contacts...');
            
            // Read contacts from RingLogix API
            const response = await this.readRingLogixContacts({
                domain: this.settings.ringlogixDomain,
                user: this.settings.ringlogixUser,
                limit: 100 // Get last 100 contacts
            });

            if (response && response.success && response.data) {
                // Update local contacts with API data
                this.contacts = response.data.map(contact => ({
                    id: contact.id,
                    name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
                    phone: contact.phone || '',
                    email: contact.email || '',
                    company: contact.company || '',
                    notes: contact.notes || '',
                    createdAt: contact.created_at || new Date().toISOString()
                }));
                
                this.saveContacts();
                this.renderContacts();
                this.showCallStatus('Contacts synced successfully');
            } else {
                throw new Error(response.message || 'Failed to sync contacts');
            }

        } catch (error) {
            console.error('Error syncing contacts:', error);
            this.showCallStatus(`Failed to sync contacts: ${error.message}`);
        }
    }

    async syncMessagesFromRingLogix() {
        try {
            this.showCallStatus('Syncing messages...');
            
            // Read messages from RingLogix API
            const response = await this.readRingLogixMessages({
                domain: this.settings.ringlogixDomain,
                user: this.settings.ringlogixUser,
                limit: 50, // Get last 50 messages
                order: 'time_start DESC'
            });
            
            if (response && response.data && response.data.length > 0) {
                let newMessagesCount = 0;
                
                // Process each message from API
                response.data.forEach(apiMessage => {
                    const phoneNumber = apiMessage.from_num || apiMessage.destination;
                    const isIncoming = apiMessage.direction === 'in' || apiMessage.from_num !== this.settings.phoneNumber;
                    
                    // Find or create conversation
                    let conversation = this.messages.find(msg => 
                        msg.number === phoneNumber || 
                        msg.contact === apiMessage.contact_name
                    );
                    
                    if (!conversation) {
                        const contact = this.contacts.find(c => c.phone === phoneNumber);
                        conversation = {
                            id: Date.now() + Math.random(),
                            contact: contact ? contact.name : (apiMessage.contact_name || phoneNumber),
                            number: phoneNumber,
                            lastMessage: apiMessage.message,
                            time: this.formatMessageTime(apiMessage.time_start),
                            unread: isIncoming ? 1 : 0,
                            avatar: (contact ? contact.name : (apiMessage.contact_name || phoneNumber)).charAt(0).toUpperCase(),
                            messages: []
                        };
                        this.messages.push(conversation);
                        newMessagesCount++;
                    }
                    
                    // Check if message already exists
                    const existingMessage = conversation.messages && conversation.messages.find(msg => 
                        msg.apiMessageId === apiMessage.id
                    );
                    
                    if (!existingMessage) {
                        const message = {
                            id: apiMessage.id || Date.now().toString(),
                            text: apiMessage.message,
                            sent: !isIncoming,
                            time: this.formatMessageTime(apiMessage.time_start),
                            apiMessageId: apiMessage.id,
                            messageType: apiMessage.type || 'sms'
                        };
                        
                        if (apiMessage.attachment) {
                            message.attachment = apiMessage.attachment;
                            message.attachmentType = apiMessage.mime_type;
                        }
                        
                        if (!conversation.messages) {
                            conversation.messages = [];
                        }
                        
                        conversation.messages.push(message);
                        conversation.lastMessage = apiMessage.message;
                        conversation.time = this.formatMessageTime(apiMessage.time_start);
                        
                        if (isIncoming) {
                            conversation.unread = (conversation.unread || 0) + 1;
                            newMessagesCount++;
                        }
                    }
                });
                
                // Sort conversations by most recent message
                this.messages.sort((a, b) => {
                    const timeA = new Date(a.time);
                    const timeB = new Date(b.time);
                    return timeB - timeA;
                });
                
                this.saveMessages();
                this.renderMessages();
                
                if (newMessagesCount > 0) {
                    this.showCallStatus(`Synced ${newMessagesCount} new messages`);
                } else {
                    this.showCallStatus('Messages synced successfully');
                }
            } else {
                this.showCallStatus('No messages found');
            }
            
            setTimeout(() => this.showCallStatus(''), 3000);
            
        } catch (error) {
            console.error('Error syncing messages:', error);
            this.showCallStatus('Failed to sync messages');
            setTimeout(() => this.showCallStatus(''), 3000);
        }
    }
    
    formatMessageTime(timestamp) {
        if (!timestamp) return 'Unknown';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    }

    async sendRingLogixMessage(messageData) {
        try {
            const token = this.settings.ringlogixToken;
            if (!token) {
                throw new Error('RingLogix API token is not set.');
            }

            const formData = new FormData();
            
            // Required parameters
            formData.append('object', 'message');
            formData.append('action', 'create');
            
            // Optional parameters
            if (this.settings.ringlogixDomain) {
                formData.append('domain', this.settings.ringlogixDomain);
            }
            if (this.settings.ringlogixUser) {
                formData.append('user', this.settings.ringlogixUser);
            }
            
            // Message type (sms, mms, private, group, etc.)
            formData.append('type', messageData.type || 'sms');
            
            // Sender information
            if (messageData.from_num) {
                formData.append('from_num', messageData.from_num);
            }
            
            // Recipient
            if (messageData.destination) {
                formData.append('destination', messageData.destination);
            }
            
            // Message content
            if (messageData.message) {
                formData.append('message', messageData.message);
            }
            
            // MMS specific parameters
            if (messageData.type === 'mms' && messageData.file) {
                formData.append('file', messageData.file);
                if (messageData.mime_type) {
                    formData.append('mime_type', messageData.mime_type);
                }
                if (messageData.size) {
                    formData.append('size', messageData.size);
                }
            }
            
            const response = await fetch('https://api.ringlogix.com/pbx/v1/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error sending RingLogix message:', error);
            throw error;
        }
    }
    
    async sendMessage() {
        const messageType = document.getElementById('messageType').value;
        const to = document.getElementById('messageTo').value.trim();
        const text = document.getElementById('messageText').value.trim();
        const fileInput = document.getElementById('fileAttachment');
        
        if (!to || !text) {
            this.showMessageStatus('Please enter recipient and message', 'error');
            return;
        }

        // Show sending indicator
        const sendBtn = document.getElementById('sendMessageBtn');
        const indicator = document.getElementById('sendingIndicator');
        sendBtn.disabled = true;
        indicator.style.display = 'inline-block';

        try {
            // Prepare message data for RingLogix API
            const messageData = {
                type: messageType, // sms or mms
                destination: to,
                message: text,
                from_num: this.settings.phoneNumber || null
            };

            // Add file data if MMS and file is selected
            if (messageType === 'mms' && fileInput.files && fileInput.files[0]) {
                const file = fileInput.files[0];
                messageData.file = file;
                messageData.mime_type = file.type;
                messageData.size = file.size;
            }

            // Send message via RingLogix API
            const result = await this.sendRingLogixMessage(messageData);

            if (result && result.success) {
                this.showMessageStatus('Message sent successfully!', 'success');
                
                // Clear form
                document.getElementById('messageTo').value = '';
                document.getElementById('messageText').value = '';
                document.getElementById('fileName').textContent = 'No file selected';
                fileInput.value = '';
                
                // Close modal
                message.attachment = fileInput.files[0].name;
                message.attachmentType = fileInput.files[0].type;
            }
            
            if (!conversation.messages) {
                conversation.messages = [];
            }
            conversation.messages.push(message);
            conversation.lastMessage = text;
            conversation.time = 'Just now';
            
            this.saveMessages();
            this.renderMessages();
            this.closeMessageModal();
            
            // Show success message
            statusDiv.className = 'message-status success';
            statusDiv.textContent = `Message sent successfully to ${to}`;
            
            setTimeout(() => {
                this.closeMessageModal();
                this.showCallStatus(`Message sent to ${to}`);
                setTimeout(() => this.showCallStatus(''), 3000);
            }, 1500);
            
        } catch (error) {
            console.error('Failed to send message:', error);
            statusDiv.className = 'message-status error';
            statusDiv.textContent = 'Failed to send message. Please check your API settings and try again.';
            
            // Keep modal open on error
            setTimeout(() => {
                statusDiv.style.display = 'none';
                sendBtn.disabled = false;
                indicator.style.display = 'none';
            }, 5000);
        }
    }

    async sendQuickMessage() {
        const input = document.getElementById('quickMessageText');
        const text = input.value.trim();
        
        if (!text || !this.currentConversation) return;
        
        try {
            // Show sending status
            this.showCallStatus('Sending message...');
            
            // Prepare message data for RingLogix API
            const messageData = {
                fromNum: this.settings.phoneNumber || '5551234567',
                destination: this.currentConversation.number,
                message: text,
                type: 'sms'
            };
            
            // Send via RingLogix API
            await this.sendRingLogixMessage(messageData);
            
            const message = {
                id: Date.now().toString(),
                text: text,
                sent: true,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                apiMessageId: Date.now()
            };
            
            this.currentConversation.messages.push(message);
            this.currentConversation.lastMessage = text;
            this.currentConversation.time = 'Just now';
            
            this.saveMessages();
            this.renderMessages();
            this.renderConversationMessages(this.currentConversation);
            
            input.value = '';
            
            // Show success
            this.showCallStatus('Message sent');
            setTimeout(() => this.showCallStatus(''), 2000);
            
        } catch (error) {
            console.error('Failed to send quick message:', error);
            this.showCallStatus('Failed to send message');
            setTimeout(() => this.showCallStatus(''), 2000);
        }
    }

    // BLF (Busy Lamp Field)
    loadBlfMonitors() {
        const saved = localStorage.getItem('webphone_blf');
        return saved ? JSON.parse(saved) : this.getDefaultBlfMonitors();
    }

    getDefaultBlfMonitors() {
        return [
            {
                id: 1,
                name: 'Alice Johnson',
                extension: '1001',
                type: 'extension',
                status: 'available'
            },
            {
                id: 2,
                name: 'Bob Smith',
                extension: '1002',
                type: 'extension',
                status: 'busy'
            },
            {
                id: 3,
                name: 'Main Queue',
                extension: '200',
                type: 'queue',
                status: 'ringing'
            }
        ];
    }

    saveBlfMonitors() {
        localStorage.setItem('webphone_blf', JSON.stringify(this.blfMonitors));
    }

    renderBlfMonitors() {
        const container = document.getElementById('blfGrid');
        container.innerHTML = '';
        
        this.blfMonitors.forEach(monitor => {
            const item = document.createElement('div');
            item.className = 'blf-monitor';
            item.innerHTML = `
                <button class="blf-remove" onclick="webPhone.removeBlfMonitor(${monitor.id})">
                    <i class="fas fa-times"></i>
                </button>
                <div class="blf-status ${monitor.status}"></div>
                <div class="blf-name">${monitor.name}</div>
                <div class="blf-extension">${monitor.extension}</div>
            `;
            
            item.addEventListener('click', () => {
                this.currentNumber = monitor.extension;
                document.getElementById('phoneNumber').value = this.currentNumber;
                this.switchTab('keypad');
            });
            
            container.appendChild(item);
        });
    }

    startBlfRefresh() {
        // Clear existing interval if any
        if (this.blfRefreshInterval) {
            clearInterval(this.blfRefreshInterval);
        }
        
        const interval = (this.settings.blfRefresh || 5) * 1000;
        this.blfRefreshInterval = setInterval(() => {
            this.refreshBlfMonitors();
        }, interval);
    }

    refreshBlfMonitors() {
        // Simulate BLF status updates
        this.blfMonitors.forEach(monitor => {
            const random = Math.random();
            if (random < 0.1) {
                monitor.status = 'ringing';
            } else if (random < 0.3) {
                monitor.status = 'busy';
            } else {
                monitor.status = 'available';
            }
        });
        
        this.renderBlfMonitors();
        
        if (this.settings.blfNotifications) {
            this.checkBlfNotifications();
        }
    }

    checkBlfNotifications() {
        this.blfMonitors.forEach(monitor => {
            if (monitor.status === 'ringing') {
                this.showCallStatus(`${monitor.name} is ringing...`);
            }
        });
    }

    openBlfModal() {
        document.getElementById('blfModal').style.display = 'flex';
    }

    closeBlfModal() {
        document.getElementById('blfModal').style.display = 'none';
        document.getElementById('blfName').value = '';
        document.getElementById('blfExtension').value = '';
        document.getElementById('blfType').value = 'extension';
    }

    saveBlfMonitor() {
        const name = document.getElementById('blfName').value.trim();
        const extension = document.getElementById('blfExtension').value.trim();
        const type = document.getElementById('blfType').value;
        
        if (!name || !extension) {
            alert('Please fill in all fields');
            return;
        }
        
        const monitor = {
            id: Date.now().toString(),
            name,
            extension,
            type,
            status: 'available',
            lastUpdate: new Date().toISOString(),
            monitoring: true
        };
        
        this.blfMonitors.push(monitor);
        this.saveBlfMonitors();
        this.renderBlfMonitors();
        this.closeBlfModal();
        this.showCallStatus(`BLF monitor "${name}" added`);
        
        // Start monitoring this extension
        this.startBlfMonitoring(monitor.id);
    }

    deleteBlfMonitor(id) {
        const monitor = this.blfMonitors.find(m => m.id === id);
        if (!monitor) return;

        if (confirm(`Remove BLF monitor for "${monitor.name}"?`)) {
            this.blfMonitors = this.blfMonitors.filter(m => m.id !== id);
            this.saveBlfMonitors();
            this.renderBlfMonitors();
            this.showCallStatus(`BLF monitor "${monitor.name}" removed`);
        }
    }

    toggleBlfMonitoring(id) {
        const monitor = this.blfMonitors.find(m => m.id === id);
        if (!monitor) return;

        monitor.monitoring = !monitor.monitoring;
        monitor.lastUpdate = new Date().toISOString();
        
        if (monitor.monitoring) {
            this.startBlfMonitoring(id);
            this.showCallStatus(`Monitoring "${monitor.name}"`);
        } else {
            this.stopBlfMonitoring(id);
            this.showCallStatus(`Stopped monitoring "${monitor.name}"`);
        }
        
        this.saveBlfMonitors();
        this.renderBlfMonitors();
    }

    startBlfMonitoring(id) {
        const monitor = this.blfMonitors.find(m => m.id === id);
        if (!monitor) return;

        // Simulate BLF status updates
        const updateInterval = setInterval(() => {
            if (!monitor.monitoring) {
                clearInterval(updateInterval);
                return;
            }

            // Simulate random status changes for demo
            const statuses = ['available', 'busy', 'away', 'on-call'];
            const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
            
            if (Math.random() > 0.7) { // 30% chance of status change
                monitor.status = randomStatus;
                monitor.lastUpdate = new Date().toISOString();
                this.saveBlfMonitors();
                this.renderBlfMonitors();
                
                // Show notification for status changes
                if (this.settings.blfNotifications) {
                    this.showCallStatus(`${monitor.name} is ${randomStatus}`);
                }
            }
        }, (this.settings.blfRefresh || 5) * 1000);

        monitor.updateInterval = updateInterval;
    }

    stopBlfMonitoring(id) {
        const monitor = this.blfMonitors.find(m => m.id === id);
        if (!monitor || !monitor.updateInterval) return;

        clearInterval(monitor.updateInterval);
        monitor.updateInterval = null;
    }

    refreshBlfStatus() {
        this.showCallStatus('Refreshing BLF status...');
        
        // Refresh all monitors
        this.blfMonitors.forEach(monitor => {
            if (monitor.monitoring) {
                // Simulate immediate status update
                const statuses = ['available', 'busy', 'away', 'on-call'];
                monitor.status = statuses[Math.floor(Math.random() * statuses.length)];
                monitor.lastUpdate = new Date().toISOString();
            }
        });
        
        this.saveBlfMonitors();
        this.renderBlfMonitors();
        this.showCallStatus('BLF status refreshed');
    }

    removeBlfMonitor(id) {
        const monitor = this.blfMonitors.find(m => m.id === id);
        if (monitor && monitor.updateInterval) {
            clearInterval(monitor.updateInterval);
        }
        
        this.blfMonitors = this.blfMonitors.filter(m => m.id !== id);
        this.saveBlfMonitors();
        this.renderBlfMonitors();
    }

    // Voicemail Greeting Functions
    recordVoicemailGreeting() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    this.showCallStatus('Recording greeting...');
                    this.isRecordingGreeting = true;
                    this.greetingRecorder = new MediaRecorder(stream);
                    this.greetingChunks = [];
                    
                    this.greetingRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            this.greetingChunks.push(event.data);
                        }
                    };
                    
                    this.greetingRecorder.onstop = () => {
                        const audioBlob = new Blob(this.greetingChunks, { type: 'audio/wav' });
                        const audioUrl = URL.createObjectURL(audioBlob);
                        this.settings.voicemailGreeting = audioUrl;
                        this.saveSettingsData();
                        this.showCallStatus('Greeting recorded successfully');
                        setTimeout(() => this.showCallStatus(''), 2000);
                    };
                    
                    this.greetingRecorder.start();
                    
                    // Stop recording after 10 seconds
                    setTimeout(() => {
                        if (this.isRecordingGreeting) {
                            this.greetingRecorder.stop();
                            this.isRecordingGreeting = false;
                        }
                    }, 10000);
                })
                .catch(error => {
                    console.error('Error accessing microphone:', error);
                    this.showCallStatus('Error: Cannot access microphone');
                });
        } else {
            this.showCallStatus('Recording not supported in this browser');
        }
    }

    playVoicemailGreeting() {
        if (this.settings.voicemailGreeting && this.settings.voicemailGreeting !== 'default') {
            const audio = new Audio(this.settings.voicemailGreeting);
            audio.play();
            this.showCallStatus('Playing greeting...');
        } else {
            this.showCallStatus('No custom greeting recorded');
        }
    }

    // Window Controls
    minimizeApp() {
        if (window.minimize) {
            window.minimize();
        } else if (document.documentElement.requestFullscreen) {
            // Fallback for browsers that don't support minimize
            document.body.style.display = 'none';
            setTimeout(() => {
                document.body.style.display = 'block';
                this.showCallStatus('App restored');
            }, 100);
        } else {
            this.showCallStatus('Minimize not supported in this browser');
        }
    }

    maximizeApp() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => {
                this.showCallStatus('App maximized');
            }).catch(err => {
                this.showCallStatus('Maximize failed');
            });
        } else {
            document.exitFullscreen().then(() => {
                this.showCallStatus('App restored');
            });
        }
    }

    closeApp() {
        if (confirm('Are you sure you want to close WebPhone?')) {
            // Clean up any ongoing operations
            if (this.callActive) {
                this.hangupCall();
            }
            if (this.messageSyncInterval) {
                clearInterval(this.messageSyncInterval);
            }
            if (this.callTimer) {
                clearInterval(this.callTimer);
            }
            if (this.blfRefreshInterval) {
                clearInterval(this.blfRefreshInterval);
            }
            
            // Clear all BLF monitor intervals
            this.blfMonitors.forEach(monitor => {
                if (monitor.updateInterval) {
                    clearInterval(monitor.updateInterval);
                }
            });
            
            // Close window or navigate away
            if (window.close) {
                window.close();
            } else {
                window.location.href = 'about:blank';
            }
        }
    }

    cleanup() {
        // Clear all intervals
        if (this.messageSyncInterval) {
            clearInterval(this.messageSyncInterval);
        }
        if (this.callTimer) {
            clearInterval(this.callTimer);
        }
        if (this.blfRefreshInterval) {
            clearInterval(this.blfRefreshInterval);
        }
        
        // Clear all BLF monitor intervals
        this.blfMonitors.forEach(monitor => {
            if (monitor.updateInterval) {
                clearInterval(monitor.updateInterval);
            }
        });
    }

    selectFile() {
        document.getElementById('fileAttachment').click();
    }

    toggleEmojiPicker() {
        // Toggle emoji picker visibility
        const emojiPicker = document.getElementById('emojiPicker');
        if (emojiPicker) {
            emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
        }
    }

    openNewMessageModal() {
        const modal = document.getElementById('messageModal');
        const modalOverlay = document.getElementById('modalOverlay');
        
        if (modal) {
            modal.style.display = 'block';
            if (modalOverlay) {
                modalOverlay.style.display = 'block';
            }
            
            // Reset form
            document.getElementById('messageTo').value = '';
            document.getElementById('messageText').value = '';
            document.getElementById('messageType').value = 'sms';
            this.updateCharCount('');
            
            // Focus on recipient field
            setTimeout(() => {
                document.getElementById('messageTo').focus();
            }, 100);
        }
    }

    closeMessageModal() {
        const modal = document.getElementById('messageModal');
        const modalOverlay = document.getElementById('modalOverlay');
        
        if (modal) {
            modal.style.display = 'none';
            if (modalOverlay) {
                modalOverlay.style.display = 'none';
            }
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.webPhone = new WebPhone();
});

// Service Worker for PWA functionality (optional)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
}
