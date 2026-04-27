# WebPhone - Professional VoIP Client with RingLogix SMS/MMS Integration

A modern, feature-rich web-based phone application built with HTML5, CSS3, and JavaScript. This application provides a complete VoIP solution with WebRTC support, contact management, call history tracking, and integrated SMS/MMS messaging via RingLogix API.

## Features

### 🎯 Core Functionality
- **Modern Phone Interface**: Clean, intuitive dialer with DTMF tone generation
- **Call Management**: Make, receive, and manage calls with timer and status indicators
- **WebRTC Integration**: Real-time audio communication using WebRTC technology
- **SIP Protocol Support**: Ready for SIP server integration (configuration required)

### 📱 Messaging System
- **SMS/MMS Support**: Send text and multimedia messages via RingLogix API
- **File Attachments**: Support for images (JPEG, PNG, GIF) and documents (PDF, DOC, DOCX, TXT)
- **Conversation View**: Threaded messaging interface with contact integration
- **Message Status**: Real-time delivery confirmation and error handling
- **API Integration**: Full RingLogix API compliance with bearer token authentication

### 👥 Contact Management
- **Contact List**: Store and organize contacts with names, numbers, and emails
- **Search Functionality**: Quick contact search and filtering
- **Click-to-Call**: Initiate calls directly from contact list
- **Import/Export**: Local storage based contact management

### 📞 Call Features
- **Call History**: Detailed log of incoming, outgoing, and missed calls
- **Voicemail Support**: Visual voicemail with playback controls
- **In-Call Controls**: Mute, speaker, recording, and DTMF keypad
- **Call Timer**: Real-time call duration tracking

### ⚙️ Settings & Configuration
- **Audio Device Selection**: Choose microphone and speaker devices
- **SIP Configuration**: Server settings for VoIP integration
- **RingLogix API Settings**: Configure API token, user, domain, and phone number
- **User Preferences**: Customizable application settings
- **Local Storage**: Persistent settings and data

### 🔧 Technical Features
- **Offline Support**: Service worker for offline functionality
- **Keyboard Shortcuts**: Productivity shortcuts for common actions
- **Audio Feedback**: DTMF tone generation for tactile feedback
- **Error Handling**: Robust error management and user feedback
- **PWA Support**: Installable as a desktop application

## RingLogix API Integration

### Configuration

To enable SMS/MMS functionality, configure the RingLogix API settings in the **Settings** tab:

1. **API Token**: Your RingLogix API bearer token
2. **API User**: Your RingLogix username  
3. **API Domain**: Your RingLogix domain
4. **Your Phone Number**: The phone number to send messages from

### API Endpoint

The application uses the RingLogix API endpoint:
```
POST https://api.ringlogix.com/pbx/v1/
```

### Message Format

The API integration follows the RingLogix specification:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -X POST "https://api.ringlogix.com/pbx/v1/" \
     -F object=message \
     -F action=create \
     -F user=YOUR_USER \
     -F domain=YOUR_DOMAIN \
     -F type=sms|mms \
     -F from_num=YOUR_NUMBER \
     -F destination=RECIPIENT_NUMBER \
     -F message="Your message here" \
     -F mime_type=image/jpeg \
     -F size=FILE_SIZE \
     -F file=@/PATH/TO/FILE
```

### Reading Messages

To read messages from the RingLogix API, the application provides both manual and automatic sync:

#### Manual Sync
1. Navigate to the **Messages** tab
2. Click the **Sync** button to fetch latest messages
3. Messages will be automatically organized into conversations
4. New messages will be marked as unread

#### Automatic Sync
- Messages automatically sync when the app starts (if API is configured)
- Periodic sync runs every 5 minutes
- Sync only occurs when API credentials are properly configured

#### API Parameters
The `readRingLogixMessages` function supports these parameters:

```javascript
const messages = await webPhone.readRingLogixMessages({
    domain: 'your_domain',           // Domain name
    user: 'your_user',              // Username
    attendee_id: 'attendee_id',     // Attendee ID (optional)
    session_id: 'conversation_id',   // Session ID for specific conversation
    id: 'message_id',              // Specific message ID
    start: '0',                    // Offset from beginning (default: 0)
    start_timestamp: '2021-04-27 22:55:41', // Start timestamp
    limit: '50',                   // Number of messages to return
    order: 'time_start ASC'        // Sort order (default: time_start ASC)
});
```

#### Supported Features
- **Message Types**: SMS and MMS messages
- **Direction Detection**: Automatically identifies incoming vs outgoing messages
- **Conversation Organization**: Groups messages by phone number/contact
- **Time Formatting**: Smart time display (Just now, 2m ago, 1h ago, etc.)
- **Duplicate Prevention**: Prevents importing the same message multiple times
- **Unread Counting**: Tracks unread message counts per conversation

## Installation

### Local Development
1. Clone or download project files
2. Serve files using a local web server (required for WebRTC)
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using PHP
   php -S localhost:8000
   ```
