// Property definitions - maps property names to UI display information (as of v3.5.0 eufy-security-client library)
const PROPERTY_DEFINITIONS = {
    // Device Information
    "name": { label: "Name", group: "Device Information", type: "text" },
    "model": { label: "Model", group: "Device Information", type: "text" },
    "serialNumber": { label: "Serial Number", group: "Device Information", type: "text" },
    "hardwareVersion": { label: "Hardware Version", group: "Device Information", type: "text" },
    "softwareVersion": { label: "Software Version", group: "Device Information", type: "text" },
    "type": { label: "Type", group: "Device Information", type: "number" },
    "stationSerialNumber": { label: "Station SN", group: "Device Information", type: "text" },
    "state": { label: "State", group: "Device Information", type: "number" },

    // Battery Information
    "battery": { label: "Battery", group: "Battery Information", type: "number", unit: "%", min: 0, max: 100 },
    "batteryTemperature": { label: "Battery Temperature", group: "Battery Information", type: "number", unit: "°C" },
    "batteryLow": { label: "Battery Low", group: "Battery Information", type: "boolean" },
    "batteryIsCharging": { label: "Is Charging", group: "Battery Information", type: "boolean" },
    "chargingStatus": { label: "Charging Status", group: "Battery Information", type: "number" },
    "lastChargingDays": { label: "Last Charging Days", group: "Battery Information", type: "number" },
    "lastChargingTotalEvents": { label: "Last Charging Total Events", group: "Battery Information", type: "number" },
    "lastChargingRecordedEvents": { label: "Last Charging Recorded Events", group: "Battery Information", type: "number" },
    "lastChargingFalseEvents": { label: "Last Charging False Events", group: "Battery Information", type: "number" },
    "batteryUsageLastWeek": { label: "Battery Usage Last Week", group: "Battery Information", type: "number", unit: "%", min: 0, max: 100 },

    // Network Information
    "wifiRssi": { label: "WiFi RSSI", group: "Network Information", type: "number", unit: "dBm" },
    "wifiSignalLevel": { label: "WiFi Signal Level", group: "Network Information", type: "number", min: 0, max: 4 },
    "cellularRSSI": { label: "Cellular RSSI", group: "Network Information", type: "number", unit: "dBm" },
    "cellularSignalLevel": { label: "Cellular Signal Level", group: "Network Information", type: "number", min: 1, max: 4 },
    "cellularSignal": { label: "Cellular Signal", group: "Network Information", type: "number" },
    "cellularBand": { label: "Cellular Band", group: "Network Information", type: "text" },
    "cellularIMEI": { label: "Cellular IMEI", group: "Network Information", type: "text" },
    "cellularICCID": { label: "Cellular ICCID", group: "Network Information", type: "text" },

    // General Settings
    "enabled": { label: "Enabled", group: "General Settings", type: "boolean" },
    "antitheftDetection": { label: "Antitheft Detection", group: "General Settings", type: "boolean" },
    "statusLed": { label: "Status LED", group: "General Settings", type: "boolean" },
    "powerSource": { label: "Power Source", group: "General Settings", type: "number" },
    "powerWorkingMode": { label: "Power Working Mode", group: "General Settings", type: "number" },
    "watermark": { label: "Watermark", group: "General Settings", type: "number" },

    // Video Settings
    "autoNightvision": { label: "Auto Nightvision", group: "Video Settings", type: "boolean" },
    "nightvision": { label: "Nightvision", group: "Video Settings", type: "number" },
    "videoStreamingQuality": { label: "Streaming Quality", group: "Video Settings", type: "number" },
    "videoRecordingQuality": { label: "Recording Quality", group: "Video Settings", type: "number" },
    "videoWdr": { label: "WDR", group: "Video Settings", type: "boolean" },
    "videoHdr": { label: "HDR", group: "Video Settings", type: "boolean" },
    "videoDistortionCorrection": { label: "Distortion Correction", group: "Video Settings", type: "boolean" },
    "videoRingRecord": { label: "Ring Record", group: "Video Settings", type: "number" },
    "videoNightvisionImageAdjustment": { label: "Nightvision Image Adjustment", group: "Video Settings", type: "boolean" },
    "videoColorNightvision": { label: "Color Nightvision", group: "Video Settings", type: "boolean" },
    "rotationSpeed": { label: "Rotation Speed", group: "Video Settings", type: "number" },
    "imageMirrored": { label: "Image Mirrored", group: "Video Settings", type: "boolean" },
    "flickerAdjustment": { label: "Flicker Adjustment", group: "Video Settings", type: "number" },
    "nightvisionOptimization": { label: "Nightvision Optimization", group: "Video Settings", type: "boolean" },
    "nightvisionOptimizationSide": { label: "Nightvision Optimization Side", group: "Video Settings", type: "number" },

    // Motion Detection
    "motionDetection": { label: "Motion Detection", group: "Motion Detection", type: "boolean" },
    "motionDetectionType": { label: "Detection Type", group: "Motion Detection", type: "number" },
    "motionDetectionSensitivity": { label: "Sensitivity", group: "Motion Detection", type: "number", min: 1, max: 7 },
    "motionDetectionTypeHuman": { label: "Detect Human", group: "Motion Detection", type: "boolean" },
    "motionDetectionTypeHumanRecognition": { label: "Human Recognition", group: "Motion Detection", type: "boolean" },
    "motionDetectionTypePet": { label: "Detect Pet", group: "Motion Detection", type: "boolean" },
    "motionDetectionTypeVehicle": { label: "Detect Vehicle", group: "Motion Detection", type: "boolean" },
    "motionDetectionTypeAllOtherMotions": { label: "Detect All Other Motions", group: "Motion Detection", type: "boolean" },
    "motionDetected": { label: "Motion Detected", group: "Motion Detection", type: "boolean" },
    "motionTracking": { label: "Motion Tracking", group: "Motion Detection", type: "boolean" },
    "motionTrackingSensitivity": { label: "Tracking Sensitivity", group: "Motion Detection", type: "number" },
    "motionAutoCruise": { label: "Auto Cruise", group: "Motion Detection", type: "boolean" },
    "motionOutOfViewDetection": { label: "Out of View Detection", group: "Motion Detection", type: "boolean" },
    "motionDetectionRange": { label: "Detection Range", group: "Motion Detection", type: "boolean" },
    "motionDetectionRangeStandardSensitivity": { label: "Range Standard Sensitivity", group: "Motion Detection", type: "number" },
    "motionDetectionRangeAdvancedLeftSensitivity": { label: "Range Left Sensitivity", group: "Motion Detection", type: "number" },
    "motionDetectionRangeAdvancedMiddleSensitivity": { label: "Range Middle Sensitivity", group: "Motion Detection", type: "number" },
    "motionDetectionRangeAdvancedRightSensitivity": { label: "Range Right Sensitivity", group: "Motion Detection", type: "number" },
    "motionDetectionTestMode": { label: "Test Mode", group: "Motion Detection", type: "boolean" },
    "motionDetectionSensitivityMode": { label: "Sensitivity Mode", group: "Motion Detection", type: "number" },
    "motionDetectionSensitivityStandard": { label: "Sensitivity Standard", group: "Motion Detection", type: "number", min: 1, max: 5 },
    "motionDetectionSensitivityAdvancedA": { label: "Sensitivity Advanced A", group: "Motion Detection", type: "number", min: 1, max: 5 },
    "motionDetectionSensitivityAdvancedB": { label: "Sensitivity Advanced B", group: "Motion Detection", type: "number", min: 1, max: 5 },
    "motionDetectionSensitivityAdvancedC": { label: "Sensitivity Advanced C", group: "Motion Detection", type: "number", min: 1, max: 5 },
    "motionDetectionSensitivityAdvancedD": { label: "Sensitivity Advanced D", group: "Motion Detection", type: "number" },
    "motionDetectionSensitivityAdvancedE": { label: "Sensitivity Advanced E", group: "Motion Detection", type: "number" },
    "motionDetectionSensitivityAdvancedF": { label: "Sensitivity Advanced F", group: "Motion Detection", type: "number" },
    "motionDetectionSensitivityAdvancedG": { label: "Sensitivity Advanced G", group: "Motion Detection", type: "number" },
    "motionDetectionSensitivityAdvancedH": { label: "Sensitivity Advanced H", group: "Motion Detection", type: "number" },
    "motionActivatedPrompt": { label: "Motion Activated Prompt", group: "Motion Detection", type: "boolean" },

    // Detection Events
    "personDetected": { label: "Person Detected", group: "Detection Events", type: "boolean" },
    "personName": { label: "Person Name", group: "Detection Events", type: "text" },
    "identityPersonDetected": { label: "Identity Person Detected", group: "Detection Events", type: "boolean" },
    "strangerPersonDetected": { label: "Stranger Person Detected", group: "Detection Events", type: "boolean" },
    "vehicleDetected": { label: "Vehicle Detected", group: "Detection Events", type: "boolean" },
    "petDetected": { label: "Pet Detected", group: "Detection Events", type: "boolean" },
    "dogDetected": { label: "Dog Detected", group: "Detection Events", type: "boolean" },
    "dogLickDetected": { label: "Dog Lick Detected", group: "Detection Events", type: "boolean" },
    "dogPoopDetected": { label: "Dog Poop Detected", group: "Detection Events", type: "boolean" },
    "radarMotionDetected": { label: "Radar Motion Detected", group: "Detection Events", type: "boolean" },
    "packageDelivered": { label: "Package Delivered", group: "Detection Events", type: "boolean" },
    "packageStranded": { label: "Package Stranded", group: "Detection Events", type: "boolean" },
    "packageTaken": { label: "Package Taken", group: "Detection Events", type: "boolean" },
    "someoneLoitering": { label: "Someone Loitering", group: "Detection Events", type: "boolean" },
    "someoneGoing": { label: "Someone Going", group: "Detection Events", type: "boolean" },

    // Sound Detection
    "petDetection": { label: "Pet Detection", group: "Sound Detection", type: "boolean" },
    "soundDetection": { label: "Sound Detection", group: "Sound Detection", type: "boolean" },
    "soundDetectionType": { label: "Detection Type", group: "Sound Detection", type: "number" },
    "soundDetectionSensitivity": { label: "Sensitivity", group: "Sound Detection", type: "number" },
    "soundDetected": { label: "Sound Detected", group: "Sound Detection", type: "boolean" },
    "cryingDetected": { label: "Crying Detected", group: "Sound Detection", type: "boolean" },
    "soundDetectionRoundLook": { label: "Round Look on Sound", group: "Sound Detection", type: "boolean" },

    // Recording Settings
    "recordingEndClipMotionStops": { label: "End Clip When Motion Stops", group: "Recording Settings", type: "boolean" },
    "recordingClipLength": { label: "Clip Length", group: "Recording Settings", type: "number", unit: "s", min: 5, max: 120 },
    "recordingRetriggerInterval": { label: "Retrigger Interval", group: "Recording Settings", type: "number", unit: "s", min: 5, max: 60 },
    "continuousRecording": { label: "Continuous Recording", group: "Recording Settings", type: "boolean" },
    "continuousRecordingType": { label: "Continuous Recording Type", group: "Recording Settings", type: "number" },
    "videoTypeStoreToNAS": { label: "Store to NAS", group: "Recording Settings", type: "boolean" },

    // Audio Settings
    "microphone": { label: "Microphone", group: "Audio Settings", type: "boolean" },
    "speaker": { label: "Speaker", group: "Audio Settings", type: "boolean" },
    "speakerVolume": { label: "Speaker Volume", group: "Audio Settings", type: "number", min: 0, max: 100 },
    "ringtoneVolume": { label: "Ringtone Volume", group: "Audio Settings", type: "number" },
    "audioRecording": { label: "Audio Recording", group: "Audio Settings", type: "boolean" },
    "sound": { label: "Sound", group: "Audio Settings", type: "number" },
    "alarmVolume": { label: "Alarm Volume", group: "Audio Settings", type: "number", min: 1, max: 26 },
    "promptVolume": { label: "Prompt Volume", group: "Audio Settings", type: "number", min: 0, max: 26 },
    "beepVolume": { label: "Beep Volume", group: "Audio Settings", type: "number", min: 1, max: 26 },

    // Light Settings
    "light": { label: "Light", group: "Light Settings", type: "boolean" },
    "lightSettingsEnable": { label: "Light Enable", group: "Light Settings", type: "boolean" },
    "lightSettingsBrightnessManual": { label: "Brightness Manual", group: "Light Settings", type: "number", min: 0, max: 100 },
    "lightSettingsColorTemperatureManual": { label: "Color Temperature Manual", group: "Light Settings", type: "number", min: 1, max: 100 },
    "lightSettingsBrightnessMotion": { label: "Brightness Motion", group: "Light Settings", type: "number", min: 0, max: 100 },
    "lightSettingsColorTemperatureMotion": { label: "Color Temperature Motion", group: "Light Settings", type: "number", min: 1, max: 100 },
    "lightSettingsBrightnessSchedule": { label: "Brightness Schedule", group: "Light Settings", type: "number", min: 0, max: 100 },
    "lightSettingsColorTemperatureSchedule": { label: "Color Temperature Schedule", group: "Light Settings", type: "number", min: 1, max: 100 },
    "lightSettingsMotionTriggered": { label: "Motion Triggered", group: "Light Settings", type: "boolean" },
    "lightSettingsMotionActivationMode": { label: "Motion Activation Mode", group: "Light Settings", type: "number" },
    "lightSettingsMotionTriggeredDistance": { label: "Motion Triggered Distance", group: "Light Settings", type: "number" },
    "lightSettingsMotionTriggeredTimer": { label: "Motion Triggered Timer", group: "Light Settings", type: "number", unit: "s" },

    // Doorbell Settings
    "chimeIndoor": { label: "Indoor Chime", group: "Doorbell Settings", type: "boolean" },
    "chimeHomebase": { label: "Homebase Chime", group: "Doorbell Settings", type: "boolean" },
    "chimeHomebaseRingtoneVolume": { label: "Homebase Ringtone Volume", group: "Doorbell Settings", type: "number", min: 1, max: 26 },
    "chimeHomebaseRingtoneType": { label: "Homebase Ringtone Type", group: "Doorbell Settings", type: "number" },
    "ringing": { label: "Ringing", group: "Doorbell Settings", type: "boolean" },
    "ringAutoResponse": { label: "Auto Response", group: "Doorbell Settings", type: "boolean" },
    "ringAutoResponseVoiceResponse": { label: "Auto Voice Response", group: "Doorbell Settings", type: "boolean" },
    "ringAutoResponseVoiceResponseVoice": { label: "Voice Response Voice", group: "Doorbell Settings", type: "number" },
    "ringAutoResponseTimeFrom": { label: "Auto Response Time From", group: "Doorbell Settings", type: "text" },
    "ringAutoResponseTimeTo": { label: "Auto Response Time To", group: "Doorbell Settings", type: "text" },

    // Lock Settings
    "locked": { label: "Locked", group: "Lock Settings", type: "boolean" },
    "lockStatus": { label: "Lock Status", group: "Lock Settings", type: "number" },
    "autoLock": { label: "Auto Lock", group: "Lock Settings", type: "boolean" },
    "autoLockTimer": { label: "Auto Lock Timer", group: "Lock Settings", type: "number", unit: "s" },
    "autoLockSchedule": { label: "Auto Lock Schedule", group: "Lock Settings", type: "boolean" },
    "autoLockScheduleStartTime": { label: "Auto Lock Schedule Start", group: "Lock Settings", type: "text" },
    "autoLockScheduleEndTime": { label: "Auto Lock Schedule End", group: "Lock Settings", type: "text" },
    "oneTouchLocking": { label: "One Touch Locking", group: "Lock Settings", type: "boolean" },
    "wrongTryProtection": { label: "Wrong Try Protection", group: "Lock Settings", type: "boolean" },
    "wrongTryAttempts": { label: "Wrong Try Attempts", group: "Lock Settings", type: "number", min: 3, max: 10 },
    "wrongTryLockdownTime": { label: "Wrong Try Lockdown Time", group: "Lock Settings", type: "number", unit: "min" },
    "scramblePasscode": { label: "Scramble Passcode", group: "Lock Settings", type: "boolean" },
    "lockEventOrigin": { label: "Lock Event Origin", group: "Lock Settings", type: "text" },
    "dualUnlock": { label: "Dual Unlock", group: "Lock Settings", type: "boolean" },
    "remoteUnlock": { label: "Remote Unlock", group: "Lock Settings", type: "boolean" },
    "remoteUnlockMasterPIN": { label: "Remote Unlock Master PIN", group: "Lock Settings", type: "boolean" },
    "hasMasterPin": { label: "Has Master PIN", group: "Lock Settings", type: "boolean" },
    "openMethod": { label: "Open Method", group: "Lock Settings", type: "number" },
    "open": { label: "Open", group: "Lock Settings", type: "boolean" },
    "openedByType": { label: "Opened By Type", group: "Lock Settings", type: "text" },
    "openedByName": { label: "Opened By Name", group: "Lock Settings", type: "text" },

    // Notifications
    "notification": { label: "Notification", group: "Notifications", type: "boolean" },
    "notificationType": { label: "Notification Type", group: "Notifications", type: "number" },
    "notificationPerson": { label: "Notify Person", group: "Notifications", type: "boolean" },
    "notificationPet": { label: "Notify Pet", group: "Notifications", type: "boolean" },
    "notificationAllOtherMotion": { label: "Notify All Other Motion", group: "Notifications", type: "boolean" },
    "notificationCrying": { label: "Notify Crying", group: "Notifications", type: "boolean" },
    "notificationAllSound": { label: "Notify All Sound", group: "Notifications", type: "boolean" },
    "notificationIntervalTime": { label: "Notification Interval", group: "Notifications", type: "number", unit: "s" },
    "notificationRing": { label: "Notify Ring", group: "Notifications", type: "boolean" },
    "notificationMotion": { label: "Notify Motion", group: "Notifications", type: "boolean" },
    "notificationRadarDetector": { label: "Notify Radar Detector", group: "Notifications", type: "boolean" },
    "notificationVehicle": { label: "Notify Vehicle", group: "Notifications", type: "boolean" },
    "notificationUnlocked": { label: "Notify Unlocked", group: "Notifications", type: "boolean" },
    "notificationLocked": { label: "Notify Locked", group: "Notifications", type: "boolean" },
    "notificationUnlockByKey": { label: "Notify Unlock By Key", group: "Notifications", type: "boolean" },
    "notificationUnlockByPIN": { label: "Notify Unlock By PIN", group: "Notifications", type: "boolean" },
    "notificationUnlockByFingerprint": { label: "Notify Unlock By Fingerprint", group: "Notifications", type: "boolean" },
    "notificationUnlockByApp": { label: "Notify Unlock By App", group: "Notifications", type: "boolean" },
    "notificationDualUnlock": { label: "Notify Dual Unlock", group: "Notifications", type: "boolean" },
    "notificationDualLock": { label: "Notify Dual Lock", group: "Notifications", type: "boolean" },
    "notificationWrongTryProtect": { label: "Notify Wrong Try Protect", group: "Notifications", type: "boolean" },
    "notificationJammed": { label: "Notify Jammed", group: "Notifications", type: "boolean" },

    // Loitering Detection
    "loiteringDetection": { label: "Loitering Detection", group: "Loitering Detection", type: "boolean" },
    "loiteringDetectionRange": { label: "Detection Range", group: "Loitering Detection", type: "number" },
    "loiteringDetectionLength": { label: "Detection Length", group: "Loitering Detection", type: "number", unit: "s" },
    "loiteringCustomResponsePhoneNotification": { label: "Phone Notification", group: "Loitering Detection", type: "boolean" },
    "loiteringCustomResponseAutoVoiceResponse": { label: "Auto Voice Response", group: "Loitering Detection", type: "boolean" },
    "loiteringCustomResponseAutoVoiceResponseVoice": { label: "Voice Response Voice", group: "Loitering Detection", type: "number" },
    "loiteringCustomResponseHomeBaseNotification": { label: "HomeBase Notification", group: "Loitering Detection", type: "boolean" },
    "loiteringCustomResponseTimeFrom": { label: "Response Time From", group: "Loitering Detection", type: "text" },
    "loiteringCustomResponseTimeTo": { label: "Response Time To", group: "Loitering Detection", type: "text" },

    // Delivery Guard
    "deliveryGuard": { label: "Delivery Guard", group: "Delivery Guard", type: "boolean" },
    "deliveryGuardPackageGuarding": { label: "Package Guarding", group: "Delivery Guard", type: "boolean" },
    "deliveryGuardPackageGuardingVoiceResponseVoice": { label: "Voice Response Voice", group: "Delivery Guard", type: "number" },
    "deliveryGuardPackageGuardingActivatedTimeFrom": { label: "Activated Time From", group: "Delivery Guard", type: "text" },
    "deliveryGuardPackageGuardingActivatedTimeTo": { label: "Activated Time To", group: "Delivery Guard", type: "text" },
    "deliveryGuardUncollectedPackageAlert": { label: "Uncollected Package Alert", group: "Delivery Guard", type: "boolean" },
    "deliveryGuardUncollectedPackageAlertTimeToCheck": { label: "Alert Time To Check", group: "Delivery Guard", type: "text" },
    "deliveryGuardPackageLiveCheckAssistance": { label: "Live Check Assistance", group: "Delivery Guard", type: "boolean" },
    "isDeliveryDenied": { label: "Delivery Denied", group: "Delivery Guard", type: "boolean" },

    // Alerts
    "jammedAlert": { label: "Jammed Alert", group: "Alerts", type: "boolean" },
    "911Alert": { label: "911 Alert", group: "Alerts", type: "boolean" },
    "911AlertEvent": { label: "911 Alert Event", group: "Alerts", type: "boolean" },
    "shakeAlert": { label: "Shake Alert", group: "Alerts", type: "boolean" },
    "shakeAlertEvent": { label: "Shake Alert Event", group: "Alerts", type: "boolean" },
    "lowBatteryAlert": { label: "Low Battery Alert", group: "Alerts", type: "boolean" },
    "longTimeNotCloseAlert": { label: "Long Time Not Close Alert", group: "Alerts", type: "boolean" },
    "wrongTryProtectAlert": { label: "Wrong Try Protect Alert", group: "Alerts", type: "boolean" },
    "leftOpenAlarm": { label: "Left Open Alarm", group: "Alerts", type: "boolean" },
    "leftOpenAlarmDuration": { label: "Left Open Alarm Duration", group: "Alerts", type: "number", unit: "s" },
    "tamperAlarm": { label: "Tamper Alarm", group: "Alerts", type: "number" },
    "tamperingAlert": { label: "Tampering Alert", group: "Alerts", type: "boolean" },
    "lowTemperatureAlert": { label: "Low Temperature Alert", group: "Alerts", type: "boolean" },
    "highTemperatureAlert": { label: "High Temperature Alert", group: "Alerts", type: "boolean" },
    "lidStuckAlert": { label: "Lid Stuck Alert", group: "Alerts", type: "boolean" },
    "pinIncorrectAlert": { label: "PIN Incorrect Alert", group: "Alerts", type: "boolean" },
    "batteryFullyChargedAlert": { label: "Battery Fully Charged Alert", group: "Alerts", type: "boolean" },

    // Sensor Settings
    "sensorOpen": { label: "Sensor Open", group: "Sensor Settings", type: "boolean" },
    "sensorChangeTime": { label: "Sensor Change Time", group: "Sensor Settings", type: "number" },
    "motionSensorPirEvent": { label: "PIR Event", group: "Sensor Settings", type: "boolean" },

    // Snooze Settings
    "snooze": { label: "Snooze", group: "Snooze Settings", type: "boolean" },
    "snoozeTime": { label: "Snooze Time", group: "Snooze Settings", type: "number", unit: "s" },
    "snoozeStartTime": { label: "Snooze Start Time", group: "Snooze Settings", type: "text" },
    "snoozeHomebase": { label: "Snooze Homebase", group: "Snooze Settings", type: "boolean" },
    "snoozeMotion": { label: "Snooze Motion", group: "Snooze Settings", type: "boolean" },
    "snoozeStartChime": { label: "Snooze Chime", group: "Snooze Settings", type: "boolean" },

    // Streaming
    "rtspStream": { label: "RTSP Stream", group: "Streaming", type: "boolean" },
    "rtspStreamUrl": { label: "RTSP Stream URL", group: "Streaming", type: "text" },

    // Detection Statistics
    "detectionStatisticsWorkingDays": { label: "Working Days", group: "Detection Statistics", type: "number" },
    "detectionStatisticsDetectedEvents": { label: "Detected Events", group: "Detection Statistics", type: "number" },
    "detectionStatisticsRecordedEvents": { label: "Recorded Events", group: "Detection Statistics", type: "number" },

    // Door Sensors
    "doorControlWarning": { label: "Door Control Warning", group: "Door Sensors", type: "boolean" },
    "door1Open": { label: "Door 1 Open", group: "Door Sensors", type: "boolean" },
    "door2Open": { label: "Door 2 Open", group: "Door Sensors", type: "boolean" },
    "doorSensor1Status": { label: "Door Sensor 1 Status", group: "Door Sensors", type: "number" },
    "doorSensor2Status": { label: "Door Sensor 2 Status", group: "Door Sensors", type: "number" },
    "doorSensor1MacAddress": { label: "Door Sensor 1 MAC", group: "Door Sensors", type: "text" },
    "doorSensor2MacAddress": { label: "Door Sensor 2 MAC", group: "Door Sensors", type: "text" },
    "doorSensor1Name": { label: "Door Sensor 1 Name", group: "Door Sensors", type: "text" },
    "doorSensor2Name": { label: "Door Sensor 2 Name", group: "Door Sensors", type: "text" },
    "doorSensor1SerialNumber": { label: "Door Sensor 1 Serial", group: "Door Sensors", type: "text" },
    "doorSensor2SerialNumber": { label: "Door Sensor 2 Serial", group: "Door Sensors", type: "text" },
    "doorSensor1Version": { label: "Door Sensor 1 Version", group: "Door Sensors", type: "text" },
    "doorSensor2Version": { label: "Door Sensor 2 Version", group: "Door Sensors", type: "text" },
    "doorSensor1LowBattery": { label: "Door Sensor 1 Low Battery", group: "Door Sensors", type: "boolean" },
    "doorSensor2LowBattery": { label: "Door Sensor 2 Low Battery", group: "Door Sensors", type: "boolean" },
    "doorSensor1BatteryLevel": { label: "Door Sensor 1 Battery", group: "Door Sensors", type: "number", unit: "%", min: 0, max: 5 },
    "doorSensor2BatteryLevel": { label: "Door Sensor 2 Battery", group: "Door Sensors", type: "number", unit: "%", min: 0, max: 5 },

    // Location (Tracker)
    "locationCoordinates": { label: "Location Coordinates", group: "Location", type: "text" },
    "locationAddress": { label: "Location Address", group: "Location", type: "text" },
    "locationLastUpdate": { label: "Location Last Update", group: "Location", type: "number" },
    "trackerType": { label: "Tracker Type", group: "Location", type: "number" },
    "leftBehindAlarm": { label: "Left Behind Alarm", group: "Location", type: "boolean" },
    "findPhone": { label: "Find Phone", group: "Location", type: "boolean" },

    // Leaving Detection
    "leavingDetection": { label: "Leaving Detection", group: "Leaving Detection", type: "boolean" },
    "leavingReactionNotification": { label: "Reaction Notification", group: "Leaving Detection", type: "boolean" },
    "leavingReactionStartTime": { label: "Reaction Start Time", group: "Leaving Detection", type: "text" },
    "leavingReactionEndTime": { label: "Reaction End Time", group: "Leaving Detection", type: "text" },

    // Advanced Settings
    "dualCamWatchViewMode": { label: "Dual Cam Watch View Mode", group: "Advanced Settings", type: "number" },
    "defaultAngle": { label: "Default Angle", group: "Advanced Settings", type: "boolean" },
    "defaultAngleIdleTime": { label: "Default Angle Idle Time", group: "Advanced Settings", type: "number", unit: "s" },
    "autoCalibration": { label: "Auto Calibration", group: "Advanced Settings", type: "boolean" },
    "chirpVolume": { label: "Chirp Volume", group: "Advanced Settings", type: "number", min: 1, max: 26 },
    "chirpTone": { label: "Chirp Tone", group: "Advanced Settings", type: "number" },
    "powerSave": { label: "Power Save", group: "Advanced Settings", type: "boolean" },
    "interiorBrightness": { label: "Interior Brightness", group: "Advanced Settings", type: "number" },
    "interiorBrightnessDuration": { label: "Interior Brightness Duration", group: "Advanced Settings", type: "number", unit: "s", min: 5, max: 60 },

    // Station Properties
    "lanIpAddress": { label: "LAN IP Address", group: "Station Information", type: "text" },
    "macAddress": { label: "MAC Address", group: "Station Information", type: "text" },
    "guardMode": { label: "Guard Mode", group: "Station Information", type: "number" },
    "currentMode": { label: "Current Mode", group: "Station Information", type: "number" },
    "timeFormat": { label: "Time Format", group: "Station Information", type: "number" },
    "timeZone": { label: "Time Zone", group: "Station Information", type: "text" },
    "alarm": { label: "Alarm", group: "Station Alarm", type: "boolean" },
    "alarmType": { label: "Alarm Type", group: "Station Alarm", type: "number" },
    "alarmArmed": { label: "Alarm Armed", group: "Station Alarm", type: "boolean" },
    "alarmArmDelay": { label: "Alarm Arm Delay", group: "Station Alarm", type: "number", unit: "s" },
    "alarmDelay": { label: "Alarm Delay", group: "Station Alarm", type: "number", unit: "s" },
    "alarmDelayType": { label: "Alarm Delay Type", group: "Station Alarm", type: "number" },
    "alarmTone": { label: "Alarm Tone", group: "Station Alarm", type: "number" },
    "autoEndAlarm": { label: "Auto End Alarm", group: "Station Alarm", type: "boolean" },
    "turnOffAlarmWithButton": { label: "Turn Off Alarm With Button", group: "Station Alarm", type: "boolean" },
    "notificationSwitchModeSchedule": { label: "Notify Switch Mode Schedule", group: "Station Notifications", type: "boolean" },
    "notificationSwitchModeGeofence": { label: "Notify Switch Mode Geofence", group: "Station Notifications", type: "boolean" },
    "notificationSwitchModeApp": { label: "Notify Switch Mode App", group: "Station Notifications", type: "boolean" },
    "notificationSwitchModeKeypad": { label: "Notify Switch Mode Keypad", group: "Station Notifications", type: "boolean" },
    "notificationStartAlarmDelay": { label: "Notify Start Alarm Delay", group: "Station Notifications", type: "boolean" },
    "switchModeWithAccessCode": { label: "Switch Mode With Access Code", group: "Station Settings", type: "boolean" },
    "sdStatus": { label: "SD Status", group: "Station Storage", type: "number" },
    "sdCapacity": { label: "SD Capacity", group: "Station Storage", type: "number", unit: "GB" },
    "sdCapacityAvailable": { label: "SD Available", group: "Station Storage", type: "number", unit: "GB" },
    "storageInfoEmmc": { label: "Storage Info eMMC", group: "Station Storage", type: "text" },
    "storageInfoHdd": { label: "Storage Info HDD", group: "Station Storage", type: "text" },
    "crossCameraTracking": { label: "Cross Camera Tracking", group: "Station Tracking", type: "boolean" },
    "continuousTrackingTime": { label: "Continuous Tracking Time", group: "Station Tracking", type: "number", unit: "s" },
    "trackingAssistance": { label: "Tracking Assistance", group: "Station Tracking", type: "boolean" },
};

