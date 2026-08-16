# DockDo Android App

Native Android-App (Kotlin + WebView), die als Client für deinen selbst gehosteten
DockDo-Server dient. Beim ersten Start gibst du die Server-Adresse ein
(`https://meine-domain.de` oder `http://192.168.1.5:3000`) – danach lädt die App
das komplette User-Portal. Alle Funktionen (Dashboard, Listen, Aufgaben, Suche,
Einstellungen) und dein persönliches Theme funktionieren direkt in der App.

## Voraussetzungen

- JDK 17 (installiert)
- Android SDK (am einfachsten: Android Studio installieren; SDK-Pfad wird dann
  über `ANDROID_HOME` bzw. `local.properties` gefunden)
- Kein Node/npm nötig – das Projekt ist reines Gradle

## APK bauen

**Variante 1 – Gradle (Kommandozeile):**

```
cd mobile/android
gradlew.bat assembleDebug        (Windows)
./gradlew assembleDebug           (Linux/macOS)
```

Die APK liegt danach unter:
`mobile/android/app/build/outputs/apk/debug/app-debug.apk`

Für eine signierte Release-APK `gradlew assembleRelease` (Signierung über
`app/build.gradle`/Keystore konfigurieren) – zum schnellen Selbst-Testen reicht die
Debug-APK.

**Variante 2 – Android Studio:**

1. Android Studio öffnen → „Open" → Ordner `mobile/android` wählen
2. Projekt synchronisieren lassen (lädt Gradle + Dependencies automatisch)
3. Menü Build → Build Bundle(s) / APK(s) → Build APK(s)

## Installation

- **adb:** `adb install app-debug.apk`
- **Manuell:** APK aufs Handy übertragen und antippen („Unbekannte Quellen" erlauben)

## Bedienung

- **Erster Start:** Server-Adresse eingeben → „Verbinden" → Login wie im Browser
- **Menü-Knopf** (schwebender Button unten rechts): „Neu laden", „Server wechseln", „Info"
- **Zurück-Taste:** geht innerhalb der App eine Seite zurück

## Wichtige Hinweise

- **HTTP/HTTPS:** Die App erlaubt bewusst auch `http://IP:3000` für Selbst-Hosting
  (Cleartext erlaubt). HTTPS wird empfohlen.
- **Selbstsignierte Zertifikate:** Bei TLS mit selbstsigniertem Cert fragt die App
  einmalig, ob du trotzdem fortfahren willst (nur tun, wenn du dem Server vertraust).
- **Theme:** Das Theme wird vom Server geliefert und passt sich automatisch an dein
  ausgewähltes User-Theme an.
- **Icons:** Launcher-Icons basieren auf dem User-Portal-Icon (`icon.svg`).
  Zum Austauschen einfach die PNGs in `app/src/main/res/mipmap-*` ersetzen.