3. Open `http://localhost:8000` in your browser
4. Configure RingLogix API settings in the Settings tab

### Production Deployment
1. Upload files to your web server
2. Configure HTTPS (required for WebRTC)
3. Set up SIP server integration
4. Configure RingLogix API credentials
5. Set up audio devices and permissions

## Usage

### Sending Messages
1. Navigate to the **Messages** tab
2. Click **New Message**
3. Enter recipient phone number or select from contacts
4. Type your message (up to 1600 characters for SMS)
5. Optionally attach files for MMS
6. Click **Send**
7. Monitor delivery status in real-time

### Making Calls
1. Navigate to the **Keypad** tab
2. Enter phone number using keypad or type it directly
3. Click **Call** button or press Enter
4. Use in-call controls for mute, speaker, and DTMF tones
5. Click **Hang Up** to end call

### Managing Contacts
1. Navigate to Contacts tab
2. Click "Add Contact" to create new contacts
3. Use search bar to find specific contacts
4. Click on any contact to call them directly

### Call History
1. View History tab for all call records
2. Click on any entry to call back
3. Use "Clear History" to remove all records

### Configuration
1. Open Settings tab
2. Configure SIP credentials for VoIP calls
3. Set up RingLogix API credentials for messaging
4. Choose audio devices and preferences
5. Configure voicemail and answering rules
6. Click **Save All Settings**

### Keyboard Shortcuts
- **0-9**: Dial corresponding number
- **Backspace**: Delete last digit
- **Enter**: Make call
- **Escape**: End call
- **Ctrl+M**: Toggle mute (during call)
- **Ctrl+S**: Toggle speaker (during call)

## Browser Compatibility

### Supported Browsers
- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

### Required Features
- WebRTC support
- MediaDevices API
- Local Storage
- Service Worker (for PWA features)

## Security Considerations

### HTTPS Requirement
WebRTC requires HTTPS in production environments. For local development, HTTP is allowed.

### Permissions
The application requires:
- Microphone access (for calls)
- Local storage (for contacts and settings)
- Notifications (for incoming calls)

## Development

### File Structure
```
webphone/
├── index.html          # Main application HTML
├── style.css           # Application styles
├── script.js           # Main JavaScript functionality
├── manifest.json       # PWA manifest
├── sw.js              # Service worker
└── README.md          # This file
```

### Architecture
- **Modular Design**: Organized JavaScript classes and functions
- **Event-Driven**: Comprehensive event handling system
- **Responsive UI**: Mobile-first CSS design
- **Progressive Enhancement**: Works without JavaScript (basic functionality)

### Customization
- Modify `style.css` for visual customization
- Update `script.js` for additional features
- Configure `manifest.json` for PWA settings

## Integration

### SIP Providers
Compatible with most SIP providers that support WebRTC:
- Asterisk
- FreeSWITCH
- Kamailio
- Commercial VoIP services

### API Integration
The application can be extended with:
- CRM integration
- Call recording services
- Analytics and reporting
- Custom authentication

## Troubleshooting

### Common Issues

**No Audio During Calls**
- Check microphone permissions in browser settings
- Verify audio device selection in Settings
- Ensure HTTPS is enabled in production

**WebRTC Connection Failed**
- Verify network connectivity
- Check firewall settings
- Confirm SIP server configuration

**Contacts Not Saving**
- Ensure local storage is enabled
- Check browser storage settings
- Clear browser cache if needed

**PWA Installation Issues**
- Verify service worker is registered
- Check manifest.json configuration
- Ensure HTTPS is enabled

## License

This project is provided as-is for educational and development purposes. Please ensure compliance with your VoIP provider's terms of service.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Verify browser compatibility
3. Test with different audio devices
4. Review browser console for errors

## Future Enhancements

### Planned Features
- Video calling support
- Screen sharing
- Call transfer
- Conference calling
- Advanced analytics
- CRM integrations
- Mobile app versions

### Technical Improvements
- Enhanced WebRTC implementation
- Better error handling
- Performance optimizations
- Additional themes
- Accessibility improvements

---

**WebPhone** - Transform your browser into a professional VoIP communication tool.