// Group display order
const GROUP_ORDER = [
    "Device Information",
    "Station Information",
    "Battery Information",
    "Network Information",
    "General Settings",
    "Video Settings",
    "Motion Detection",
    "Detection Events",
    "Sound Detection",
    "Recording Settings",
    "Audio Settings",
    "Light Settings",
    "Doorbell Settings",
    "Lock Settings",
    "Notifications",
    "Loitering Detection",
    "Delivery Guard",
    "Leaving Detection",
    "Alerts",
    "Sensor Settings",
    "Snooze Settings",
    "Streaming",
    "Detection Statistics",
    "Door Sensors",
    "Location",
    "Advanced Settings",
    "Station Alarm",
    "Station Notifications",
    "Station Settings",
    "Station Storage",
    "Station Tracking"
];

// Default pinned groups
const DEFAULT_PINNED_GROUPS = [
    "Device Information",
    "Battery Information",
    "Network Information",
];

const localStorageKeyPinnedGroups = 'eufyWebClientPinnedGroups';
const currentProperties = new Map();

/**
 * Format a property value based on its type
 */
function uiFormatPropertyValue(value, definition) {
    if (value === null || value === undefined) {
        return "-";
    }

    // Helper to escape HTML special characters to prevent XSS
    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Helper function to format boolean values as icons
    const formatBool = (val) => {
        if (val === true) return '<span class="true">✓</span>';
        if (val === false) return '<span class="false">✗</span>';
        return '-';
    };

    switch (definition.type) {
        case "boolean":
            return formatBool(value);
        case "number":
            let formattedValue = escapeHtml(value.toString());

            // Add unit if specified
            if (definition.unit) {
                formattedValue = `${formattedValue} ${escapeHtml(definition.unit)}`;
            }

            // Add range information if min/max are defined
            if (definition.min !== undefined || definition.max !== undefined) {
                let range = '<span class="value-range">';
                if (definition.min !== undefined && definition.max !== undefined) {
                    range += ` (${escapeHtml(definition.min.toString())}-${escapeHtml(definition.max.toString())})`;
                } else if (definition.min !== undefined) {
                    range += ` (min: ${escapeHtml(definition.min.toString())})`;
                } else if (definition.max !== undefined) {
                    range += ` (max: ${escapeHtml(definition.max.toString())})`;
                }
                range += '</span>';
                formattedValue += range;
            }

            return formattedValue;
        case "text":
        default:
            return escapeHtml(value.toString());
    }
}

