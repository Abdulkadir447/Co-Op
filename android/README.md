# Co-op Mobile (Android — Kotlin 2.1.0 + Jetpack Compose + Java 17)

## Running on Windows 10 / 11

Yes — the Co-op Android app, FastAPI backend, React web app, and Electron desktop app all build and run on Windows.

### Option A: Android Studio (Recommended on Windows)
1. Install **Android Studio** (Ladybug or newer) and ensure **JDK 17** is selected under `Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK`.
2. Open the `android/` folder in Android Studio (`File → Open → ...\Co-Op\android`).
3. Android Studio automatically provisions Gradle **8.11.1** and Android SDK **35**.
4. Create/start an Android Emulator (API 26+) or plug in an Android phone with USB debugging enabled.
5. Click **Run ▶** (`app`).
   - **Quick offline tryout**: Tap **Explore Offline Demo Store** on the Sign-In screen to seed a local SQLite store immediately (no backend required).
   - **Connecting to a local Windows backend**: Start FastAPI on Windows binding to `0.0.0.0`:
     ```powershell
     .\scripts\run_windows.ps1 -Target backend
     ```
     - **Android Emulator** reaches your Windows PC at `http://10.0.2.2:8000` (the app's default debug URL).
     - **Physical phone on Wi-Fi** reaches your Windows PC at `http://<YOUR_WINDOWS_LAN_IP>:8000` (set under *Server URL* on Sign-In or Settings; debug builds allow local HTTP via `src/debug/res/xml/network_security_config.xml`).

### Option B: Windows Command Line (PowerShell)
With **JDK 17**, **Android SDK 35**, and **Gradle 8.11.1** installed:
```powershell
.\scripts\run_windows.ps1 -Target doctor
.\scripts\run_windows.ps1 -Target android-test
.\scripts\run_windows.ps1 -Target android-build
```

## CLI & Webhook Helpers (`tools/coop_cli.py`)
```powershell
python tools/coop_cli.py doctor
python tools/coop_cli.py health --api-url http://127.0.0.1:8000
python tools/coop_cli.py license issue --business-id 1 --plan professional --days 365 --seats 5
python tools/coop_cli.py webhook paystack --reference coop_test_ref_123
```