/**
 * Create collapsible property sections grouped by category
 */
function uiCreatePropertyTable(containerId = "device-properties") {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with id '${containerId}' not found`);
        return;
    }

    // Clear existing content
    container.innerHTML = "";

    // Group properties by their category
    const groupedProperties = {};
    const headerElements = [];
    const pinnedGroups = JSON.parse(localStorage.getItem(localStorageKeyPinnedGroups)) || DEFAULT_PINNED_GROUPS;

    for (const [propName, definition] of Object.entries(PROPERTY_DEFINITIONS)) {
        const group = definition.group;
        if (!groupedProperties[group]) {
            groupedProperties[group] = [];
        }
        groupedProperties[group].push({ name: propName, ...definition });
    }

    // Create sections for each group in the defined order
    for (const groupName of GROUP_ORDER) {
        const properties = groupedProperties[groupName];
        if (!properties || properties.length === 0) continue;

        // Create section element
        const section = document.createElement("div");
        section.className = "device-info-section";
        section.dataset.group = groupName;

        // Create header
        const header = document.createElement("div");
        header.className = "device-info-header";

        const h3 = document.createElement("h3");
        const pinIcon = document.createElement("span");
        pinIcon.className = "pin-icon";
        h3.appendChild(pinIcon);
        h3.appendChild(document.createTextNode(groupName));
        header.appendChild(h3);

        const chevron = document.createElement("span");
        chevron.className = "chevron";
        header.appendChild(chevron);

        // Create content container
        const content = document.createElement("div");
        content.className = "device-info-content";

        const grid = document.createElement("div");
        grid.className = "device-info-grid";

        // Add property items
        properties.forEach(prop => {
            const item = document.createElement("div");
            item.className = "device-info-item";
            item.dataset.property = prop.name;

            // Create elements safely without innerHTML to prevent XSS
            const labelSpan = document.createElement("span");
            labelSpan.className = "device-info-label";
            labelSpan.textContent = prop.label;

            const valueSpan = document.createElement("span");
            valueSpan.className = "device-info-value";
            valueSpan.textContent = "-";

            item.appendChild(labelSpan);
            item.appendChild(valueSpan);

            grid.appendChild(item);
        });

        content.appendChild(grid);
        section.appendChild(header);
        section.appendChild(content);
        container.appendChild(section);

        headerElements.push(header);
        header.uiOpen = (state) => {
            if (pinIcon.classList.contains("pinned")) {
                state = true; // Force open if pinned
            }

            if (!state) {
                content.classList.remove("open");
                header.querySelector(".chevron").classList.remove("open");
            } else {
                content.classList.add("open");
                header.querySelector(".chevron").classList.add("open");
            }
        }

        // Add click handler for collapsing/expanding
        header.addEventListener("click", () => {
            if (pinIcon.classList.contains("pinned")) return; // Do nothing if pinned
            const isOpen = content.classList.contains("open");

            headerElements.forEach(otherHeader => {
                if (otherHeader !== header) {
                    otherHeader.uiOpen(false);
                } else {
                    otherHeader.uiOpen(!isOpen);
                }
            });
        });

        pinIcon.addEventListener("click", (event) => {
            event.stopPropagation(); // Prevent triggering the collapse/expand
            pinIcon.classList.toggle("pinned");

            // If pinned, ensure the section is open
            if (pinIcon.classList.contains("pinned")) {
                let pinnedGroups = JSON.parse(localStorage.getItem(localStorageKeyPinnedGroups)) || DEFAULT_PINNED_GROUPS;
                pinnedGroups = pinnedGroups.filter(g => g !== groupName); // Remove if already exists
                pinnedGroups.push(groupName);
                localStorage.setItem(localStorageKeyPinnedGroups, JSON.stringify(pinnedGroups));
                header.uiOpen(true);
            } else {
                // If unpinned, collapse the section
                let pinnedGroups = JSON.parse(localStorage.getItem(localStorageKeyPinnedGroups)) || DEFAULT_PINNED_GROUPS;
                pinnedGroups = pinnedGroups.filter(g => g !== groupName);
                localStorage.setItem(localStorageKeyPinnedGroups, JSON.stringify(pinnedGroups));
                header.uiOpen(false);
            }
        });

        if (pinnedGroups.includes(groupName)) {
            pinIcon.click();
        }
    }
}

/**
 * Update device properties in the UI
 */
function uiUpdateDeviceProperties(properties, isInitialLoad = false) {
    if (!properties || typeof properties !== "object") {
        console.error("Invalid properties object provided");
        return;
    }

    // If initial load, hide all properties that are not provided
    if (isInitialLoad) {
        currentProperties.clear();
        for (const [propName, definition] of Object.entries(PROPERTY_DEFINITIONS)) {
            // Find the element for this property
            const propertyItem = document.querySelector(`[data-property="${propName}"]`);

            if (propertyItem) {
                if (properties.hasOwnProperty(propName)) {
                    // Property exists - show it
                    propertyItem.style.display = "";
                } else {
                    // Property does not exist - hide it
                    propertyItem.style.display = "none";

                    // Also clear the value and remove styling
                    const propertyElement = propertyItem.querySelector(".device-info-value");
                    if (propertyElement) {
                        propertyElement.textContent = "-";

                        if (definition.type === "boolean") {
                            propertyElement.classList.remove("value-true", "value-false");
                        }
                    }
                }
            }
        }
    }

    // Update each property that has a definition and exists in the properties object
    for (const [propName, propValue] of Object.entries(properties)) {
        currentProperties.set(propName, propValue);
        const definition = PROPERTY_DEFINITIONS[propName];

        // Skip properties without definition (hidden properties or unknown properties)
        if (!definition) continue;

        // Find the property item and make sure it's visible
        const propertyItem = document.querySelector(`[data-property="${propName}"]`);
        if (propertyItem) {
            propertyItem.style.display = "";
        }

        // Find the element for this property
        const propertyElement = document.querySelector(`[data-property="${propName}"] .device-info-value`);

        if (propertyElement) {
            // Format and update the value
            const formattedValue = uiFormatPropertyValue(propValue, definition);
            propertyElement.innerHTML = formattedValue;
        }
    }

    // Hide empty sections (sections with no visible property items)
    const sections = document.querySelectorAll(".device-info-section");
    sections.forEach(section => {
        const items = section.querySelectorAll(".device-info-item");
        const hasVisibleItems = Array.from(items).some(item => {
            return item.style.display !== "none";
        });

        // Hide section if it has no visible items
        section.style.display = hasVisibleItems ? "" : "none";
    });

    uiUpdateWifiBars();
}

function uiUpdateWifiBars() {
    const wifiElement = document.getElementById("device-wifi");

    if (currentProperties.get("wifiRssi") !== undefined || currentProperties.get("wifiSignalLevel") !== undefined) {
        wifiElement.style.display = "contents";

        const wifiBars = document.getElementById("device-wifi-bars");
        if (wifiBars) {
            wifiBars.innerHTML = uiMakeWifiBars(currentProperties.get("wifiSignalLevel"), currentProperties.get("wifiRssi"));
            wifiBars.title = `${currentProperties.get("wifiRssi")} dBm`;
        }
    } else {
        wifiElement.style.display = "none";
    }
}

function uiMakeWifiBars(signalLevel, rssi) {
    let bars = 0;

    if (signalLevel !== undefined && signalLevel !== null) {
        bars = parseInt(signalLevel);
    } else if (rssi !== undefined && rssi !== null) {

        if (rssi > -60) bars = 4;
        else if (rssi > -70) bars = 3;
        else if (rssi > -80) bars = 2;
        else if (rssi > -90) bars = 1;
    }

    return `<div class="wifi-bars">
            <div class="wifi-bar${bars >= 1 ? ' active' : ''}"></div>
            <div class="wifi-bar${bars >= 2 ? ' active' : ''}"></div>
            <div class="wifi-bar${bars >= 3 ? ' active' : ''}"></div>
            <div class="wifi-bar${bars >= 4 ? ' active' : ''}"></div>
        </div>`;
};
